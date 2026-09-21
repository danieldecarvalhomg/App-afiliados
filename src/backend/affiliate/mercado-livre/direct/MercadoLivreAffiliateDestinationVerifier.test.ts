import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreAffiliateDestinationVerifier } from './MercadoLivreAffiliateDestinationVerifier';

const source = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';

describe('MercadoLivreAffiliateDestinationVerifier', () => {
  it('aceita saída meli.la para uma origem meli.la sem consultar o CDN', async () => {
    const fetcher = vi.fn();
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch)
      .verify('https://meli.la/origem123', 'https://meli.la/novo123'))
      .resolves.toBe('https://meli.la/novo123');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aceita o meli.la devolvido pela API sem consultar o CDN', async () => {
    const fetcher = vi.fn();
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch).verify(source, 'https://meli.la/abc123'))
      .resolves.toBe('https://meli.la/abc123');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('aceita catálogo MLBU quando o Mercado Livre escolhe um anúncio MLB concreto', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://produto.mercadolivre.com.br/MLB-4598994322-produto-_JM?matt_word=principal' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const universal = 'https://www.mercadolivre.com.br/lavadora/up/MLBU605239077';
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch).verify(universal, 'https://meli.la/abc123'))
      .resolves.toBe('https://meli.la/abc123');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
