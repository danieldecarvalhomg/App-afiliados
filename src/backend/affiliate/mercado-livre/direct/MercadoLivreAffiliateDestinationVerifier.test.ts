import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreAffiliateDestinationVerifier } from './MercadoLivreAffiliateDestinationVerifier';

const source = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';

describe('MercadoLivreAffiliateDestinationVerifier', () => {
  it('resolve meli.la e confirma que o produto final é o mesmo', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM?matt_word=principal&matt_tool=123' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch).verify(source, 'https://meli.la/abc123'))
      .resolves.toBe('https://meli.la/abc123');
  });

  it('rejeita link curto que redireciona para outro produto', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://produto.mercadolivre.com.br/MLB-9999999999-outro-_JM?matt_word=principal' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch).verify(source, 'https://meli.la/abc123'))
      .rejects.toMatchObject({ code: 'LINK_VALIDATION_FAILED' });
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
  });

  it('rejeita redirecionamento de um catálogo MLBU para outro catálogo', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: 'https://www.mercadolivre.com.br/outro/up/MLBU999999999?matt_word=principal' },
      }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const universal = 'https://www.mercadolivre.com.br/lavadora/up/MLBU605239077';
    await expect(new MercadoLivreAffiliateDestinationVerifier(fetcher as typeof fetch).verify(universal, 'https://meli.la/abc123'))
      .rejects.toMatchObject({ code: 'LINK_VALIDATION_FAILED' });
  });
});
