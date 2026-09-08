import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isBlockedAddress, validatePublicHttpUrl } from '../affiliate/UrlResolverService';

const MAX_HTML_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12_000;

const MARKETPLACE_HOSTS = {
  Amazon: ['amazon.com.br', 'amzn.to', 'a.co'],
  Shopee: ['shopee.com.br'],
  'Mercado Livre': ['mercadolivre.com.br', 'mercadolivre.com', 'mercado.li'],
  AliExpress: ['aliexpress.com'],
  Magalu: ['magazineluiza.com.br', 'magalu.com', 'mglu.io'],
} as const;

export type MarketplaceName = keyof typeof MARKETPLACE_HOSTS;

export interface MarketplacePageEvidence {
  requestedUrl: string;
  finalUrl: string;
  marketplace: MarketplaceName | 'Other';
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  rating: number | null;
  reviewsCount: number | null;
  visibleText: string;
}

export class MarketplacePageError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function marketplaceFor(hostname: string): MarketplaceName | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  for (const [marketplace, domains] of Object.entries(MARKETPLACE_HOSTS)) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return marketplace as MarketplaceName;
    }
  }
  return null;
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 ? String.fromCodePoint(point) : ' ';
    }
    return named[entity.toLowerCase()] ?? ' ';
  });
}

function clean(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function number(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;
  const raw = value.trim().replace(/[^\d,.-]/g, '');
  if (!raw) return null;
  const normalized = raw.includes(',') && raw.lastIndexOf(',') > raw.lastIndexOf('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function meta(html: string, keys: string[]): string | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return clean(match[1], 2_000);
    }
  }
  return null;
}

function findProduct(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProduct(item);
      if (found) return found;
    }
    return null;
  }
  const row = value as Record<string, unknown>;
  const type = row['@type'];
  if (type === 'Product' || (Array.isArray(type) && type.includes('Product'))) return row;
  for (const nested of Object.values(row)) {
    const found = findProduct(nested);
    if (found) return found;
  }
  return null;
}

function jsonLdProduct(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const script of scripts) {
    try {
      const found = findProduct(JSON.parse(decodeEntities(script[1]).trim()));
      if (found) return found;
    } catch {
      // Marketplaces frequentemente publicam blocos JSON-LD parciais; tente o próximo.
    }
  }
  return null;
}

function firstOffer(product: Record<string, unknown> | null): Record<string, unknown> | null {
  const offers = product?.offers;
  if (Array.isArray(offers)) return (offers.find((item) => item && typeof item === 'object') as Record<string, unknown>) ?? null;
  return offers && typeof offers === 'object' ? offers as Record<string, unknown> : null;
}

function absoluteUrl(value: unknown, base: URL): string | null {
  const raw = clean(value, 4_096);
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function visibleText(html: string): string {
  return decodeEntities(html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20_000);
}

async function download(raw: string, redirects = 0, seen = new Set<string>(), requireMarketplace = true): Promise<{ html: string; finalUrl: URL }> {
  if (redirects > MAX_REDIRECTS) throw new MarketplacePageError('MARKETPLACE_REDIRECT_LIMIT');
  const url = validatePublicHttpUrl(raw);
  if (requireMarketplace && !marketplaceFor(url.hostname)) throw new MarketplacePageError('UNSUPPORTED_MARKETPLACE_URL');
  if (seen.has(url.toString())) throw new MarketplacePageError('MARKETPLACE_REDIRECT_LOOP');
  seen.add(url.toString());

  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new MarketplacePageError('MARKETPLACE_SSRF_BLOCKED');
  }
  const address = addresses[0];

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; AfiliHubOfferExtractor/1.0)',
        accept: 'text/html,application/xhtml+xml;q=0.9',
        'accept-language': 'pt-BR,pt;q=0.9',
        'accept-encoding': 'identity',
      },
      lookup: ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
        if (options?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      }) as never,
    }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        response.destroy();
        const location = response.headers.location;
        if (!location) return reject(new MarketplacePageError('MARKETPLACE_REDIRECT_INVALID'));
        void download(new URL(location, url).toString(), redirects + 1, seen, requireMarketplace).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        return reject(new MarketplacePageError(status === 403 || status === 429 ? 'MARKETPLACE_ACCESS_BLOCKED' : 'MARKETPLACE_FETCH_FAILED'));
      }
      const contentType = String(response.headers['content-type'] ?? '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        response.destroy();
        return reject(new MarketplacePageError('MARKETPLACE_CONTENT_NOT_HTML'));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_HTML_BYTES) response.destroy(new MarketplacePageError('MARKETPLACE_PAGE_TOO_LARGE'));
        else chunks.push(chunk);
      });
      response.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8'), finalUrl: url }));
      response.on('error', reject);
    });
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new MarketplacePageError('MARKETPLACE_FETCH_TIMEOUT')));
    req.on('error', reject);
    req.end();
  });
}

function extractOfferEvidence(html: string, finalUrlValue: string, requestedUrl = finalUrlValue, requireMarketplace = true): MarketplacePageEvidence {
  const finalUrl = validatePublicHttpUrl(finalUrlValue);
  const marketplace = marketplaceFor(finalUrl.hostname);
  if (requireMarketplace && !marketplace) throw new MarketplacePageError('UNSUPPORTED_MARKETPLACE_URL');
  const product = jsonLdProduct(html);
  const offer = firstOffer(product);
  const aggregate = product?.aggregateRating && typeof product.aggregateRating === 'object'
    ? product.aggregateRating as Record<string, unknown>
    : null;
  const image = Array.isArray(product?.image) ? product?.image[0] : product?.image;
  const htmlTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  return {
    requestedUrl,
    finalUrl: finalUrl.toString(),
    marketplace: marketplace ?? 'Other',
    title: clean(product?.name) ?? meta(html, ['og:title', 'twitter:title']) ?? clean(htmlTitle),
    description: clean(product?.description, 2_000) ?? meta(html, ['og:description', 'description']),
    imageUrl: absoluteUrl(image, finalUrl) ?? absoluteUrl(meta(html, ['og:image', 'twitter:image']), finalUrl),
    price: number(offer?.price ?? offer?.lowPrice ?? meta(html, ['product:price:amount', 'og:price:amount'])),
    originalPrice: number(offer?.highPrice ?? meta(html, ['product:original_price:amount'])),
    rating: number(aggregate?.ratingValue),
    reviewsCount: number(aggregate?.reviewCount ?? aggregate?.ratingCount),
    visibleText: visibleText(html),
  };
}

export function extractLinkPreviewEvidence(html: string, finalUrlValue: string, requestedUrl = finalUrlValue): MarketplacePageEvidence {
  return extractOfferEvidence(html, finalUrlValue, requestedUrl, false);
}

export function extractMarketplaceOfferEvidence(html: string, finalUrlValue: string, requestedUrl = finalUrlValue): MarketplacePageEvidence {
  return extractOfferEvidence(html, finalUrlValue, requestedUrl, true);
}

export async function fetchMarketplaceOfferPage(requestedUrl: string): Promise<MarketplacePageEvidence> {
  const { html, finalUrl } = await download(requestedUrl, 0, new Set<string>(), true);
  return extractOfferEvidence(html, finalUrl.toString(), requestedUrl, true);
}

/**
 * Extrai metadados Open Graph/JSON-LD de qualquer página pública. O pipeline
 * de afiliados continua usando fetchMarketplaceOfferPage (restrito), enquanto
 * previews de envio podem atender marketplaces novos ou links de loja que
 * ainda não estão no catálogo conhecido.
 */
export async function fetchLinkPreviewPage(requestedUrl: string): Promise<MarketplacePageEvidence> {
  const { html, finalUrl } = await download(requestedUrl, 0, new Set<string>(), false);
  return extractOfferEvidence(html, finalUrl.toString(), requestedUrl, false);
}
