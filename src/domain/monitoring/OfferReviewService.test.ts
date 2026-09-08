import { describe, expect, it, vi } from 'vitest';
import type { AffiliateRepository } from '../affiliate/AffiliateRepository';
import type { AffiliateConversionService } from '../affiliate/AffiliateConversionService';
import type { InternalAutomationPublisher } from '../automation/types';
import type { MonitoringRepository } from './MonitoringRepository';
import { OfferReviewService } from './OfferReviewService';
import type { ProductReviewSettings } from './ReviewSettingsRepository';
import type { PromotionAnalysisResult } from './types';

const product = {
  id: 'product-1', userId: 'user-a', sourceType: 'whatsapp', sourceReferenceId: 'analysis-1',
  title: 'Oferta', category: null, imageUrl: null, price: 99, originalPrice: 149, discountPercent: 34,
  currency: 'BRL', couponCode: null, couponDescription: null, freeShipping: null, marketplace: 'shopee',
  sourceUrl: 'https://example.com/item', affiliateUrl: null, affiliateStatus: 'pending', affiliateConversionId: null,
  observations: null, createdAt: '', updatedAt: '',
} as const;
const analysis: PromotionAnalysisResult = {
  isPromotion: true, confidence: 0.96, productName: 'Oferta', price: 99, originalPrice: 149,
  discountPercent: 34, currency: 'BRL', coupon: null, freeShipping: null, marketplace: 'shopee',
  links: ['https://shopee.com.br/item'], primaryProductLink: 'https://shopee.com.br/item', couponLinks: [],
};

function setup(reviewSettings: ProductReviewSettings = { reviewRequired: true, autoApprovalRules: [] }) {
  const monitoring = {
    reviewCapture: vi.fn(async () => true), recordEvent: vi.fn(async () => {}),
    getReviewSettings: vi.fn(async () => reviewSettings),
  };
  const products = { createWhatsAppProductForCapture: vi.fn(async () => product) };
  const conversions = { kick: vi.fn() };
  const automations = { publish: vi.fn(async () => {}) };
  return {
    service: new OfferReviewService(
      monitoring as unknown as MonitoringRepository,
      products as unknown as AffiliateRepository,
      conversions as unknown as AffiliateConversionService,
      automations as InternalAutomationPublisher,
    ),
    monitoring, products, conversions, automations,
  };
}

describe('OfferReviewService', () => {
  it('aprova, cria produto e aciona somente automações internas', async () => {
    const { service, products, conversions, automations } = setup();
    const result = await service.decide('user-a', 'capture-1', 'approved');
    expect(result).toMatchObject({ success: true, data: { decision: 'approved', productId: 'product-1', reviewMode: 'manual' } });
    expect(products.createWhatsAppProductForCapture).toHaveBeenCalledWith('user-a', 'capture-1');
    expect(conversions.kick).toHaveBeenCalled();
    expect(automations.publish).toHaveBeenNthCalledWith(1, 'user-a', 'OFFER_APPROVED', 'capture-1', { captureId: 'capture-1', productId: 'product-1' });
    expect(automations.publish).toHaveBeenNthCalledWith(2, 'user-a', 'PRODUCT_CREATED', 'product-1', { productId: 'product-1', sourceType: 'whatsapp', captureId: 'capture-1' });
    expect(automations.publish).toHaveBeenNthCalledWith(3, 'user-a', 'PROMOTION_DETECTED', 'capture-1:approved', {
      capturedMessageId: 'capture-1', productId: 'product-1', origin: 'promotion_intelligence_review',
      causationId: 'capture-1', reviewApproved: true,
    });
  });

  it('aprova automaticamente quando a regra de marketplace corresponde', async () => {
    const { service, monitoring, automations } = setup({
      reviewRequired: true,
      autoApprovalRules: [{
        id: 'rule-shopee', name: 'Shopee', enabled: true, conditionMode: 'all',
        conditions: [{ id: 'marketplace', field: 'marketplace', operator: 'equals', value: 'shopee' }],
      }],
    });
    await expect(service.evaluateDetected('user-a', 'capture-1', analysis)).resolves.toEqual({ outcome: 'auto_approved', matchedRuleId: 'rule-shopee' });
    expect(monitoring.reviewCapture).toHaveBeenCalledWith('user-a', 'capture-1', 'approved');
    expect(automations.publish).toHaveBeenLastCalledWith('user-a', 'PROMOTION_DETECTED', 'capture-1:approved', expect.objectContaining({
      reviewApproved: true, reviewMode: 'automatic_rule', reviewRuleId: 'rule-shopee',
    }));
  });

  it('mantém revisão manual quando nenhuma regra corresponde', async () => {
    const { service, monitoring } = setup();
    await expect(service.evaluateDetected('user-a', 'capture-1', analysis)).resolves.toEqual({ outcome: 'awaiting_review', matchedRuleId: null });
    expect(monitoring.reviewCapture).not.toHaveBeenCalled();
  });

  it('rejeita sem criar produto', async () => {
    const { service, products, automations } = setup();
    const result = await service.decide('user-a', 'capture-1', 'rejected');
    expect(result).toMatchObject({ success: true, data: { decision: 'rejected', productId: null } });
    expect(products.createWhatsAppProductForCapture).not.toHaveBeenCalled();
    expect(automations.publish).toHaveBeenCalledWith('user-a', 'OFFER_REJECTED', 'capture-1', { captureId: 'capture-1' });
  });

  it('mantém decisão idempotente quando a revisão conflita', async () => {
    const { service, monitoring } = setup();
    monitoring.reviewCapture.mockResolvedValueOnce(false);
    await expect(service.decide('user-a', 'capture-1', 'approved')).resolves.toMatchObject({ success: false, error: { code: 'CAPTURE_REVIEW_CONFLICT' } });
  });
});
