import { describe, expect, it, vi } from 'vitest';
import { AIProviderError, type AIProvider, type AIProviderResult } from '../ai/AIProvider';
import type { AnalysisCompletion, PromotionProcessingRepository } from './PromotionProcessingRepository';
import { deterministicPromotionAnalysis, PromotionProcessingService } from './PromotionProcessingService';
import type { CaptureProcessingStatus, ProcessingCapture } from './types';

type MemoryCapture = ProcessingCapture & {
  status: CaptureProcessingStatus;
  nextAttemptAt: number;
  processingStartedAt: number | null;
  completion?: AnalysisCompletion;
  errorCode?: string;
};

class MemoryRepository implements PromotionProcessingRepository {
  captures: MemoryCapture[] = [];
  events: string[] = [];

  add(partial: Partial<MemoryCapture> = {}): MemoryCapture {
    const capture: MemoryCapture = {
      id: `capture-${this.captures.length + 1}`, userId: 'user-a', workerId: '', rawContent: 'Echo Dot por R$ 249,90',
      links: [], messageType: 'text', mediaMetadata: null, attemptCount: 0,
      status: 'raw', nextAttemptAt: 0, processingStartedAt: null, ...partial,
    };
    this.captures.push(capture);
    return capture;
  }

  async claimNext(workerId: string, staleBefore: string): Promise<ProcessingCapture | null> {
    const staleAt = Date.parse(staleBefore);
    const now = Date.now();
    for (const item of this.captures) {
      if (item.status === 'processing' && item.attemptCount >= 3 && (item.processingStartedAt ?? now) < staleAt) {
        item.status = 'failed'; item.errorCode = 'PROCESSING_TIMEOUT';
      }
    }
    const item = this.captures.find((candidate) => candidate.attemptCount < 3 && (
      (candidate.status === 'raw' && candidate.nextAttemptAt <= now)
      || (candidate.status === 'processing' && (candidate.processingStartedAt ?? now) < staleAt)
    ));
    if (!item) return null;
    item.status = 'processing'; item.processingStartedAt = now; item.attemptCount += 1; item.workerId = workerId;
    return { ...item };
  }

  async complete(input: AnalysisCompletion) {
    const item = this.captures.find((candidate) => candidate.id === input.capture.id);
    if (!item || item.status !== 'processing' || item.workerId !== input.capture.workerId) return false;
    item.status = input.status; item.processingStartedAt = null; item.completion = input;
    return true;
  }

  async fail(capture: ProcessingCapture, errorCode: string, retryAt: string | null) {
    const item = this.captures.find((candidate) => candidate.id === capture.id)!;
    if (item.status !== 'processing' || item.workerId !== capture.workerId) return;
    item.status = retryAt ? 'raw' : 'failed'; item.processingStartedAt = null;
    item.nextAttemptAt = retryAt ? Date.parse(retryAt) : Date.now(); item.errorCode = errorCode;
  }

  async getCaptureStatus(userId: string, captureId: string) {
    return this.captures.find((item) => item.id === captureId && item.userId === userId)?.status ?? null;
  }

  async resetForReprocess(userId: string, captureId: string) {
    const item = this.captures.find((candidate) => candidate.id === captureId && candidate.userId === userId
      && ['failed', 'needs_review'].includes(candidate.status));
    if (!item) return false;
    item.status = 'raw'; item.attemptCount = 0; item.nextAttemptAt = 0; item.completion = undefined;
    return true;
  }

  async recordEvent(_userId: string, eventType: string) { this.events.push(eventType); }
  makeDue(capture: MemoryCapture) { capture.nextAttemptAt = 0; }
}

function output(overrides: Record<string, unknown> = {}): AIProviderResult {
  return {
    output: {
      isPromotion: true, confidence: 0.95, productName: 'Echo Dot', price: 249.9,
      originalPrice: null, coupon: null, freeShipping: null, marketplace: 'unknown', ...overrides,
    },
    provider: 'test-provider', model: 'test-model', inputTokens: 10, outputTokens: 5, processingMs: 12,
  };
}

class SequenceProvider implements AIProvider {
  calls = 0;
  constructor(private readonly sequence: Array<AIProviderResult | Error>, private readonly delayMs = 0) {}
  async analyzePromotion(): Promise<AIProviderResult> {
    this.calls += 1;
    if (this.delayMs) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    const next = this.sequence[Math.min(this.calls - 1, this.sequence.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  }
}

describe('worker de promoções', () => {
  it('resolve oferta textual inequívoca sem consumir Gemini',async()=>{
    const repository=new MemoryRepository();const capture=repository.add({rawContent:'Echo Dot 5ª geração por R$ 249,90',links:['https://www.amazon.com.br/dp/B0ABCDEFGH'],messageType:'text'});
    const provider=new SequenceProvider([output()]);await new PromotionProcessingService(repository,provider).drain();
    expect(provider.calls).toBe(0);expect(capture.status).toBe('promotion_detected');expect(capture.completion?.provider).toBe('deterministic');
  });

  it('mantém mensagens ambíguas no Gemini',()=>{
    expect(deterministicPromotionAnalysis({id:'x',userId:'u',workerId:'w',rawContent:'De R$ 399 por R$ 249',links:['https://www.amazon.com.br/dp/B0ABCDEFGH'],messageType:'text',mediaMetadata:null,attemptCount:1})).toBeNull();
  });
  it('não encaminha promoção para automação quando a revisão global está ligada', async () => {
    const repository = new MemoryRepository();
    const published: string[] = [];
    repository.add();
    const automations = { publish: async (_userId: string, eventType: string) => { published.push(eventType); } };
    const reviewSettings = {
      getReviewRequired: async () => true, setReviewRequired: async () => true,
      getReviewSettings: async () => ({ reviewRequired: true, autoApprovalRules: [] }),
      setReviewSettings: async (_userId: string, settings: any) => settings,
    };
    await new PromotionProcessingService(repository, new SequenceProvider([output()]), automations, reviewSettings).drain();
    expect(published).toEqual([]);
    expect(repository.events).toContain('promotion.awaiting_review');
  });

  it('encaminha promoção para automação quando a revisão global está desligada', async () => {
    const repository = new MemoryRepository();
    const published: string[] = [];
    repository.add();
    const automations = { publish: async (_userId: string, eventType: string) => { published.push(eventType); } };
    const reviewSettings = {
      getReviewRequired: async () => false, setReviewRequired: async () => false,
      getReviewSettings: async () => ({ reviewRequired: false, autoApprovalRules: [] }),
      setReviewSettings: async (_userId: string, settings: any) => settings,
    };
    await new PromotionProcessingService(repository, new SequenceProvider([output()]), automations, reviewSettings).drain();
    expect(published).toEqual(['PROMOTION_DETECTED']);
  });

  it('entrega a promoção ao revisor condicional e não publica um evento duplicado', async () => {
    const repository = new MemoryRepository();
    const published: string[] = [];
    repository.add();
    const automations = { publish: async (_userId: string, eventType: string) => { published.push(eventType); } };
    const reviewSettings = {
      getReviewRequired: async () => true, setReviewRequired: async () => true,
      getReviewSettings: async () => ({ reviewRequired: true, autoApprovalRules: [] }),
      setReviewSettings: async (_userId: string, settings: any) => settings,
    };
    const reviewer = {
      evaluateDetected: vi.fn(async () => ({ outcome: 'auto_approved' as const, matchedRuleId: 'rule-shopee' })),
    };
    await new PromotionProcessingService(repository, new SequenceProvider([output({ marketplace: 'shopee' })]), automations, reviewSettings, reviewer).drain();
    expect(reviewer.evaluateDetected).toHaveBeenCalled();
    expect(published).toEqual([]);
    expect(repository.events).toContain('promotion.auto_approved');
  });

  it('processa backlog e separa promoção de mensagem comum', async () => {
    const repository = new MemoryRepository();
    const promotion = repository.add();
    const common = repository.add({ rawContent: 'Bom dia, pessoal!' });
    const provider = new SequenceProvider([output(), output({
      isPromotion: false, confidence: 0.99, productName: null, price: null,
    })]);
    expect(await new PromotionProcessingService(repository, provider).drain()).toBe(2);
    expect(promotion.status).toBe('promotion_detected');
    expect(common.status).toBe('ignored');
    expect(promotion.completion?.analysis.productName).toBe('Echo Dot');
  });

  it('não envia mídia sem legenda para a IA e marca revisão', async () => {
    const repository = new MemoryRepository();
    const capture = repository.add({ rawContent: '', messageType: 'image', mediaMetadata: { mimeType: 'image/jpeg' } });
    const provider = new SequenceProvider([output()]);
    await new PromotionProcessingService(repository, provider).drain();
    expect(provider.calls).toBe(0);
    expect(capture.status).toBe('needs_review');
    expect(capture.completion?.analysis.reason).toBe('insufficient_text_content');
  });

  it('duas instâncias não processam a mesma captura', async () => {
    const repository = new MemoryRepository(); repository.add();
    const provider = new SequenceProvider([output()], 10);
    const first = new PromotionProcessingService(repository, provider);
    const second = new PromotionProcessingService(repository, provider);
    await Promise.all([first.drain(), second.drain()]);
    expect(provider.calls).toBe(1);
    expect(repository.captures[0].attemptCount).toBe(1);
  });

  it('recupera processamento abandonado depois do timeout', async () => {
    const repository = new MemoryRepository();
    const capture = repository.add({ status: 'processing', attemptCount: 1, processingStartedAt: 0 });
    await new PromotionProcessingService(repository, new SequenceProvider([output()])).drain();
    expect(capture.status).toBe('promotion_detected');
    expect(capture.attemptCount).toBe(2);
  });

  it('ignora conclusão atrasada do worker substituído na recuperação', async () => {
    const repository = new MemoryRepository(); const capture = repository.add();
    let release!: () => void; let started!: () => void;
    const providerStarted = new Promise<void>((resolve) => { started = resolve; });
    const releaseProvider = new Promise<void>((resolve) => { release = resolve; });
    const slowProvider: AIProvider = {
      async analyzePromotion() {
        started(); await releaseProvider;
        return { ...output(), provider: 'worker-antigo' };
      },
    };
    const oldDrain = new PromotionProcessingService(repository, slowProvider).drain();
    await providerStarted;
    capture.processingStartedAt = 0;
    const recovered = output(); recovered.provider = 'worker-recuperado';
    await new PromotionProcessingService(repository, new SequenceProvider([recovered])).drain();
    release(); await oldDrain;
    expect(capture.status).toBe('promotion_detected');
    expect(capture.attemptCount).toBe(2);
    expect(capture.completion?.provider).toBe('worker-recuperado');
  });

  it('faz backoff em falhas transitórias e para na terceira tentativa', async () => {
    const repository = new MemoryRepository(); const capture = repository.add();
    const provider = new SequenceProvider([
      new AIProviderError('AI_UNAVAILABLE', true, 'indisponível'),
    ]);
    const service = new PromotionProcessingService(repository, provider);
    await service.drain();
    expect(capture.status).toBe('raw'); expect(capture.attemptCount).toBe(1);
    repository.makeDue(capture); await service.drain();
    expect(capture.status).toBe('raw'); expect(capture.attemptCount).toBe(2);
    repository.makeDue(capture); await service.drain();
    expect(capture.status).toBe('failed'); expect(capture.attemptCount).toBe(3);
    expect(provider.calls).toBe(3);
  });

  it('falha estrutural não é retentada', async () => {
    const repository = new MemoryRepository(); const capture = repository.add();
    await new PromotionProcessingService(repository, new SequenceProvider([
      output({ confidence: 'alta' }),
    ])).drain();
    expect(capture.status).toBe('failed');
    expect(capture.errorCode).toBe('INVALID_CONFIDENCE');
  });

  it('reprocessa apenas failed/needs_review do próprio usuário', async () => {
    const repository = new MemoryRepository();
    const failed = repository.add({ status: 'failed', attemptCount: 3 });
    const other = repository.add({ userId: 'user-b', status: 'failed', attemptCount: 3 });
    const service = new PromotionProcessingService(repository, new SequenceProvider([output()]));
    expect((await service.reprocess('user-a', failed.id)).success).toBe(true);
    expect((await service.reprocess('user-a', other.id)).success).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failed.status).toBe('promotion_detected'); expect(failed.attemptCount).toBe(1);
  });
});
