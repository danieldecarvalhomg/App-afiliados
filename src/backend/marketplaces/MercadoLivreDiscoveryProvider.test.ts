import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreDiscoveryProvider } from './MercadoLivreDiscoveryProvider';

describe('MercadoLivreDiscoveryProvider', () => {
  it('valida a conta autenticada e normaliza o catálogo oficial', async () => {
    const fetcher = (async (url: string | URL | Request) => String(url).endsWith('/users/me')
      ? new Response(JSON.stringify({ id: 1 }), { status: 200 })
      : new Response(JSON.stringify({ results: [{ id: 'MLB123', title: 'Oferta', permalink: 'https://produto.mercadolivre.com.br/MLB-123', price: 80, original_price: 100, thumbnail: 'http://img.test/a.jpg', shipping: { free_shipping: true } }], paging: { total: 1 } }), { status: 200 })) as typeof fetch;
    const provider = new MercadoLivreDiscoveryProvider(fetcher);
    await expect(provider.validate({ appId: 'id', secret: 'secret-123', accessToken: 'token' })).resolves.toBeUndefined();
    await expect(provider.getDeals({ credentials: { appId: 'id', secret: 'secret-123', accessToken: 'token' } })).resolves.toMatchObject({ deals: [{ marketplace: 'mercado_livre', externalProductId: 'MLB123', price: 80, originalPrice: 100, discountPercent: 20, freeShipping: true }] });
  });

  it('renova o OAuth expirado e repete a consulta sem intervenção', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'novo-access', refresh_token: 'novo-refresh' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [], paging: { total: 0 } }), { status: 200 }));
    const credentials = { appId: 'app', secret: 'secret-123', accessToken: 'expirado', refreshToken: 'refresh' };
    const provider = new MercadoLivreDiscoveryProvider(fetcher);
    await expect(provider.getDeals({ credentials })).resolves.toMatchObject({ deals: [] });
    expect(credentials).toMatchObject({ accessToken: 'novo-access', refreshToken: 'novo-refresh' });
    expect(fetcher.mock.calls[1]?.[0]).toContain('/oauth/token');
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ headers: { authorization: 'Bearer novo-access' } });
  });

  it('usa a Central de Afiliados remota quando a busca oficial é bloqueada por política', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'policy' }), { status: 403 }));
    const remote = { discoverDeals: vi.fn(async () => [{ marketplace: 'mercado_livre' as const, externalProductId: 'MLB123456', title: 'Oferta remota', productUrl: 'https://produto.mercadolivre.com.br/MLB-123456', discoveredAt: new Date().toISOString() }]) };
    const provider = new MercadoLivreDiscoveryProvider(fetcher, 'https://api.mercadolibre.com', remote);
    await expect(provider.getDeals({ userId: 'user-a', credentials: { appId: 'id', secret: 'secret', accessToken: 'token' }, limit: 24 }))
      .resolves.toMatchObject({ deals: [{ title: 'Oferta remota' }], hasNextPage: false });
    expect(remote.discoverDeals).toHaveBeenCalledWith('user-a', 40, false);
  });

  it('compartilha uma única leitura remota entre contas sem compartilhar a conversão', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'policy' }), { status: 403 }));
    const remote = { discoverDeals: vi.fn(async () => [{ marketplace: 'mercado_livre' as const, externalProductId: 'MLB123456', title: 'Oferta compartilhada', productUrl: 'https://produto.mercadolivre.com.br/MLB-123456', discoveredAt: new Date().toISOString() }]) };
    const provider = new MercadoLivreDiscoveryProvider(fetcher, 'https://api.mercadolibre.com', remote);
    const credentials = { appId: 'id', secret: 'secret', accessToken: 'token' };

    const [first, second] = await Promise.all([
      provider.getDeals({ userId: 'user-a', credentials, limit: 24 }),
      provider.getDeals({ userId: 'user-b', credentials, limit: 24, forceRefresh: true }),
    ]);

    expect(first.deals[0]?.title).toBe('Oferta compartilhada');
    expect(second.deals[0]?.title).toBe('Oferta compartilhada');
    expect(remote.discoverDeals).toHaveBeenCalledTimes(1);
  });
});
