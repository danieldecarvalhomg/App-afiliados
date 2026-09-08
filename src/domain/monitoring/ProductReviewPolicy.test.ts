import { describe, expect, it } from 'vitest';
import { ProductReviewPolicy } from './ProductReviewPolicy';
import type { ProductReviewSettings } from './ReviewSettingsRepository';
import type { PromotionAnalysisResult } from './types';

const analysis: PromotionAnalysisResult = {
  isPromotion: true,
  confidence: 0.94,
  productName: 'Produto',
  price: 80,
  originalPrice: 100,
  discountPercent: 20,
  currency: 'BRL',
  coupon: null,
  freeShipping: true,
  marketplace: 'shopee',
  links: ['https://shopee.com.br/item'],
  primaryProductLink: 'https://shopee.com.br/item',
  couponLinks: [],
};

function settings(overrides: Partial<ProductReviewSettings> = {}): ProductReviewSettings {
  return {
    reviewRequired: true,
    autoApprovalRules: [{
      id: 'shopee',
      name: 'Shopee confiável',
      enabled: true,
      conditionMode: 'all',
      conditions: [
        { id: 'marketplace', field: 'marketplace', operator: 'equals', value: 'shopee' },
        { id: 'confidence', field: 'confidence', operator: 'greater_or_equal', value: 0.9 },
      ],
    }],
    ...overrides,
  };
}

describe('ProductReviewPolicy', () => {
  it('aprova automaticamente quando todas as condições da regra passam', () => {
    expect(new ProductReviewPolicy().evaluate(settings(), analysis)).toMatchObject({
      autoApprove: true,
      matchedRule: { id: 'shopee' },
    });
  });

  it('mantém revisão manual quando uma condição obrigatória falha', () => {
    expect(new ProductReviewPolicy().evaluate(settings(), { ...analysis, confidence: 0.7 }).autoApprove).toBe(false);
  });

  it('não executa regras quando a revisão global está desligada', () => {
    expect(new ProductReviewPolicy().evaluate(settings({ reviewRequired: false }), analysis).autoApprove).toBe(false);
  });
});
