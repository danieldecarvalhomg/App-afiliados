import { describe, expect, it } from 'vitest';
import { publishableCouponUrl, selectPromotionLinks } from './SupabaseAffiliateRepository';

describe('seleção de links da promoção capturada', () => {
  it('separa o link do produto do primeiro link de resgate de cupom', () => {
    const product = 'https://s.shopee.com.br/produto';
    const coupon = 'https://s.shopee.com.br/cupom';
    expect(selectPromotionLinks({
      normalized_result: { primaryProductLink: product, couponLinks: [coupon] },
    }, [coupon, product])).toEqual({ primaryProductLink: product, couponLink: coupon });
  });

  it('descarta links que não pertencem à captura', () => {
    expect(selectPromotionLinks({
      normalized_result: {
        primaryProductLink: 'https://s.shopee.com.br/produto',
        couponLinks: ['https://fora-da-captura.example/cupom'],
      },
    }, ['https://s.shopee.com.br/produto'])).toEqual({
      primaryProductLink: 'https://s.shopee.com.br/produto',
      couponLink: null,
    });
  });

  it('só publica o link de cupom depois da conversão afiliada', () => {
    const original = 'https://s.shopee.com.br/cupom-original';
    const converted = 'https://s.shopee.com.br/cupom-afiliado';
    expect(publishableCouponUrl('pending', original)).toBeNull();
    expect(publishableCouponUrl('conversion_failed', original)).toBeNull();
    expect(publishableCouponUrl('converted', null)).toBeNull();
    expect(publishableCouponUrl('converted', converted)).toBe(converted);
  });
});
