import { describe, expect, it } from 'vitest';
import { UrlResolutionError, UrlResolverService, isBlockedAddress, validatePublicHttpUrl, type ResolverDocumentRequest, type ResolverRequest } from './UrlResolverService';

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
describe('UrlResolverService e SSRF', () => {
  it('resolve URL HTTP/HTTPS válida', async () => {
    const service = new UrlResolverService(publicLookup, async () => ({ status: 200 }));
    await expect(service.resolve('https://example.com/item?a=1')).resolves.toMatchObject({ originalUrl: 'https://example.com/item?a=1', resolvedUrl: 'https://example.com/item?a=1', redirectCount: 0 });
  });
  it('segue short URL e preserva original', async () => {
    const request: ResolverRequest = async (url) => url.hostname === 's.example.com'
      ? { status: 302, location: 'https://shopee.com.br/product/1' } : { status: 200 };
    const result = await new UrlResolverService(publicLookup, request).resolve('https://s.example.com/x');
    expect(result).toMatchObject({ originalUrl: 'https://s.example.com/x', resolvedUrl: 'https://shopee.com.br/product/1', redirectCount: 1 });
  });
  it('bloqueia loop e limite de redirects', async () => {
    const loop: ResolverRequest = async (url) => ({ status: 302, location: url.hostname === 'a.example.com' ? 'https://b.example.com' : 'https://a.example.com' });
    await expect(new UrlResolverService(publicLookup, loop).resolve('https://a.example.com')).rejects.toMatchObject({ code: 'REDIRECT_LOOP' });
    const endless: ResolverRequest = async (url) => ({ status: 302, location: `https://r${Number(url.hostname.slice(1,2) || 0)+1}.example.com` });
    await expect(new UrlResolverService(publicLookup, endless, 100, 1).resolve('https://r0.example.com')).rejects.toMatchObject({ code: 'REDIRECT_LIMIT' });
  });
  it.each(['http://localhost/x','http://127.0.0.1/x','ftp://example.com/x','file:///etc/passwd'])(`bloqueia %s`, (url) => {
    expect(() => validatePublicHttpUrl(url)).toThrow(UrlResolutionError);
  });
  it('bloqueia IP privado retornado pelo DNS e também após redirect', async () => {
    const privateLookup = async (host: string) => [{ address: host === 'safe.example.com' ? '93.184.216.34' : '10.0.0.8', family: 4 }];
    const redirect: ResolverRequest = async () => ({ status: 302, location: 'https://internal.example.com/admin' });
    await expect(new UrlResolverService(privateLookup, redirect).resolve('https://safe.example.com')).rejects.toMatchObject({ code: 'SSRF_BLOCKED' });
    expect(isBlockedAddress('192.168.1.20')).toBe(true); expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });
  it('lê documento HTML usando o endereço DNS já validado', async () => {
    const documentRequest: ResolverDocumentRequest = async (url) => ({ status: 200, contentType: 'text/html; charset=utf-8', body: `<a href="${url.toString()}">produto</a>` });
    await expect(new UrlResolverService(publicLookup, async () => ({ status: 200 }), 8_000, 5, documentRequest).fetchDocument('https://example.com/profile')).resolves.toMatchObject({ status: 200, contentType: 'text/html; charset=utf-8' });
  });
});
