import { randomUUID } from "node:crypto";
import type {
  DispatchMediaLoader,
  DispatchRepository,
  DispatchTransport,
} from "./DispatchRepository";
import type { DispatchPayload, QueueDelivery, QueueItem } from "./types";
import type { InternalAutomationPublisher } from "../automation/types";
import { AdaptiveWorkerLoop } from "../workers/AdaptiveWorkerLoop";
import type { UsageQuotaService } from "../usage/UsageQuotaService";
import { applyImageWatermark } from "../../backend/dispatch/ImageWatermarkProcessor";

const retryDelay = (attempt: number) =>
  Math.min(15 * 60_000, 15_000 * 2 ** Math.max(0, attempt - 1));
const safeErrorCode = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message || fallback;
  if (error && typeof error === "object") {
    const value = error as {
      code?: unknown;
      message?: unknown;
      details?: unknown;
    };
    for (const candidate of [value.code, value.message, value.details]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }
  return fallback;
};

export interface DispatchEvents {
  publish(
    userId: string,
    event: {
      type: string;
      campaignId?: string;
      queueItemId?: string;
      deliveryId?: string;
      status?: string;
      data?: Record<string, unknown>;
    },
  ): void;
}

export class WhatsAppDispatchWorker {
  private readonly loop: AdaptiveWorkerLoop;
  private running = false;
  private lastPollErrorAt = 0;
  private lastErrorCode: string | null = null;
  readonly workerId = `dispatch-${randomUUID()}`;

  get status(): "ready" | "degraded" {
    return this.lastErrorCode ? "degraded" : "ready";
  }

  constructor(
    private readonly repository: DispatchRepository,
    private readonly transport: DispatchTransport,
    private readonly media: DispatchMediaLoader,
    private readonly events?: DispatchEvents,
    private readonly options: {
      pollMs?: number;
      parallelConnections?: number;
      staleMs?: number;
    } = {},
    private readonly automations?: InternalAutomationPublisher,
    private readonly quota?: UsageQuotaService,
  ) {
    this.loop = new AdaptiveWorkerLoop(() => this.tick(), {
      minDelayMs: this.options.pollMs ?? 1_000,
      maxDelayMs: 30_000,
      backoffFactor: 1.8,
    });
  }

  async recover() {
    return this.repository.recoverStale(
      new Date(Date.now() - (this.options.staleMs ?? 120_000)).toISOString(),
    );
  }

  async processOne(): Promise<boolean> {
    const delivery = await this.repository.claimNext(
      this.workerId,
      new Date(Date.now() - (this.options.staleMs ?? 120_000)).toISOString(),
    );
    if (!delivery) return false;
    await this.process(delivery);
    return true;
  }

  private async process(delivery: QueueDelivery) {
    const context = await this.repository.loadDeliveryContext(delivery.id);
    if (!context) {
      await this.repository.markFailed(
        delivery.id,
        this.workerId,
        "DISPATCH_CONTEXT_NOT_FOUND",
      );
      return;
    }
    const { item, campaign } = context;
    this.events?.publish(item.userId, {
      type: "dispatch.claimed",
      campaignId: campaign.id,
      queueItemId: item.id,
      deliveryId: delivery.id,
      status: "claimed",
    });
    if (context.connectionStatus !== "connected") {
      await this.repository.deferDisconnected(delivery.id, this.workerId);
      this.events?.publish(item.userId, {
        type: "dispatch.connection_wait",
        campaignId: campaign.id,
        queueItemId: item.id,
        deliveryId: delivery.id,
        status: "pending",
      });
      return;
    }
    if (context.groupSyncStatus !== "active") {
      await this.failKnown(delivery, "WHATSAPP_GROUP_UNAVAILABLE", false, item);
      return;
    }

    let payload: DispatchPayload;
    try {
      if (
        !item.contentSnapshot.text &&
        !item.contentSnapshot.primaryMediaAssetId
      )
        throw new Error("INVALID_PAYLOAD");
      if (item.contentSnapshot.primaryMediaAssetId) {
        const loaded = await this.media.load(
          item.userId,
          item.contentSnapshot.primaryMediaAssetId,
        );
        const rendered = await applyImageWatermark(
          loaded.bytes,
          loaded.mimeType,
          item.contentSnapshot.watermark,
        );
        payload = {
          type: "image",
          image: rendered.bytes,
          mimeType: rendered.mimeType,
          caption: item.contentSnapshot.text,
        };
      } else {
        payload = {
          type: "text",
          text: item.contentSnapshot.text,
          affiliateUrl: item.contentSnapshot.affiliateUrl,
          previewSourceUrl: item.contentSnapshot.sourceUrl,
          previewDescription: item.contentSnapshot.caption,
          productTitle: item.contentSnapshot.productTitle,
          watermark: item.contentSnapshot.watermark,
        };
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "MEDIA_INVALID";
      const transient = /TEMPORAR|TIMEOUT|STORAGE/i.test(code);
      await this.failKnown(delivery, code, transient, item);
      return;
    }

    const started = await this.repository.markSending(
      delivery.id,
      this.workerId,
    );
    if (!started) return;
    this.events?.publish(item.userId, {
      type: "dispatch.started",
      campaignId: campaign.id,
      queueItemId: item.id,
      deliveryId: delivery.id,
      status: "sending",
    });
    try {
      await this.quota?.consume(item.userId, "dispatch");
      const result = await this.transport.send({
        userId: item.userId,
        connectionId: campaign.connectionId,
        externalGroupId: context.delivery.externalGroupId,
        payload,
        idempotencyKey: delivery.id,
      });
      if (result.success === true) {
        await this.repository.markSent(
          delivery.id,
          this.workerId,
          result.externalMessageId,
        );
        await this.repository.recordEvent(item.userId, "dispatch.sent", {
          queue_item_id: item.id,
          delivery_id: delivery.id,
          campaign_id: campaign.id,
          connection_id: campaign.connectionId,
          whatsapp_group_id: delivery.whatsappGroupId,
          external_message_id: result.externalMessageId,
        });
        this.events?.publish(item.userId, {
          type: "dispatch.sent",
          campaignId: campaign.id,
          queueItemId: item.id,
          deliveryId: delivery.id,
          status: "sent",
        });
        await this.automate(item.userId, "DISPATCH_SENT", delivery.id, {
          deliveryId: delivery.id,
          queueItemId: item.id,
          campaignId: campaign.id,
        });
        await this.publishProgress(item);
        return;
      }
      if (result.uncertain) {
        await this.repository.markUncertain(
          delivery.id,
          this.workerId,
          result.errorCode,
        );
        await this.repository.recordEvent(item.userId, "dispatch.uncertain", {
          queue_item_id: item.id,
          delivery_id: delivery.id,
          error_code: result.errorCode,
        });
        this.events?.publish(item.userId, {
          type: "dispatch.uncertain",
          campaignId: campaign.id,
          queueItemId: item.id,
          deliveryId: delivery.id,
          status: "uncertain",
        });
        await this.publishProgress(item);
        return;
      }
      await this.failKnown(delivery, result.errorCode, result.transient, item);
    } catch {
      await this.repository.markUncertain(
        delivery.id,
        this.workerId,
        "WHATSAPP_SEND_RESULT_UNKNOWN",
      );
      await this.repository.recordEvent(item.userId, "dispatch.uncertain", {
        queue_item_id: item.id,
        delivery_id: delivery.id,
        error_code: "WHATSAPP_SEND_RESULT_UNKNOWN",
      });
      this.events?.publish(item.userId, {
        type: "dispatch.uncertain",
        campaignId: campaign.id,
        queueItemId: item.id,
        deliveryId: delivery.id,
        status: "uncertain",
      });
      await this.publishProgress(item);
    }
  }

  private async failKnown(
    delivery: QueueDelivery,
    errorCode: string,
    transient: boolean,
    item: QueueItem,
  ) {
    // attemptCount é o total anterior ao attempt atual. A transição SQL para
    // sending (ou a liberação de uma falha de mídia claimed) contabiliza este attempt.
    if (transient && delivery.attemptCount < 2) {
      const next = new Date(
        Date.now() + retryDelay(delivery.attemptCount + 1),
      ).toISOString();
      await this.repository.markRetry(
        delivery.id,
        this.workerId,
        errorCode,
        next,
      );
      await this.repository.recordEvent(
        item.userId,
        "dispatch.retry_scheduled",
        {
          queue_item_id: item.id,
          delivery_id: delivery.id,
          error_code: errorCode,
          next_attempt_at: next,
        },
      );
      this.events?.publish(item.userId, {
        type: "dispatch.retry",
        campaignId: item.campaignId,
        queueItemId: item.id,
        deliveryId: delivery.id,
        status: "retry_wait",
      });
    } else {
      await this.repository.markFailed(delivery.id, this.workerId, errorCode);
      await this.repository.recordEvent(item.userId, "dispatch.failed", {
        queue_item_id: item.id,
        delivery_id: delivery.id,
        error_code: errorCode,
      });
      this.events?.publish(item.userId, {
        type: "dispatch.failed",
        campaignId: item.campaignId,
        queueItemId: item.id,
        deliveryId: delivery.id,
        status: "failed",
      });
      await this.automate(item.userId, "DISPATCH_FAILED", delivery.id, {
        deliveryId: delivery.id,
        queueItemId: item.id,
        campaignId: item.campaignId,
        errorCode,
      });
    }
    await this.publishProgress(item);
  }

  private async automate(
    userId: string,
    eventType: "DISPATCH_SENT" | "DISPATCH_FAILED",
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.automations?.publish(
        userId,
        eventType,
        idempotencyKey,
        payload,
      );
    } catch (error) {
      console.error(
        "[AfiliHub:Dispatch] Falha ao enfileirar automação interna.",
        error,
      );
    }
  }

  private async publishProgress(previous: QueueItem) {
    const current = await this.repository
      .getQueueItem(previous.userId, previous.id)
      .catch(() => null);
    if (!current) return;
    this.events?.publish(current.userId, {
      type: "queue.item.updated",
      campaignId: current.campaignId,
      queueItemId: current.id,
      status: current.status,
      data: { progress: current.progress },
    });
    this.events?.publish(current.userId, {
      type: "campaign.progress.updated",
      campaignId: current.campaignId,
      queueItemId: current.id,
      status: current.status,
    });
    if (current.status === "completed") {
      await this.repository.recordEvent(
        current.userId,
        "queue.item.completed",
        {
          queue_item_id: current.id,
          campaign_id: current.campaignId,
          sent: current.progress.sent,
          total: current.progress.total,
        },
      );
    }
  }

  private async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;
    try {
      const jobs: Promise<void>[] = [];
      for (
        let index = 0;
        index < (this.options.parallelConnections ?? 5);
        index++
      ) {
        const delivery = await this.repository.claimNext(
          this.workerId,
          new Date(
            Date.now() - (this.options.staleMs ?? 120_000),
          ).toISOString(),
        );
        if (!delivery) break;
        jobs.push(this.process(delivery));
      }
      const results = await Promise.allSettled(jobs);
      processed = jobs.length;
      const rejected = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      if (rejected) {
        const now = Date.now();
        this.lastErrorCode = safeErrorCode(
          rejected.reason,
          "DISPATCH_PROCESS_FAILED",
        ).slice(0, 120);
        if (now - this.lastPollErrorAt >= 30_000) {
          console.error(
            "[AfiliHub:Dispatch] Processamento de entrega falhou; o item será recuperado pelo mecanismo de stale claim.",
            {
              errorCode: this.lastErrorCode,
            },
          );
          this.lastPollErrorAt = now;
        }
      } else {
        this.lastPollErrorAt = 0;
        this.lastErrorCode = null;
      }
    } catch (error) {
      const now = Date.now();
      this.lastErrorCode = safeErrorCode(error, "DISPATCH_POLL_FAILED").slice(
        0,
        120,
      );
      if (now - this.lastPollErrorAt >= 30_000) {
        console.error(
          "[AfiliHub:Dispatch] Ciclo do worker falhou; nova tentativa automática.",
          { errorCode: this.lastErrorCode },
        );
        this.lastPollErrorAt = now;
      }
    } finally {
      this.running = false;
    }
    return processed;
  }

  async start() {
    try {
      await this.recover();
    } catch (error) {
      const code = safeErrorCode(error, "DISPATCH_RECOVERY_FAILED");
      this.lastErrorCode = code.slice(0, 120);
      console.error(
        "[AfiliHub:Dispatch] Recuperação inicial indisponível; o worker continuará tentando.",
        { errorCode: code.slice(0, 120) },
      );
    }
    this.loop.start();
  }

  stop() {
    this.loop.stop();
  }
}
