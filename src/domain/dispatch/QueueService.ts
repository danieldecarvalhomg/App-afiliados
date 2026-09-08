import { createHash } from "node:crypto";
import type { DispatchRepository } from "./DispatchRepository";
import type { InternalAutomationPublisher } from "../automation/types";
import type {
  CreateQueueInput,
  DispatchContentSnapshot,
  DispatchPresentationSettings,
  DispatchWatermarkSettings,
  QueuePreview,
  WatermarkPosition,
} from "./types";
import { QueueScheduleCalculator } from "./QueueScheduleCalculator";

function iso(value: string | undefined) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("QUEUE_SCHEDULE_INVALID");
  return date.toISOString();
}
function validateText(value: string) {
  const text = value.trim();
  if (text.length > 4096) throw new Error("QUEUE_TEXT_TOO_LONG");
  return text;
}
const positions: WatermarkPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
  "center",
];
const defaultPresentation: DispatchPresentationSettings = {
  defaultCaption: "",
  watermark: {
    enabled: false,
    text: "",
    position: "bottom-right",
    opacity: 0.72,
  },
};
function caption(value: string) {
  const text = value.trim();
  if (text.length > 4096) throw new Error("QUEUE_CAPTION_TOO_LONG");
  return text;
}
function resolvePreviewDescription(
  input: CreateQueueInput,
  presentation: DispatchPresentationSettings,
) {
  if (input.captionMode === "message") return null;
  if (input.captionMode === "fixed")
    return caption(presentation.defaultCaption) || null;
  if (input.captionMode === "custom")
    return caption(input.caption ?? "") || null;
  return (
    caption(
      input.caption === undefined
        ? presentation.defaultCaption
        : (input.caption ?? ""),
    ) || null
  );
}
function watermark(
  value: Partial<DispatchWatermarkSettings> | undefined,
  fallback = defaultPresentation.watermark,
): DispatchWatermarkSettings {
  const enabled = value?.enabled ?? fallback.enabled;
  const text = (value?.text ?? fallback.text).trim();
  const position = value?.position ?? fallback.position;
  const opacity = Number(value?.opacity ?? fallback.opacity);
  if (enabled && !text) throw new Error("QUEUE_WATERMARK_TEXT_REQUIRED");
  if (text.length > 120) throw new Error("QUEUE_WATERMARK_TEXT_TOO_LONG");
  if (!positions.includes(position))
    throw new Error("QUEUE_WATERMARK_POSITION_INVALID");
  if (!Number.isFinite(opacity) || opacity < 0.1 || opacity > 1)
    throw new Error("QUEUE_WATERMARK_OPACITY_INVALID");
  return { enabled, text, position, opacity };
}

export class QueueService {
  private readonly schedule = new QueueScheduleCalculator();
  constructor(
    private repository: DispatchRepository,
    private automations?: InternalAutomationPublisher,
  ) {}
  list(userId: string, status?: string, campaignId?: string) {
    return this.repository.listQueue(userId, status, campaignId);
  }
  async get(userId: string, id: string) {
    const item = await this.repository.getQueueItem(userId, id);
    if (!item) throw new Error("QUEUE_ITEM_NOT_FOUND");
    return {
      ...item,
      deliveries: await this.repository.listDeliveries(userId, id),
    };
  }
  private async resolve(
    userId: string,
    input: CreateQueueInput,
  ): Promise<QueuePreview> {
    const campaign = await this.repository.getCampaign(
      userId,
      input.campaignId,
    );
    if (!campaign) throw new Error("CAMPAIGN_NOT_FOUND");
    if (["cancelled", "archived", "completed"].includes(campaign.status))
      throw new Error("CAMPAIGN_NOT_QUEUEABLE");
    const selectedGroups = input.whatsappGroupId
      ? campaign.groups.filter(
          (group) => group.whatsappGroupId === input.whatsappGroupId,
        )
      : campaign.groups;
    if (input.whatsappGroupId && selectedGroups.length === 0)
      throw new Error("QUEUE_GROUP_NOT_IN_CAMPAIGN");
    if (selectedGroups.length === 0)
      throw new Error("CAMPAIGN_DESTINATIONS_REQUIRED");
    const destinations = selectedGroups.map((group) => ({
      whatsappGroupId: group.whatsappGroupId,
      name: group.name,
      externalGroupId: group.externalGroupId,
    }));
    const scheduledAt = iso(input.scheduledAt);
    let snapshot: DispatchContentSnapshot;
    if (input.sourceType === "cta_generation") {
      if (!input.sourceReferenceId) throw new Error("CTA_GENERATION_REQUIRED");
      const source = await this.repository.getCtaDispatchSource(
        userId,
        input.sourceReferenceId,
      );
      if (!source) throw new Error("CTA_GENERATION_NOT_FOUND");
      if (!source.publishable) throw new Error("CTA_NOT_PUBLISHABLE");
      const text = validateText(source.finalText);
      if (!text && !source.primaryMediaAssetId)
        throw new Error("QUEUE_CONTENT_EMPTY");
      const hasMedia = Boolean(source.primaryMediaAssetId);
      snapshot = {
        text,
        caption: hasMedia
          ? null
          : resolvePreviewDescription(input, source.presentation),
        primaryMediaAssetId: source.primaryMediaAssetId,
        hasMedia,
        watermark: watermark(input.watermark, source.presentation.watermark),
        affiliateUrl: source.affiliateUrl,
        sourceUrl: source.sourceUrl,
        productId: source.productId,
        productTitle: source.productTitle,
        ctaGenerationId: source.generationId,
        templateId: source.templateId,
        templateVersion: source.templateVersion,
        generatedAt: source.generatedAt,
      };
    } else if (input.sourceType === "manual") {
      const text = validateText(input.text ?? "");
      if (!text && !input.primaryMediaAssetId)
        throw new Error("QUEUE_CONTENT_EMPTY");
      const hasMedia = Boolean(input.primaryMediaAssetId);
      snapshot = {
        text,
        caption: hasMedia
          ? null
          : resolvePreviewDescription(input, defaultPresentation),
        primaryMediaAssetId: input.primaryMediaAssetId ?? null,
        hasMedia,
        watermark: watermark(input.watermark),
        affiliateUrl: input.affiliateUrl ?? null,
        sourceUrl: input.sourceUrl ?? null,
        productId: input.productId ?? null,
        productTitle: input.productTitle?.trim() || null,
        ctaGenerationId: null,
        templateId: null,
        templateVersion: null,
        generatedAt: scheduledAt,
      };
    } else throw new Error("QUEUE_SOURCE_NOT_IMPLEMENTED");
    if (
      snapshot.primaryMediaAssetId &&
      !(await this.repository.ownsMediaAsset(
        userId,
        snapshot.primaryMediaAssetId,
      ))
    )
      throw new Error("QUEUE_MEDIA_FORBIDDEN");
    const active = (
      await this.repository.listQueue(userId, undefined, campaign.id)
    ).filter(
      (item) =>
        !["completed", "failed", "partially_failed", "cancelled"].includes(
          item.status,
        ),
    );
    const position =
      input.placement === "next"
        ? 1
        : Math.max(0, ...active.map((item) => item.position)) + 1;
    let nextExecutionAt: string | null = null;
    if (campaign.mode !== "manual") {
      const now = new Date();
      const tail =
        input.placement === "end"
          ? [...active].reverse().find((item) => item.nextExecutionAt)
              ?.nextExecutionAt
          : null;
      const cursor = new Date(
        Math.max(
          now.getTime(),
          new Date(scheduledAt).getTime(),
          tail
            ? new Date(tail).getTime() +
                campaign.intervalBetweenItemsSeconds * 1000
            : 0,
          campaign.lastItemCompletedAt
            ? new Date(campaign.lastItemCompletedAt).getTime() +
                campaign.intervalBetweenItemsSeconds * 1000
            : 0,
        ),
      );
      nextExecutionAt = this.schedule
        .nextEligible(cursor, campaign)
        .toISOString();
    }
    const snapshotHash = createHash("sha256")
      .update(
        JSON.stringify({
          snapshot,
          destinationIds: destinations.map((value) => value.whatsappGroupId),
        }),
      )
      .digest("hex");
    return {
      campaign,
      destinations,
      snapshot: Object.freeze({ ...snapshot }),
      scheduledAt,
      nextExecutionAt,
      position,
      snapshotHash,
    };
  }
  preview(userId: string, input: CreateQueueInput) {
    return this.resolve(userId, input);
  }
  async create(userId: string, input: CreateQueueInput) {
    if (!input.idempotencyKey?.trim() || input.idempotencyKey.length > 120)
      throw new Error("QUEUE_IDEMPOTENCY_KEY_REQUIRED");
    const preview = await this.resolve(userId, input);
    if (
      !input.expectedSnapshotHash ||
      input.expectedSnapshotHash !== preview.snapshotHash
    )
      throw new Error("QUEUE_SNAPSHOT_CHANGED");
    const item = await this.repository.enqueue(userId, {
      campaignId: preview.campaign.id,
      whatsappGroupId: input.whatsappGroupId ?? null,
      sourceType: input.sourceType,
      sourceReferenceId: input.sourceReferenceId ?? null,
      snapshot: preview.snapshot,
      scheduledAt: preview.scheduledAt,
      placement: input.placement ?? "end",
      idempotencyKey: input.idempotencyKey.trim(),
    });
    await this.repository.recordEvent(userId, "queue.item.created", {
      queue_item_id: item.id,
      queue_id: item.campaignId,
      whatsapp_group_id: input.whatsappGroupId ?? null,
      position: item.position,
    });
    try {
      await this.automations?.publish(userId, "QUEUE_ITEM_ADDED", item.id, {
        queueItemId: item.id,
        campaignId: item.campaignId,
        scheduledAt: item.scheduledAt,
      });
    } catch (error) {
      console.error(
        "[AfiliHub:Queue] Falha ao enfileirar automação interna.",
        error,
      );
    }
    return item;
  }
  async pause(userId: string, id: string) {
    const item = await this.repository.setQueuePaused(userId, id, true);
    if (!item) throw new Error("QUEUE_ITEM_NOT_FOUND");
    await this.repository.recordEvent(userId, "queue.item.paused", {
      queue_item_id: id,
    });
    return item;
  }
  async resume(userId: string, id: string) {
    const item = await this.repository.setQueuePaused(userId, id, false);
    if (!item) throw new Error("QUEUE_ITEM_NOT_FOUND");
    await this.repository.recordEvent(userId, "queue.item.resumed", {
      queue_item_id: id,
    });
    return item;
  }
  async cancel(userId: string, id: string) {
    const item = await this.repository.cancelQueueItem(userId, id);
    if (!item) throw new Error("QUEUE_ITEM_NOT_FOUND");
    await this.repository.recordEvent(userId, "queue.item.cancelled", {
      queue_item_id: id,
    });
    return item;
  }
  async retry(userId: string, id: string, includeUncertain = false) {
    const item = await this.repository.retryQueueItem(
      userId,
      id,
      includeUncertain,
    );
    if (!item) throw new Error("QUEUE_ITEM_NOT_FOUND");
    await this.repository.recordEvent(userId, "queue.item.retry_requested", {
      queue_item_id: id,
      include_uncertain: includeUncertain,
    });
    return item;
  }
  async reorder(userId: string, campaignId: string, itemIds: string[]) {
    if (
      !Array.isArray(itemIds) ||
      !itemIds.length ||
      new Set(itemIds).size !== itemIds.length
    )
      throw new Error("QUEUE_ORDER_INVALID");
    const items = await this.repository.reorderQueueItems(
      userId,
      campaignId,
      itemIds,
    );
    await this.repository.recordEvent(userId, "queue.reordered", {
      queue_id: campaignId,
      item_ids: itemIds,
    });
    return items;
  }
  async sendNext(userId: string, campaignId: string) {
    const item = await this.repository.requestQueueNext(userId, campaignId);
    if (!item) throw new Error("QUEUE_EMPTY");
    await this.repository.recordEvent(userId, "queue.manual_requested", {
      queue_id: campaignId,
      queue_item_id: item.id,
    });
    return item;
  }
  async retryDelivery(
    userId: string,
    deliveryId: string,
    includeUncertain = false,
  ) {
    const delivery = await this.repository.retryDelivery(
      userId,
      deliveryId,
      includeUncertain,
    );
    if (!delivery) throw new Error("QUEUE_DELIVERY_NOT_FOUND");
    await this.repository.recordEvent(
      userId,
      "queue.delivery.retry_requested",
      { delivery_id: deliveryId, include_uncertain: includeUncertain },
    );
    return delivery;
  }
}
