import type { WhatsAppConnectionStatus } from "../whatsapp/types";

export type CampaignStatus =
  | "draft"
  | "active"
  | "pause_requested"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";
export type QueueMode = "continuous" | "fixed_slots" | "manual";
export type QueueSourceType = "cta_generation" | "offer" | "manual";
export type QueueItemStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "completed"
  | "partially_failed"
  | "failed"
  | "paused"
  | "cancelled";
export type QueueDeliveryStatus =
  | "pending"
  | "scheduled"
  | "claimed"
  | "sending"
  | "sent"
  | "retry_wait"
  | "failed"
  | "cancelled"
  | "skipped"
  | "uncertain";
export type WatermarkPosition =
  "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";

export interface DispatchWatermarkSettings {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  opacity: number;
}

export interface DispatchPresentationSettings {
  defaultCaption: string;
  watermark: DispatchWatermarkSettings;
}

export interface CampaignGroup {
  id: string;
  campaignId: string;
  userId: string;
  whatsappGroupId: string;
  name: string;
  externalGroupId: string;
  participantsCount: number;
  syncStatus: "active" | "unavailable";
  createdAt: string;
}

/**
 * Campanha editorial: um agrupamento reutilizável de grupos. Ela não possui
 * cadência nem estado de execução; essas decisões pertencem à fila.
 */
export interface CampaignCollection {
  id: string;
  userId: string;
  name: string;
  connectionId: string;
  connectionLabel: string;
  groups: CampaignGroup[];
  createdAt: string;
  updatedAt: string;
}
export interface QueueSettings {
  mode: QueueMode;
  intervalBetweenItemsSeconds: number;
  timezone: string;
  allowedStartTime: string;
  allowedEndTime: string;
  allowedDays: number[];
  fixedSlots: string[];
}
export interface Campaign extends QueueSettings {
  id: string;
  userId: string;
  name: string;
  connectionId: string;
  connectionLabel: string;
  status: CampaignStatus;
  defaultIntervalSeconds: number;
  groups: CampaignGroup[];
  pendingItems: number;
  historyItems: number;
  currentItemId: string | null;
  nextExecutionAt: string | null;
  lastItemCompletedAt: string | null;
  lastDispatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export type DispatchQueue = Campaign;

export interface DispatchContentSnapshot {
  text: string;
  caption: string | null;
  primaryMediaAssetId: string | null;
  hasMedia: boolean;
  watermark: DispatchWatermarkSettings;
  affiliateUrl: string | null;
  sourceUrl: string | null;
  productId: string | null;
  productTitle: string | null;
  ctaGenerationId: string | null;
  templateId: string | null;
  templateVersion: number | null;
  generatedAt: string;
}
export interface QueueDestinationSnapshot {
  whatsappGroupId: string;
  name: string;
  externalGroupId: string;
}
export interface QueueProgress {
  total: number;
  sent: number;
  failed: number;
  pending: number;
  uncertain: number;
}
export interface QueueItem {
  id: string;
  userId: string;
  campaignId: string;
  campaignName: string;
  connectionId: string;
  connectionLabel: string;
  sourceType: QueueSourceType;
  sourceReferenceId: string | null;
  contentSnapshot: DispatchContentSnapshot;
  destinationSnapshot: QueueDestinationSnapshot[];
  queueConfigSnapshot: QueueSettings;
  position: number;
  scheduledAt: string;
  nextExecutionAt: string | null;
  manualRequestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  status: QueueItemStatus;
  idempotencyKey: string;
  progress: QueueProgress;
  createdAt: string;
  updatedAt: string;
}
export interface QueueDelivery {
  id: string;
  userId: string;
  queueItemId: string;
  campaignId: string;
  connectionId: string;
  whatsappGroupId: string;
  groupName: string;
  externalGroupId: string;
  status: QueueDeliveryStatus;
  scheduledAt: string;
  nextAttemptAt: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  claimedAt: string | null;
  claimedBy: string | null;
  sendingStartedAt: string | null;
  sentAt: string | null;
  externalMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CtaDispatchSource {
  generationId: string;
  productId: string;
  productTitle: string;
  finalText: string;
  publishable: boolean;
  affiliateUrl: string | null;
  sourceUrl: string | null;
  primaryMediaAssetId: string | null;
  templateId: string | null;
  templateVersion: number | null;
  presentation: DispatchPresentationSettings;
  generatedAt: string;
}
export interface ClaimedDelivery extends QueueDelivery {}
export interface DeliveryContext {
  delivery: QueueDelivery;
  campaign: Campaign;
  item: QueueItem;
  connectionStatus: WhatsAppConnectionStatus;
  groupSyncStatus: "active" | "unavailable";
}
export type DispatchPayload =
  | {
      type: "text";
      text: string;
      affiliateUrl?: string | null;
      previewSourceUrl?: string | null;
      previewDescription?: string | null;
      productTitle?: string | null;
      watermark?: DispatchWatermarkSettings;
    }
  | { type: "image"; image: Uint8Array; mimeType: string; caption: string };
export type DispatchTransportResult =
  | { success: true; externalMessageId: string }
  | {
      success: false;
      errorCode: string;
      transient: boolean;
      uncertain?: boolean;
    };

export interface CreateCampaignInput {
  name: string;
  connectionId: string;
  groupIds: string[];
  defaultIntervalSeconds?: number;
  intervalBetweenItemsSeconds?: number;
  timezone?: string;
  mode?: QueueMode;
  allowedStartTime?: string;
  allowedEndTime?: string;
  allowedDays?: number[];
  fixedSlots?: string[];
}
export interface CreateCampaignCollectionInput {
  name: string;
  connectionId: string;
  groupIds: string[];
}
export type CreateDispatchQueueInput = CreateCampaignInput;
export interface CreateQueueInput {
  campaignId: string;
  /** Restringe este item a um único grupo pertencente à campanha. */
  whatsappGroupId?: string | null;
  sourceType: QueueSourceType;
  sourceReferenceId?: string | null;
  text?: string;
  captionMode?: "message" | "fixed" | "custom";
  caption?: string | null;
  primaryMediaAssetId?: string | null;
  watermark?: Partial<DispatchWatermarkSettings>;
  affiliateUrl?: string | null;
  sourceUrl?: string | null;
  productId?: string | null;
  productTitle?: string | null;
  scheduledAt?: string;
  placement?: "end" | "next";
  idempotencyKey: string;
  expectedSnapshotHash?: string;
}
export interface QueuePreview {
  campaign: Campaign;
  destinations: QueueDestinationSnapshot[];
  snapshot: DispatchContentSnapshot;
  scheduledAt: string;
  nextExecutionAt: string | null;
  position: number;
  snapshotHash: string;
}
