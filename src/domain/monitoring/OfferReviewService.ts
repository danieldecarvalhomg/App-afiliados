import type { AffiliateRepository } from '../affiliate/AffiliateRepository';
import type { AffiliateConversionService } from '../affiliate/AffiliateConversionService';
import type { InternalAutomationPublisher } from '../automation/types';
import { fail, ok, type AppResult } from '../errors';
import type { MonitoringRepository } from './MonitoringRepository';
import { ProductReviewPolicy } from './ProductReviewPolicy';
import type {
  DetectedOfferReviewer,
  DetectedOfferReviewResult,
} from './ReviewSettingsRepository';
import type { PromotionAnalysisResult } from './types';

export interface OfferReviewResult {
  captureId: string;
  decision: 'approved' | 'rejected';
  productId: string | null;
  reviewMode?: 'manual' | 'automatic_rule';
  matchedRuleId?: string | null;
}

interface ReviewContext {
  mode: 'manual' | 'automatic_rule';
  matchedRuleId: string | null;
  matchedRuleName: string | null;
}

export class OfferReviewService implements DetectedOfferReviewer {
  constructor(
    private readonly monitoring: MonitoringRepository,
    private readonly products: AffiliateRepository,
    private readonly conversions: AffiliateConversionService,
    private readonly automations: InternalAutomationPublisher,
    private readonly policy = new ProductReviewPolicy(),
  ) {}

  async decide(userId: string, captureId: string, decision: unknown): Promise<AppResult<OfferReviewResult>> {
    return this.applyDecision(userId, captureId, decision, {
      mode: 'manual', matchedRuleId: null, matchedRuleName: null,
    });
  }

  async evaluateDetected(
    userId: string,
    captureId: string,
    analysis: PromotionAnalysisResult,
  ): Promise<DetectedOfferReviewResult> {
    try {
      const settings = await this.monitoring.getReviewSettings(userId);
      if (!settings.reviewRequired) return { outcome: 'review_not_required', matchedRuleId: null };
      const decision = this.policy.evaluate(settings, analysis);
      if (!decision.autoApprove || !decision.matchedRule) {
        return { outcome: 'awaiting_review', matchedRuleId: null };
      }
      const result = await this.applyDecision(userId, captureId, 'approved', {
        mode: 'automatic_rule',
        matchedRuleId: decision.matchedRule.id,
        matchedRuleName: decision.matchedRule.name,
      });
      if (!result.success) {
        console.error('[AfiliHub:OfferReview] Regra automática não concluiu a aprovação.', result.error.code);
        return { outcome: 'awaiting_review', matchedRuleId: decision.matchedRule.id };
      }
      return { outcome: 'auto_approved', matchedRuleId: decision.matchedRule.id };
    } catch (error) {
      // Falha fechada: indisponibilidade da regra nunca vira aprovação.
      console.error('[AfiliHub:OfferReview] Falha ao avaliar regras; mantendo revisão manual.', error);
      return { outcome: 'awaiting_review', matchedRuleId: null };
    }
  }

  private async applyDecision(
    userId: string,
    captureId: string,
    decision: unknown,
    context: ReviewContext,
  ): Promise<AppResult<OfferReviewResult>> {
    if (!captureId || !['approved','rejected'].includes(String(decision))) return fail('VALIDATION_ERROR', 'Decisão inválida.');
    const normalized = decision as 'approved' | 'rejected';
    try {
      const reviewed = await this.monitoring.reviewCapture(userId, captureId, normalized);
      if (!reviewed) return fail('CAPTURE_REVIEW_CONFLICT', 'A oferta não está disponível para esta decisão.');
      if (normalized === 'rejected') {
        await this.automations.publish(userId, 'OFFER_REJECTED', captureId, { captureId });
        await this.monitoring.recordEvent(userId, 'offer.rejected', { capture_id: captureId });
        return ok({ captureId, decision: normalized, productId: null, reviewMode: context.mode, matchedRuleId: context.matchedRuleId });
      }
      const product = await this.products.createWhatsAppProductForCapture(userId, captureId);
      if (!product) return fail('OFFER_PRODUCT_DATA_INCOMPLETE', 'A oferta não possui dados suficientes para criar um produto.');
      this.conversions.kick();
      await this.automations.publish(userId, 'OFFER_APPROVED', captureId, { captureId, productId: product.id });
      await this.automations.publish(userId, 'PRODUCT_CREATED', product.id, { productId: product.id, sourceType: 'whatsapp', captureId });
      // A captura foi reconhecida como promoção antes de entrar na revisão
      // global. Após a aprovação, retoma o mesmo trigger PROMOTION_DETECTED
      // para que as automações configuradas para esse evento continuem o
      // pipeline até a fila. A chave distinta evita conflitar com um evento
      // que já tenha sido publicado antes da aprovação.
      await this.automations.publish(userId, 'PROMOTION_DETECTED', `${captureId}:approved`, {
        capturedMessageId: captureId,
        productId: product.id,
        origin: 'promotion_intelligence_review',
        causationId: captureId,
        reviewApproved: true,
        ...(context.mode === 'automatic_rule' ? {
          reviewMode: context.mode,
          reviewRuleId: context.matchedRuleId,
          reviewRuleName: context.matchedRuleName,
        } : {}),
      });
      await this.monitoring.recordEvent(userId, 'offer.approved', {
        capture_id: captureId,
        product_id: product.id,
        review_mode: context.mode,
        review_rule_id: context.matchedRuleId,
        review_rule_name: context.matchedRuleName,
      });
      return ok({ captureId, decision: normalized, productId: product.id, reviewMode: context.mode, matchedRuleId: context.matchedRuleId });
    } catch (error) {
      console.error('[AfiliHub:OfferReview] Falha ao concluir revisão.', error);
      return fail('OFFER_REVIEW_PERSISTENCE_ERROR', 'Não foi possível concluir a revisão da oferta.');
    }
  }
}
