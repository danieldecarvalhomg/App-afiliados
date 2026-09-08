import type { PromotionAnalysisResult, PromotionMarketplace } from './types';

export type ProductReviewConditionField =
  | 'marketplace'
  | 'confidence'
  | 'discount_percent'
  | 'coupon_exists'
  | 'free_shipping';
export type ProductReviewConditionOperator = 'equals' | 'greater_or_equal';

export interface ProductReviewCondition {
  id: string;
  field: ProductReviewConditionField;
  operator: ProductReviewConditionOperator;
  value: PromotionMarketplace | number | boolean;
}

export interface ProductReviewRule {
  id: string;
  name: string;
  enabled: boolean;
  conditionMode: 'all' | 'any';
  conditions: ProductReviewCondition[];
}

export interface ProductReviewSettings {
  reviewRequired: boolean;
  autoApprovalRules: ProductReviewRule[];
}

export interface DetectedOfferReviewResult {
  outcome: 'review_not_required' | 'awaiting_review' | 'auto_approved';
  matchedRuleId: string | null;
}

export interface DetectedOfferReviewer {
  evaluateDetected(
    userId: string,
    captureId: string,
    analysis: PromotionAnalysisResult,
  ): Promise<DetectedOfferReviewResult>;
}

export interface ReviewSettingsRepository {
  /**
   * Retorna o modo global de segurança para promoções capturadas.
   * Ausência de configuração deve ser tratada como revisão obrigatória.
   */
  getReviewRequired(userId: string): Promise<boolean>;
  setReviewRequired(userId: string, required: boolean): Promise<boolean>;
  getReviewSettings(userId: string): Promise<ProductReviewSettings>;
  setReviewSettings(userId: string, settings: ProductReviewSettings): Promise<ProductReviewSettings>;
}
