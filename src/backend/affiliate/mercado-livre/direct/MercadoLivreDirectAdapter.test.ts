import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreDirectAdapter } from './MercadoLivreDirectAdapter';

const first = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';
const second = 'https://produto.mercadolivre.com.br/MLB-9876543210-produto-_JM';
const credentials = {
  appId: 'mercado-livre-session', secret: 'mercado-livre-session-v1',
  sessionCookie: 'session=abc123; affiliate=xyz789', trackingTag: 'principal',
};

describe('MercadoLivreDirectAdapter', () => {
  it('agrupa conversões, valida resultados e grava o cache persistente', async () => {
    const client = {
      configured: () => true,
      createAffiliateLinks: vi.fn(async (_credentials, urls: string[]) => ({
        trackingTag: 'principal', urls: urls.map((url) => url.includes('1234567890') ? 'https://meli.la/abc123' : 'https://meli.la/def456'),
      })),
    };
    const cache = { findCachedAffiliateLink: vi.fn(async () => null), saveCachedAffiliateLink: vi.fn(async () => undefined) };
    const verifier = { verify: vi.fn(async (_source: string, candidate: string) => candidate) };
    const adapter = new MercadoLivreDirectAdapter(client as any, cache, verifier as any);
    const results = await Promise.all([
      adapter.generate('user-a', 'account-a', first, credentials),
      adapter.generate('user-a', 'account-a', second, credentials),
    ]);
    expect(client.createAffiliateLinks).toHaveBeenCalledOnce();
    expect(client.createAffiliateLinks.mock.calls[0][1]).toHaveLength(2);
    expect(results.map((item) => item.provider)).toEqual(['mercado_livre_unofficial_v1', 'mercado_livre_unofficial_v1']);
    expect(cache.saveCachedAffiliateLink).toHaveBeenCalledTimes(2);
  });

  it('reutiliza cache persistente sem chamar o endpoint de geração', async () => {
    const client = { configured: () => true, createAffiliateLinks: vi.fn() };
    const cache = { findCachedAffiliateLink: vi.fn(async () => 'https://meli.la/cache123'), saveCachedAffiliateLink: vi.fn() };
    const verifier = { verify: vi.fn(async (_source: string, candidate: string) => candidate) };
    const result = await new MercadoLivreDirectAdapter(client as any, cache, verifier as any)
      .generate('user-a', 'account-a', first, credentials);
    expect(result).toMatchObject({ affiliateUrl: 'https://meli.la/cache123', cached: true });
    expect(client.createAffiliateLinks).not.toHaveBeenCalled();
  });

  it('envia links meli.la do monitor diretamente ao backend', async () => {
    const shortUrl = 'https://meli.la/2FdaeDB';
    const client = {
      configured: () => true,
      createAffiliateLinks: vi.fn(async (_credentials, urls: string[]) => ({
        trackingTag: 'principal', urls: urls.map(() => 'https://meli.la/novo123'),
      })),
    };
    const verifier = { verify: vi.fn(async (_source: string, candidate: string) => candidate) };
    const adapter = new MercadoLivreDirectAdapter(client as any, null, verifier as any);

    await expect(adapter.generate('user-a', 'account-a', shortUrl, credentials)).resolves.toMatchObject({
      affiliateUrl: 'https://meli.la/novo123', itemId: null,
    });
    expect(client.createAffiliateLinks).toHaveBeenCalledWith(credentials, [shortUrl], 'principal');
  });
});
