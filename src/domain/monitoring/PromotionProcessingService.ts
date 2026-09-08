import { createHash, randomUUID } from 'node:crypto';
import { AIProviderError, type AIProvider } from '../ai/AIProvider';
import type { AppResult } from '../errors';
import { fail, ok } from '../errors';
import type { PromotionProcessingRepository } from './PromotionProcessingRepository';
import { detectMarketplace, extractMoneyCandidates, validatePromotionOutput } from './promotionValidation';
import type { ProcessingCapture, PromotionAnalysisResult } from './types';
import type { InternalAutomationPublisher } from '../automation/types';
import type { DetectedOfferReviewer, ReviewSettingsRepository } from './ReviewSettingsRepository';
import { AdaptiveWorkerLoop } from '../workers/AdaptiveWorkerLoop';
import type { UsageQuotaService } from '../usage/UsageQuotaService';
import type { AiResponseCache } from '../ai/AiResponseCache';

const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 5 * 60_000;
const BACKOFF_MS = [5_000, 30_000];
const PROMOTION_CACHE_TTL_MS = 6 * 60 * 60_000;
const PERSISTENT_PROMOTION_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;
const aiCostOptimizationsEnabled=()=>process.env.AI_COST_OPTIMIZATIONS_ENABLED!=='false';

const normalizedPromotionKey = (capture: ProcessingCapture) => createHash('sha256').update(JSON.stringify({
  text: capture.rawContent.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR'),
  links: [...capture.links].sort(),
  messageType: capture.messageType,
  media: capture.mediaMetadata?.available === true,
})).digest('hex');

export const hasCommercialPromotionSignals = (capture: ProcessingCapture): boolean => {
  if (capture.links.length > 0 || capture.mediaMetadata?.available === true) return true;
  if (['image', 'video', 'document'].includes(capture.messageType)) return true;
  const text = capture.rawContent;
  return /(?:r\$\s*\d|\d+[,.]\d{2}|\d+\s*%|cupom|c[oó]digo|oferta|promo(?:ção|cao)?|desconto|frete\s+gr[aá]tis|de\s+r\$|por\s+(?:apenas\s+)?r\$|compre|aproveite|liquida(?:ção|cao))/iu.test(text);
};

function isDirectProductLink(link:string):boolean{
  try{
    const url=new URL(link);const value=`${url.pathname}${url.search}`;
    if(/amazon\.com\.br$/iu.test(url.hostname))return /\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:[/?]|$)/iu.test(value);
    if(/mercadolivre\.com\.br$/iu.test(url.hostname))return /MLB[-_]?\d{6,}/iu.test(value);
    if(/shopee\.com\.br$/iu.test(url.hostname))return /(?:-i\.|\/product\/)\d+[./]\d+/iu.test(value);
    return false;
  }catch{return false;}
}

function deterministicTitle(text:string):string|null{
  const beforePrice=text.split(/R\$\s*\d/iu)[0]??'';
  const cleaned=beforePrice.replace(/https?:\/\/\S+/giu,' ').replace(/[*_~`#|]/gu,' ')
    .replace(/\b(?:oferta|promo(?:ção|cao)|aproveite|corre|imperdível|imperdivel|por apenas|a partir de)\b\s*[:!-]?/giu,' ')
    .replace(/[^\p{L}\p{N}\s+&'/-]/gu,' ').replace(/\s+/gu,' ').replace(/\b(?:por|apenas)\s*$/iu,'').trim();
  return cleaned.length>=5&&/[\p{L}]{3}/u.test(cleaned)?cleaned.slice(-180):null;
}

export function deterministicPromotionAnalysis(capture:ProcessingCapture):PromotionAnalysisResult|null{
  if(capture.messageType!=='text'||capture.links.length!==1||!isDirectProductLink(capture.links[0]))return null;
  if(/\b(?:cupom|c[oó]digo|de\s+r\$|era\s+r\$|preço\s+anterior|desconto|\d{1,3}\s*%\s*(?:off)?)\b/iu.test(capture.rawContent))return null;
  const values=extractMoneyCandidates(capture.rawContent);if(values.length!==1)return null;
  const productName=deterministicTitle(capture.rawContent);const marketplace=detectMarketplace(capture.links);
  if(!productName||!marketplace)return null;
  return {isPromotion:true,confidence:.99,productName,price:values[0],originalPrice:null,discountPercent:null,
    currency:'BRL',coupon:null,freeShipping:/\b(frete|envio)\s*(gr[aá]tis|0(?:[,.]00)?)\b/iu.test(capture.rawContent)?true:null,
    marketplace,links:[...capture.links],primaryProductLink:capture.links[0],couponLinks:[]};
}

export class PromotionProcessingService {
  private draining = false;
  private wakeRequested = false;
  private readonly workerId = `promotion-${randomUUID()}`;
  private readonly analysisCache = new Map<string, { expiresAt: number; analysis: PromotionAnalysisResult; model: string }>();

  constructor(
    private readonly repository: PromotionProcessingRepository,
    private readonly provider: AIProvider,
    private readonly automations?: InternalAutomationPublisher,
    private readonly reviewSettings?: ReviewSettingsRepository,
    private readonly offerReviewer?: DetectedOfferReviewer,
    private readonly quota?: UsageQuotaService,
    private readonly persistentCache?: AiResponseCache,
  ) {}

  async drain(maxItems = 50): Promise<number> {
    if (this.draining) { this.wakeRequested = true; return 0; }
    this.draining = true;
    let processed = 0;
    try {
      do {
        this.wakeRequested = false;
        while (processed < maxItems) {
          const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
          const capture = await this.repository.claimNext(this.workerId, staleBefore);
          if (!capture) break;
          await this.processClaimed(capture);
          processed += 1;
        }
      } while (this.wakeRequested && processed < maxItems);
      return processed;
    } finally { this.draining = false; }
  }

  kick(): void { void this.drain().catch((error) => console.error('[AfiliHub:Promotion] Worker falhou.', error)); }

  async reprocess(userId: string, captureId: string): Promise<AppResult<void>> {
    try {
      const status = await this.repository.getCaptureStatus(userId, captureId);
      if (!status) return fail('CAPTURE_NOT_FOUND', 'Captura não encontrada.');
      if (!['failed','needs_review'].includes(status)) {
        return fail('CAPTURE_REPROCESS_NOT_ALLOWED', 'Somente análises falhas ou inconclusivas podem ser reprocessadas.');
      }
      if (!await this.repository.resetForReprocess(userId, captureId)) {
        return fail('CAPTURE_REPROCESS_CONFLICT', 'A captura já está sendo reprocessada.');
      }
      await this.safeEvent(userId, 'promotion.reprocessed', { capturedMessageId: captureId });
      this.kick();
      return ok(undefined);
    } catch (error) {
      console.error('[AfiliHub:Promotion] Falha ao reprocessar captura.', error);
      return fail('PROMOTION_PERSISTENCE_ERROR', 'Não foi possível reprocessar a captura.');
    }
  }

  private async processClaimed(capture: ProcessingCapture): Promise<void> {
    await this.safeEvent(capture.userId, 'promotion.processing.started', {
      capturedMessageId: capture.id, attempt: capture.attemptCount,
    });
    if (!capture.rawContent.trim()) {
      const analysis: PromotionAnalysisResult = {
        isPromotion: null, confidence: 0, productName: null, price: null, originalPrice: null,
        discountPercent: null, currency: null, coupon: null, freeShipping: null,
        marketplace: detectMarketplace(capture.links) ?? 'unknown', links: [...capture.links],
        primaryProductLink: null, couponLinks: [],
        reason: 'insufficient_text_content',
      };
      await this.repository.complete({ capture, status: 'needs_review', analysis, provider: 'deterministic', model: 'none', processingMs: 0 });
      await this.safeEvent(capture.userId, 'promotion.needs_review', {
        capturedMessageId: capture.id, reason: 'insufficient_text_content',
      });
      return;
    }

    if (!hasCommercialPromotionSignals(capture)) {
      const analysis: PromotionAnalysisResult = {
        isPromotion: false, confidence: 0.99, productName: null, price: null, originalPrice: null,
        discountPercent: null, currency: null, coupon: null, freeShipping: null,
        marketplace: 'unknown', links: [], primaryProductLink: null, couponLinks: [],
      };
      await this.repository.complete({ capture, status: 'ignored', analysis, provider: 'deterministic', model: 'promotion-signal-v1', processingMs: 0 });
      await this.safeEvent(capture.userId, 'promotion.ignored', { capturedMessageId: capture.id, provider: 'deterministic', reason: 'no_commercial_signals' });
      return;
    }

    try {
      const cacheKey = createHash('sha256').update(normalizedPromotionKey(capture)).update((this.provider as {model?:string}).model??'provider-default').digest('hex');
      const deterministic=aiCostOptimizationsEnabled()?deterministicPromotionAnalysis(capture):null;
      const cached = this.analysisCache.get(cacheKey);
      const cacheHit = Boolean(cached && cached.expiresAt > Date.now());
      if (cached && !cacheHit) this.analysisCache.delete(cacheKey);
      const persisted=aiCostOptimizationsEnabled()&&!deterministic&&!cacheHit?await this.persistentCache?.get('promotion',cacheKey).catch(()=>null):null;
      const result = deterministic
        ? {output:deterministic,provider:'deterministic',model:'promotion-clear-v1',processingMs:0,inputTokens:undefined,outputTokens:undefined}
        : cacheHit
        ? { output: cached!.analysis, provider: 'promotion-cache', model: cached!.model, processingMs: 0, inputTokens: undefined, outputTokens: undefined }
        : persisted
          ? {output:persisted.payload,provider:'promotion-persistent-cache',model:persisted.model,processingMs:0,inputTokens:undefined,outputTokens:undefined}
        : (await this.quota?.consume(capture.userId, 'ai_generation'), await this.provider.analyzePromotion({
            text: capture.rawContent,
            links: [...capture.links],
            normalizedMoneyCandidates: extractMoneyCandidates(capture.rawContent),
            deterministicMarketplace: detectMarketplace(capture.links),
          }));
      const analysis: PromotionAnalysisResult = deterministic
        ? deterministic
        : cacheHit
        ? cached!.analysis
        : validatePromotionOutput(result.output, capture.rawContent, capture.links);
      if (!cacheHit&&!deterministic) {
        if (this.analysisCache.size >= 10_000) this.analysisCache.delete(this.analysisCache.keys().next().value!);
        this.analysisCache.set(cacheKey, { expiresAt: Date.now() + PROMOTION_CACHE_TTL_MS, analysis, model: result.model });
        if(aiCostOptimizationsEnabled()&&!persisted)void this.persistentCache?.set({kind:'promotion',key:cacheKey,payload:analysis,provider:result.provider,model:result.model,expiresAt:new Date(Date.now()+PERSISTENT_PROMOTION_CACHE_TTL_MS).toISOString()}).catch(()=>undefined);
      }
      const status = analysis.isPromotion === false
        ? 'ignored'
        : analysis.isPromotion === true && !analysis.reason
          ? 'promotion_detected'
          : 'needs_review';
      if (!await this.repository.complete({
        capture, status, analysis, provider: result.provider, model: result.model,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, processingMs: result.processingMs,
      })) throw new Error('CAPTURE_COMPLETION_CONFLICT');
      const event = status === 'promotion_detected' ? 'promotion.detected'
        : status === 'ignored' ? 'promotion.ignored' : 'promotion.needs_review';
      await this.safeEvent(capture.userId, event, {
        capturedMessageId: capture.id, confidence: analysis.confidence,
        provider: result.provider, model: result.model, processingMs: result.processingMs,
      });
      if (status === 'promotion_detected') {
        const review = this.offerReviewer
          ? await this.offerReviewer.evaluateDetected(capture.userId, capture.id, analysis)
          : (await this.isReviewRequired(capture.userId)
              ? { outcome: 'awaiting_review' as const, matchedRuleId: null }
              : { outcome: 'review_not_required' as const, matchedRuleId: null });
        if (review.outcome === 'awaiting_review') {
          await this.safeEvent(capture.userId, 'promotion.awaiting_review', {
            capturedMessageId: capture.id,
            reason: review.matchedRuleId ? 'automatic_rule_failed' : 'global_review_required',
            matchedRuleId: review.matchedRuleId,
          });
        } else if (review.outcome === 'auto_approved') {
          await this.safeEvent(capture.userId, 'promotion.auto_approved', {
            capturedMessageId: capture.id, matchedRuleId: review.matchedRuleId,
          });
        } else {
          try {
            await this.automations?.publish(capture.userId, 'PROMOTION_DETECTED', capture.id, {
              capturedMessageId: capture.id, origin: 'promotion_intelligence', causationId: capture.id,
            });
          } catch (automationError) {
            console.error('[AfiliHub:Promotion] Falha ao publicar evento de automação.', automationError);
          }
        }
      }
    } catch (error) {
      const providerError = error instanceof AIProviderError ? error : null;
      const errorCode = providerError?.code ?? (error instanceof Error ? error.message : 'PROMOTION_PROCESSING_ERROR');
      const retryable = providerError?.transient === true && capture.attemptCount < MAX_ATTEMPTS;
      const retryAt = retryable
        ? new Date(Date.now() + (BACKOFF_MS[Math.max(0, capture.attemptCount - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1])).toISOString()
        : null;
      await this.repository.fail(capture, errorCode.slice(0, 100), retryAt);
      await this.safeEvent(capture.userId, 'promotion.processing.failed', {
        capturedMessageId: capture.id, errorCode: errorCode.slice(0, 100),
        attempt: capture.attemptCount, willRetry: Boolean(retryAt),
      });
    }
  }

  private async safeEvent(userId: string, type: string, payload: Record<string, unknown>): Promise<void> {
    try { await this.repository.recordEvent(userId, type, payload); }
    catch (error) { console.error(`[AfiliHub:Promotion] Falha ao registrar ${type}.`, error); }
  }

  private async isReviewRequired(userId: string): Promise<boolean> {
    if (!this.reviewSettings) return true;
    try { return await this.reviewSettings.getReviewRequired(userId); }
    catch (error) {
      // Falha fechada: nunca transformar uma indisponibilidade da preferência
      // em cadastro automático de produto.
      console.error('[AfiliHub:Promotion] Não foi possível ler a revisão global; mantendo proteção.', error);
      return true;
    }
  }
}

export class PromotionWorker {
  private readonly loop: AdaptiveWorkerLoop;
  constructor(private readonly service: PromotionProcessingService, private readonly intervalMs = 3_000) {
    this.loop = new AdaptiveWorkerLoop(() => this.service.drain(), { minDelayMs: intervalMs, maxDelayMs: 60_000 });
  }
  start(): void {
    this.loop.start();
  }
  stop(): void { this.loop.stop(); }
}
