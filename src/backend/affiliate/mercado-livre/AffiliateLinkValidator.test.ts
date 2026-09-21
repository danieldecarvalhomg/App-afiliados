import { describe, expect, it } from 'vitest';
import { extractMercadoLivreItemId, isMercadoLivreConversionUrl, isMercadoLivreProductUrl, MercadoLivreAffiliateLinkValidator, normalizeMercadoLivreConversionUrl } from './AffiliateLinkValidator';

describe('MercadoLivreAffiliateLinkValidator', () => {
  const validator = new MercadoLivreAffiliateLinkValidator();
  const source = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';

  it('identifica somente páginas de produto como origem convertível', () => {
    expect(isMercadoLivreProductUrl('https://www.mercadolivre.com.br/lava-loucas/p/MLB27237304')).toBe(true);
    expect(isMercadoLivreProductUrl('https://www.mercadolivre.com.br/lava-loucas/up/MLBU605239077')).toBe(true);
    expect(isMercadoLivreProductUrl('https://www.mercadolivre.com.br/social/comprasincriveisbr_')).toBe(false);
    expect(isMercadoLivreProductUrl('https://meli.la/2FdaeDB')).toBe(false);
  });

  it('aceita meli.la como origem convertível sem tratá-lo como página de produto', () => {
    const shortUrl = 'https://meli.la/2FdaeDB';
    expect(isMercadoLivreConversionUrl(shortUrl)).toBe(true);
    expect(normalizeMercadoLivreConversionUrl(`${shortUrl}#origem`)).toBe(shortUrl);
    expect(isMercadoLivreConversionUrl('https://meli.la/social/comprasincriveisbr_')).toBe(false);
  });

  it('aceita link curto afiliado e extrai o item ID canônico', () => {
    expect(validator.validate(source, 'https://meli.la/AbC123')).toBe('https://meli.la/AbC123');
    expect(extractMercadoLivreItemId(source)).toBe('MLB1234567890');
  });

  it('extrai o ID universal usado pelas ofertas novas do Radar', () => {
    expect(extractMercadoLivreItemId('https://www.mercadolivre.com.br/lavadora/up/MLBU605239077'))
      .toBe('MLBU605239077');
  });

  it('prioriza o item da oferta quando a URL do Radar contém filtro de campanha', () => {
    const radarUrl = 'https://www.mercadolivre.com.br/produto/up/MLBU780769248?pdp_filters=deal%3AMLB1578289-1#polycard_client=affiliates&wid=MLB4598994322&sid=affiliates';
    expect(extractMercadoLivreItemId(radarUrl)).toBe('MLB4598994322');
  });

  it('aceita link completo de produto somente com atribuição', () => {
    const candidate = 'https://www.mercadolivre.com.br/MLB-1234567890-produto-_JM?matt_word=promofy&matt_tool=123';
    expect(validator.validate(source, candidate)).toBe(candidate);
  });

  it('rejeita link completo atribuído para outro produto', () => {
    expect(() => validator.validate(source, 'https://www.mercadolivre.com.br/MLB-9999999999-outro-_JM?matt_word=promofy&matt_tool=123')).toThrow();
  });

  it.each([source, 'http://meli.la/inseguro', 'https://example.com/afiliado', 'https://www.mercadolivre.com.br/login'])
  ('rejeita resultado não afiliado ou inseguro: %s', (candidate) => {
    expect(() => validator.validate(source, candidate)).toThrow();
  });

  it('rejeita Portal e rotas comuns sem identificação afiliada', () => {
    expect(() => validator.validate(source, 'https://www.mercadolivre.com.br/afiliados#menu-user')).toThrow();
    expect(() => validator.validate(source, 'https://www.mercadolivre.com.br/gz/cart/v2')).toThrow();
    expect(() => validator.validate(source, 'https://meli.la/social/comprasincriveisbr_')).toThrow();
  });
});
