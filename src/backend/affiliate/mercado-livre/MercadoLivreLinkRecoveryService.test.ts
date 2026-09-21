import { describe, expect, it, vi } from 'vitest';
import { extractMercadoLivreProductUrls, MercadoLivreLinkRecoveryService } from './MercadoLivreLinkRecoveryService';

const profile = 'https://www.mercadolivre.com.br/social/danielguimaraes';
const featured = 'https://www.mercadolivre.com.br/camisa-casual-masculina-texturizada/up/MLBU3776074237?pdp_filters=item_id%3AMLB3776074237&matt_word=promofy';

describe('MercadoLivreLinkRecoveryService', () => {
  it('extrai o primeiro produto destacado de uma página social', () => {
    const html = `<script>"url":"${featured.replaceAll('/', '\\u002F')}"</script><a href="https://www.mercadolivre.com.br/p/MLB9999999">outro</a>`;
    expect(extractMercadoLivreProductUrls(html)).toEqual([featured, 'https://www.mercadolivre.com.br/p/MLB9999999']);
  });
  it('recupera o produto antes de enviar para o conversor', async () => {
    const resolver = { fetchDocument: async () => ({ status: 200, contentType: 'text/html', body: `<a href="${featured}">Ir para produto</a>` }) };
    await expect(new MercadoLivreLinkRecoveryService(resolver).recover(profile)).resolves.toMatchObject({ productUrl: featured });
  });
  it('ignora páginas que não são perfil social', async () => {
    const resolver = { fetchDocument: async () => ({ status: 200, contentType: 'text/html', body: `<a href="${featured}">produto</a>` }) };
    await expect(new MercadoLivreLinkRecoveryService(resolver).recover(featured)).resolves.toBeNull();
  });
  it('usa o navegador remoto quando o HTML inicial não contém o destino', async () => {
    const resolver = { fetchDocument: async () => ({ status: 200, contentType: 'text/html', body: '<button>Ir para produto</button>' }) };
    const remote = { recoverProductUrl: async (userId: string, sourceUrl: string) => {
      expect(userId).toBe('user-1');
      expect(sourceUrl).toBe(profile);
      return featured;
    } };
    await expect(new MercadoLivreLinkRecoveryService(resolver, remote).recover(profile, 'user-1'))
      .resolves.toEqual({ productUrl: featured, candidates: [featured] });
  });

  it('envia links curtos meli.la ao navegador remoto quando o redirect depende de JavaScript', async () => {
    const remote = { recoverProductUrl: vi.fn().mockResolvedValue('https://produto.mercadolivre.com.br/MLB-1234567-produto') };
    const resolver = { fetchDocument: vi.fn() };
    const service = new MercadoLivreLinkRecoveryService(resolver as any, remote);
    await expect(service.recover('https://meli.la/13eXLrm', 'user-1')).resolves.toEqual({
      productUrl: 'https://produto.mercadolivre.com.br/MLB-1234567-produto',
      candidates: ['https://produto.mercadolivre.com.br/MLB-1234567-produto'],
    });
    expect(resolver.fetchDocument).not.toHaveBeenCalled();
    expect(remote.recoverProductUrl).toHaveBeenCalledWith('user-1', 'https://meli.la/13eXLrm');
  });
  it('resolve meli.la por HTTP e extrai o produto da página social sem navegador remoto', async () => {
    const social = 'https://www.mercadolivre.com.br/social/danielguimaraes?ref=abc';
    const resolver = {
      resolve: vi.fn(async () => ({ originalUrl:'https://meli.la/13eXLrm', resolvedUrl:social, redirectCount:1, resolvedAt:new Date().toISOString() })),
      fetchDocument: vi.fn(async () => ({ status:200, contentType:'text/html', body:`<a href="${featured}">Produto</a>` })),
    };
    await expect(new MercadoLivreLinkRecoveryService(resolver).recover('https://meli.la/13eXLrm','user-1'))
      .resolves.toEqual({ productUrl:featured, candidates:[featured] });
    expect(resolver.resolve).toHaveBeenCalledWith('https://meli.la/13eXLrm');
    expect(resolver.fetchDocument).toHaveBeenCalledWith(social);
  });
  it('falha fechada quando o navegador remoto não encontra produto', async () => {
    const resolver = { fetchDocument: async () => ({ status: 403, contentType: 'text/html', body: '' }) };
    const remote = { recoverProductUrl: async () => null };
    await expect(new MercadoLivreLinkRecoveryService(resolver, remote).recover(profile, 'user-1')).resolves.toBeNull();
  });
});
