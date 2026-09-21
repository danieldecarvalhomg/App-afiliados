import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreDirectClient } from './MercadoLivreDirectClient';

const credentials = {
  appId: 'mercado-livre-session', secret: 'mercado-livre-session-v1',
  sessionCookie: 'session=abc123; affiliate=xyz789', trackingTag: 'principal',
};

describe('MercadoLivreDirectClient', () => {
  it('valida a sessão e a etiqueta sem expor o cookie na URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ tags: [{ tag: 'principal', in_use: true }] }), { status: 200 }));
    await new MercadoLivreDirectClient(fetcher as typeof fetch, 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates').validate(credentials);
    expect(fetcher).toHaveBeenCalledWith(expect.stringMatching(/\/getTags$/u), expect.objectContaining({
      headers: expect.objectContaining({ cookie: credentials.sessionCookie, 'x-custom-origin': 'https://www.mercadolivre.com.br' }),
    }));
    expect(String((fetcher as any).mock.calls[0][0])).not.toContain('session=');
  });

  it('gera lote usando a etiqueta sincronizada da conta', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tags: [{ tag: 'principal', in_use: true }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { urls: [
        { short_url: 'https://meli.la/abc123' }, { short_url: 'https://meli.la/def456' },
      ] } }), { status: 200 }));
    const result = await new MercadoLivreDirectClient(fetcher as typeof fetch).createAffiliateLinks(credentials, [
      'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM',
      'https://produto.mercadolivre.com.br/MLB-9876543210-produto-_JM',
    ], 'promofy_manual');
    expect(result).toEqual({ urls: ['https://meli.la/abc123', 'https://meli.la/def456'], trackingTag: 'principal' });
    expect(fetcher).toHaveBeenLastCalledWith(expect.stringMatching(/\/createLink$/u), expect.objectContaining({
      body: expect.stringContaining('"tag":"principal"'),
    }));
  });

  it('classifica sessão expirada sem retry cego', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }));
    await expect(new MercadoLivreDirectClient(fetcher as typeof fetch).validate(credentials)).rejects.toMatchObject({ code: 'AUTH_REQUIRED', transient: false });
  });

  it('não apaga uma sessão válida por um bloqueio 403 transitório do servidor', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }));
    await expect(new MercadoLivreDirectClient(fetcher as typeof fetch).validate(credentials))
      .rejects.toMatchObject({ code: 'TEMPORARY_ERROR', transient: true });
  });
});
