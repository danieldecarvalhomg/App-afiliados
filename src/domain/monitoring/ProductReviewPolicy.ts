import type { PromotionAnalysisResult } from './types';
import type {
  ProductReviewCondition,
  ProductReviewRule,
  ProductReviewSettings,
} from './ReviewSettingsRepository';

export interface ProductReviewPolicyDecision {
  autoApprove: boolean;
  matchedRule: ProductReviewRule | null;
}

function actualValue(condition: ProductReviewCondition, analysis: PromotionAnalysisResult): unknown {
  switch (condition.field) {
    case 'marketplace': return analysis.marketplace;
    case 'confidence': return analysis.confidence;
    case 'discount_percent': return analysis.discountPercent;
    case 'coupon_exists': return Boolean(analysis.coupon?.code || analysis.coupon?.description);
    case 'free_shipping': return analysis.freeShipping === true;
  }
}

function matches(condition: ProductReviewCondition, analysis: PromotionAnalysisResult): boolean {
  const actual = actualValue(condition, analysis);
  if (condition.operator === 'equals') return actual === condition.value;
  if (condition.operator === 'greater_or_equal') {
    return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
  }
  return false;
}

export class ProductReviewPolicy {
  evaluate(settings: ProductReviewSettings, analysis: PromotionAnalysisResult): ProductReviewPolicyDecision {
    if (!settings.reviewRequired) return { autoApprove: false, matchedRule: null };
    for (const rule of settings.autoApprovalRules) {
      if (!rule.enabled || rule.conditions.length === 0) continue;
      const results = rule.conditions.map((condition) => matches(condition, analysis));
      const passed = rule.conditionMode === 'any' ? results.some(Boolean) : results.every(Boolean);
      if (passed) return { autoApprove: true, matchedRule: rule };
    }
    return { autoApprove: false, matchedRule: null };
  }
}
