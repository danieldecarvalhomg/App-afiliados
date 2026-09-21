import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

export type UrlResolutionErrorCode = 'INVALID_URL' | 'SSRF_BLOCKED' | 'REDIRECT_LOOP' | 'REDIRECT_LIMIT' | 'RESOLUTION_TIMEOUT' | 'RESOLUTION_FAILED';
export class UrlResolutionError extends Error {
  constructor(public readonly code: UrlResolutionErrorCode, message: string, public readonly transient = false) { super(message); }
}
export interface UrlResolutionResult { originalUrl: string; resolvedUrl: string; redirectCount: number; resolvedAt: string; }
export interface ResolverAddress { address: string; family: number; }
export type ResolverLookup = (hostname: string) => Promise<ResolverAddress[]>;
export type ResolverRequest = (url: URL, address: ResolverAddress, timeoutMs: number) => Promise<{ status: number; location?: string }>;
export type ResolverDocumentRequest = (url: URL, address: ResolverAddress, timeoutMs: number, maxBytes: number) => Promise<{ status: number; contentType?: string; body: string }>;

const BROWSER_NAVIGATION_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'sec-fetch-user': '?1',
  'upgrade-insecure-requests': '1',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
} as const;

function blockedIpv4(address: string): boolean {
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a,b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 168 || b === 0))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}
function blockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('::ffff:')) return blockedIpv4(normalized.slice(7));
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
    || (first & 0xff00) === 0xff00 || normalized.startsWith('2001:db8:');
}
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? blockedIpv4(address) : family === 6 ? blockedIpv6(address) : true;
}
export function validatePublicHttpUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UrlResolutionError('INVALID_URL', 'URL inválida.'); }
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) {
    throw new UrlResolutionError('INVALID_URL', 'Somente URLs HTTP/HTTPS sem credenciais são aceitas.');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host === 'metadata.google.internal') {
    throw new UrlResolutionError('SSRF_BLOCKED', 'Destino local ou de metadados bloqueado.');
  }
  if (isIP(host) && isBlockedAddress(host)) throw new UrlResolutionError('SSRF_BLOCKED', 'Endereço de rede privado ou reservado bloqueado.');
  return url;
}

const realLookup: ResolverLookup = async (hostname) => {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) }];
  return dnsLookup(hostname, { all: true, verbatim: true });
};
const realRequest: ResolverRequest = (url, target, timeoutMs) => new Promise((resolve, reject) => {
  const transport = url.protocol === 'https:' ? https : http;
  const req = transport.request({
    protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
    path: `${url.pathname}${url.search}`, method: 'GET', headers: BROWSER_NAVIGATION_HEADERS,
    // Node 20+ pode solicitar lookup com `all: true`. Respeitar o formato
    // evita uma nova resolução DNS e mantém o endereço já validado/pinado.
    lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
      if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
      else callback(null, target.address, target.family as 4 | 6);
    }) as any,
  }, (response) => {
    const status = response.statusCode ?? 0;
    const location = typeof response.headers.location === 'string' ? response.headers.location : undefined;
    response.destroy(); resolve({ status, location });
  });
  req.setTimeout(timeoutMs, () => req.destroy(new UrlResolutionError('RESOLUTION_TIMEOUT', 'Tempo limite ao resolver URL.', true)));
  req.on('error', (error) => reject(error)); req.end();
});

const realDocumentRequest: ResolverDocumentRequest = (url, target, timeoutMs, maxBytes) => new Promise((resolve, reject) => {
  const transport = url.protocol === 'https:' ? https : http;
  const req = transport.request({
    protocol: url.protocol, hostname: url.hostname, port: url.port || undefined,
    path: `${url.pathname}${url.search}`, method: 'GET',
    headers: BROWSER_NAVIGATION_HEADERS,
    lookup: ((_hostname: string, options: { all?: boolean }, callback: (...args: any[]) => void) => {
      if (options?.all) callback(null, [{ address: target.address, family: target.family }]);
      else callback(null, target.address, target.family as 4 | 6);
    }) as any,
  }, (response) => {
    const status = response.statusCode ?? 0;
    const contentType = typeof response.headers['content-type'] === 'string' ? response.headers['content-type'] : undefined;
    if (status < 200 || status >= 300) {
      response.resume();
      response.once('end', () => resolve({ status, contentType, body: '' }));
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      size += Buffer.byteLength(chunk, 'utf8');
      if (size > maxBytes) {
        response.destroy(new UrlResolutionError('RESOLUTION_FAILED', 'Documento remoto excede o limite permitido.'));
        return;
      }
      chunks.push(Buffer.from(chunk, 'utf8'));
    });
    response.on('end', () => resolve({ status, contentType, body: Buffer.concat(chunks).toString('utf8') }));
    response.on('error', reject);
  });
  req.setTimeout(timeoutMs, () => req.destroy(new UrlResolutionError('RESOLUTION_TIMEOUT', 'Tempo limite ao ler o documento.', true)));
  req.on('error', reject);
  req.end();
});

export class UrlResolverService {
  constructor(
    private readonly lookup: ResolverLookup = realLookup,
    private readonly request: ResolverRequest = realRequest,
    private readonly timeoutMs = 8_000,
    private readonly maxRedirects = 5,
    private readonly documentRequest: ResolverDocumentRequest = realDocumentRequest,
  ) {}

  async fetchDocument(rawUrl: string, maxBytes = 2_000_000): Promise<{ status: number; contentType: string | null; body: string }> {
    const url = validatePublicHttpUrl(rawUrl);
    const addresses = await this.lookup(url.hostname).catch(() => { throw new UrlResolutionError('RESOLUTION_FAILED', 'Falha ao resolver DNS.', true); });
    if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
      throw new UrlResolutionError('SSRF_BLOCKED', 'O destino resolve para rede privada ou reservada.');
    }
    try {
      const result = await this.documentRequest(url, addresses[0], this.timeoutMs, maxBytes);
      return { status: result.status, contentType: result.contentType ?? null, body: result.body };
    } catch (error) {
      if (error instanceof UrlResolutionError) throw error;
      throw new UrlResolutionError('RESOLUTION_FAILED', 'Não foi possível ler o documento remoto.', true);
    }
  }

  async resolve(originalUrl: string): Promise<UrlResolutionResult> {
    let current = validatePublicHttpUrl(originalUrl);
    const seen = new Set<string>();
    for (let redirects = 0; redirects <= this.maxRedirects; redirects += 1) {
      const canonical = current.toString();
      if (seen.has(canonical)) throw new UrlResolutionError('REDIRECT_LOOP', 'Loop de redirecionamento detectado.');
      seen.add(canonical);
      const addresses = await this.lookup(current.hostname).catch(() => { throw new UrlResolutionError('RESOLUTION_FAILED', 'Falha ao resolver DNS.', true); });
      if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
        throw new UrlResolutionError('SSRF_BLOCKED', 'O destino resolve para rede privada ou reservada.');
      }
      let response: { status: number; location?: string };
      try { response = await this.request(current, addresses[0], this.timeoutMs); }
      catch (error) {
        if (error instanceof UrlResolutionError) throw error;
        throw new UrlResolutionError('RESOLUTION_FAILED', 'Não foi possível acessar a URL.', true);
      }
      if (response.status >= 300 && response.status < 400) {
        if (!response.location) throw new UrlResolutionError('RESOLUTION_FAILED', 'Redirect sem destino.');
        if (redirects === this.maxRedirects) throw new UrlResolutionError('REDIRECT_LIMIT', 'Limite de redirects excedido.');
        current = validatePublicHttpUrl(new URL(response.location, current).toString());
        continue;
      }
      if (response.status >= 500 || response.status === 0) throw new UrlResolutionError('RESOLUTION_FAILED', 'Destino indisponível.', true);
      return { originalUrl, resolvedUrl: current.toString(), redirectCount: redirects, resolvedAt: new Date().toISOString() };
    }
    throw new UrlResolutionError('REDIRECT_LIMIT', 'Limite de redirects excedido.');
  }
}
