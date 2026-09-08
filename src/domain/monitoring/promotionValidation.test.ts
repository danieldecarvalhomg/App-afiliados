import { describe, expect, it } from 'vitest';
import { calculateDiscount, detectMarketplace, extractMoneyCandidates, normalizeMoney, validatePromotionOutput } from './promotionValidation';

const baseOutput = {
  isPromotion: true,
  confidence: 0.96,
  productName: 'Echo Dot',
  price: 249.9,
  originalPrice: null,
  coupon: null,
  freeShipping: null,
  marketplace: 'unknown',
  primaryProductLink: null,
  couponLinks: [],
};

describe('validação determinística de promoções', () => {
  it('normaliza valores brasileiros e extrai apenas valores presentes', () => {
    expect(normalizeMoney('R$ 1.299,90')).toBe(1299.9);
    expect(normalizeMoney('249.90')).toBe(249.9);
    expect(extractMoneyCandidates('De R$ 1.299,90 por R$ 999,00.')).toEqual([1299.9, 999]);
  });

  it('preserva múltiplos links exatamente e determina Shopee pelo domínio', () => {
    const links = ['https://shopee.com.br/produto?x=1', 'https://example.com/rastreamento?a=b'];
    const result = validatePromotionOutput(baseOutput, 'Echo Dot por R$ 249,90', links);
    expect(result.links).toEqual(links);
    expect(result.marketplace).toBe('shopee');
    expect(detectMarketplace(links)).toBe('shopee');
  });

  it('aceita a classificação de links da IA somente quando as URLs vieram da captura', () => {
    const coupon = 'https://s.shopee.com.br/cupom';
    const product = 'https://s.shopee.com.br/produto?lp=aff';
    const result = validatePromotionOutput({
      ...baseOutput, primaryProductLink: product,
      couponLinks: [coupon, 'https://malicioso.example/inventado'],
    }, 'Resgate o cupom e compre o produto por R$ 249,90', [coupon, product]);
    expect(result.primaryProductLink).toBe(product);
    expect(result.couponLinks).toEqual([coupon]);
  });

  it('rejeita preço e cupom inventados pela IA', () => {
    const result = validatePromotionOutput({
      ...baseOutput,
      price: 199.9,
      coupon: { code: 'INVENTADO20', description: '20% off' },
    }, 'Echo Dot por R$ 249,90', []);
    expect(result.price).toBeNull();
    expect(result.coupon).toBeNull();
  });

  it('aceita preço atual/anterior e recalcula o desconto sem confiar na IA', () => {
    const result = validatePromotionOutput({
      ...baseOutput, price: 750, originalPrice: 1000,
    }, 'De R$ 1.000,00 por R$ 750,00', []);
    expect(result.price).toBe(750);
    expect(result.originalPrice).toBe(1000);
    expect(result.discountPercent).toBe(25);
    expect(calculateDiscount(1000, 750)).toBe(25);
  });

  it('aceita cupom e frete grátis somente quando explícitos', () => {
    const result = validatePromotionOutput({
      ...baseOutput,
      coupon: { code: 'CASA20', description: '20% off' },
      freeShipping: true,
    }, 'Use CASA20 e aproveite frete grátis. Echo Dot R$ 249,90', []);
    expect(result.coupon).toEqual({ code: 'CASA20', description: '20% off' });
    expect(result.freeShipping).toBe(true);
  });

  it('preserva oferta de cupom descritiva sem inventar um código', () => {
    const result = validatePromotionOutput({
      ...baseOutput,
      coupon: { code: null, description: 'R$30 OFF' },
    }, 'Produto por R$ 559,90\nCupom: R$30 OFF', []);
    expect(result.coupon).toEqual({ code: null, description: 'R$30 OFF' });
  });

  it('extrai deterministicamente o texto literal após o rótulo de cupom', () => {
    const result = validatePromotionOutput({ ...baseOutput, coupon: null },
      'Produto por R$ 559,90\nCupom: R$30 OFF\nhttps://cupom.test/resgate',
      ['https://cupom.test/resgate']);
    expect(result.coupon).toEqual({ code: null, description: 'R$30 OFF' });
  });

  it('mantém campos ausentes como null e sinaliza promoção sem dado comercial', () => {
    const result = validatePromotionOutput({
      ...baseOutput, productName: null, price: null, originalPrice: null,
    }, 'Corre que ainda dá tempo!', []);
    expect(result).toMatchObject({
      productName: null, price: null, originalPrice: null, currency: null,
      coupon: null, freeShipping: null, reason: 'ambiguous_content',
    });
  });
});
