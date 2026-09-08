import { randomUUID } from 'node:crypto';
import type {
  InternalAutomationEventType,
  InternalAutomationEventHandler,
  InternalAutomationJob,
  InternalAutomationPublisher,
  InternalAutomationRepository,
} from './types';
import { AdaptiveWorkerLoop } from '../workers/AdaptiveWorkerLoop';

const MAX_ATTEMPTS = 4;
const STALE_MS = 2 * 60_000;
const BACKOFF_MS = [5_000, 30_000, 2 * 60_000];

const descriptions: Record<InternalAutomationEventType, { level: 'info' | 'warning' | 'error' | 'success'; message: (job: InternalAutomationJob) => string }> = {
  PROMOTION_DETECTED: { level: 'success', message: (job) => `Promoção reconhecida e encaminhada ao motor de automações (${String(job.payload.capturedMessageId ?? job.id)}).` },
  MARKETPLACE_DEAL: { level: 'success', message: (job) => `Oportunidade do Radar encaminhada ao motor de automações (${String(job.payload.dealId ?? job.id)}).` },
  PRODUCT_CREATED: { level: 'success', message: (job) => `Produto criado e encaminhado aos processadores internos (${String(job.payload.productId ?? job.id)}).` },
  AFFILIATE_CONVERTED: { level: 'success', message: (job) => `Conversão afiliada concluída e automações dependentes liberadas (${String(job.payload.conversionId ?? job.id)}).` },
  QUEUE_ITEM_ADDED: { level: 'info', message: (job) => `Item registrado na fila interna (${String(job.payload.queueItemId ?? job.id)}).` },
  OFFER_APPROVED: { level: 'success', message: (job) => `Oferta aprovada e cadastrada como produto (${String(job.payload.captureId ?? job.id)}).` },
  OFFER_REJECTED: { level: 'info', message: (job) => `Oferta rejeitada e encerrada na revisão (${String(job.payload.captureId ?? job.id)}).` },
  DISPATCH_SENT: { level: 'success', message: (job) => `Disparo confirmado pelo worker interno (${String(job.payload.deliveryId ?? job.id)}).` },
  DISPATCH_FAILED: { level: 'error', message: (job) => `Disparo encerrado com falha após as retentativas internas (${String(job.payload.deliveryId ?? job.id)}).` },
};

export class InternalAutomationService implements InternalAutomationPublisher {
  private readonly workerId = `automation-${randomUUID()}`;
  private running = false;
  private wakeRequested = false;
  private lastErrorCode: string | null = null;

  constructor(private readonly repository: InternalAutomationRepository, private handler?: InternalAutomationEventHandler) {}

  setHandler(handler: InternalAutomationEventHandler): void { this.handler = handler; }

  get status(): 'ready' | 'degraded' { return this.lastErrorCode ? 'degraded' : 'ready'; }

  async publish(userId: string, eventType: InternalAutomationEventType, idempotencyKey: string, payload: Record<string, unknown>): Promise<void> {
    const key = idempotencyKey.trim();
    if (!userId || !key || key.length > 180) throw new Error('AUTOMATION_IDEMPOTENCY_KEY_INVALID');
    await this.repository.enqueue(userId, eventType, key, payload);
    this.kick();
  }

  async drain(maxItems = 50): Promise<number> {
    if (this.running) { this.wakeRequested = true; return 0; }
    this.running = true;
    let processed = 0;
    try {
      do {
        this.wakeRequested = false;
        while (processed < maxItems) {
          const job = await this.repository.claimNext(this.workerId, new Date(Date.now() - STALE_MS).toISOString());
          if (!job) break;
          await this.process(job);
          processed += 1;
        }
      } while (this.wakeRequested && processed < maxItems);
      this.lastErrorCode = null;
      return processed;
    } catch (error) {
      this.lastErrorCode = error instanceof Error ? error.message.slice(0, 120) : 'AUTOMATION_DRAIN_FAILED';
      throw error;
    } finally {
      this.running = false;
    }
  }

  kick(): void {
    void this.drain().catch((error) => console.error('[AfiliHub:Automation] Ciclo interno falhou; haverá nova tentativa.', error));
  }

  private async process(job: InternalAutomationJob): Promise<void> {
    try {
      const description = descriptions[job.eventType];
      if (!description) throw new Error('AUTOMATION_EVENT_UNSUPPORTED');
      await this.handler?.handle(job);
      await this.repository.complete(job, description.level, description.message(job));
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : 'AUTOMATION_PROCESSING_FAILED';
      const retryAt = job.attemptCount < MAX_ATTEMPTS
        ? new Date(Date.now() + (BACKOFF_MS[Math.min(job.attemptCount - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[BACKOFF_MS.length - 1])).toISOString()
        : null;
      await this.repository.fail(job, code, retryAt);
    }
  }
}

export class InternalAutomationWorker {
  private readonly loop: AdaptiveWorkerLoop;
  constructor(private readonly service: InternalAutomationService, private readonly intervalMs = 2_000) {
    this.loop = new AdaptiveWorkerLoop(() => this.service.drain(), { minDelayMs: intervalMs, maxDelayMs: 60_000 });
  }
  start(): void {
    this.loop.start();
  }
  stop(): void { this.loop.stop(); }
}
