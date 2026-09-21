import { resolvePlatform } from '../../../domain/affiliate/PlatformResolver';
import { isMercadoLivreProductUrl, normalizeMercadoLivreProductUrl } from './AffiliateLinkValidator';
import type { UrlResolverService } from '../UrlResolverService';

const SOCIAL_PROFILE_ROUTE = /^\/social(?:\/|$)/iu;
const MERCADO_LIVRE_SHORT_HOST = 'meli.la';

export interface MercadoLivreRemoteProductResolver {
  recoverProductUrl(userId: string, sourceUrl: string): Promise<string | null>;
}

function decodeMarkup(value: string): string {
  return value
    .replace(/\\u002F/gu, '/')
    .replace(/\\u0026/gu, '&')
    .replace(/\\\//gu, '/')
    .replace(/&amp;/gu, '&')
    .replace(/&#x2F;/giu, '/');
}

/** Extracts product links in document order; the first one is the profile's featured product. */
export function extractMercadoLivreProductUrls(html: string): string[] {
  const decoded = decodeMarkup(html);
  const matches = decoded.match(/(?:(?:https?:)?\/\/)?(?:[A-Za-z0-9-]+\.)*mercadolivre\.com\.br\/[^"'<>\\\s]+/giu) ?? [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of matches) {
    const candidate = /^https?:\/\//iu.test(raw) ? raw : raw.startsWith('//') ? `https:${raw}` : `https://${raw}`;
    if (!isMercadoLivreProductUrl(candidate)) continue;
    try {
      const normalized = normalizeMercadoLivreProductUrl(candidate);
      if (!seen.has(normalized)) { seen.add(normalized); urls.push(normalized); }
    } catch { /* links in scripts are untrusted input */ }
  }
  return urls;
}

export class MercadoLivreLinkRecoveryService {
  constructor(
    private readonly resolver: Pick<UrlResolverService, 'fetchDocument'> & Partial<Pick<UrlResolverService, 'resolve'>>,
    private readonly remote?: MercadoLivreRemoteProductResolver,
  ) {}

  async recover(resolvedUrl: string, userId?: string): Promise<{ productUrl: string; candidates: string[] } | null> {
    let parsed: URL;
    try { parsed = new URL(resolvedUrl); } catch { return null; }
    let socialProfile = SOCIAL_PROFILE_ROUTE.test(parsed.pathname);
    const shortLink = parsed.hostname.toLowerCase() === MERCADO_LIVRE_SHORT_HOST;
    if (resolvePlatform(parsed.toString()) !== 'mercado_livre' || (!socialProfile && !shortLink)) return null;
    if (shortLink && this.resolver.resolve) {
      try {
        const redirected = await this.resolver.resolve(parsed.toString());
        if (isMercadoLivreProductUrl(redirected.resolvedUrl)) {
          const productUrl = normalizeMercadoLivreProductUrl(redirected.resolvedUrl);
          return { productUrl, candidates: [productUrl] };
        }
        parsed = new URL(redirected.resolvedUrl);
        socialProfile = resolvePlatform(parsed.toString()) === 'mercado_livre'
          && SOCIAL_PROFILE_ROUTE.test(parsed.pathname);
      } catch {
        // O fallback remoto abaixo continua disponível quando o CDN não
        // entrega o redirecionamento ao cliente HTTP.
      }
    }
    if (socialProfile) {
      try {
        const document = await this.resolver.fetchDocument(parsed.toString());
        if (document.status >= 200 && document.status < 300 && (!document.contentType || /html|xhtml/iu.test(document.contentType))) {
          const candidates = extractMercadoLivreProductUrls(document.body);
          if (candidates.length) return { productUrl: candidates[0], candidates };
        }
      } catch {
        // A página social é dinâmica e pode bloquear clientes HTTP. O navegador
        // remoto abaixo é o fallback autorizado, não um bypass de autenticação.
      }
    }
    if (!userId || !this.remote) return null;
    const productUrl = await this.remote.recoverProductUrl(userId, parsed.toString()).catch(() => null);
    return productUrl ? { productUrl, candidates: [productUrl] } : null;
  }
}
