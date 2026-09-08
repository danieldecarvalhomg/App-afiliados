import type { ProductRecord } from "../products/types";

export type InternalAutomationEventType =
  | "PROMOTION_DETECTED"
  | "MARKETPLACE_DEAL"
  | "PRODUCT_CREATED"
  | "AFFILIATE_CONVERTED"
  | "QUEUE_ITEM_ADDED"
  | "OFFER_APPROVED"
  | "OFFER_REJECTED"
  | "DISPATCH_SENT"
  | "DISPATCH_FAILED";

export interface InternalAutomationJob {
  id: string;
  userId: string;
  eventType: InternalAutomationEventType;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  attemptCount: number;
  workerId: string;
}
export interface InternalAutomationPublisher {
  publish(
    userId: string,
    eventType: InternalAutomationEventType,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
export interface InternalAutomationEventHandler {
  handle(job: InternalAutomationJob): Promise<void>;
}
export interface InternalAutomationRepository {
  enqueue(
    userId: string,
    eventType: InternalAutomationEventType,
    idempotencyKey: string,
    payload: Record<string, unknown>,
  ): Promise<string>;
  claimNext(
    workerId: string,
    staleBefore: string,
  ): Promise<InternalAutomationJob | null>;
  complete(
    job: InternalAutomationJob,
    level: "info" | "warning" | "error" | "success",
    message: string,
  ): Promise<void>;
  fail(
    job: InternalAutomationJob,
    errorCode: string,
    retryAt: string | null,
  ): Promise<void>;
}

export type AutomationTriggerType =
  | "PROMOTION_DETECTED"
  | "MARKETPLACE_DEAL"
  | "PRODUCT_CREATED";
export type AutomationStatus =
  | "draft"
  | "active"
  | "paused"
  | "error"
  | "archived";
export type AutomationActionType =
  | "QUEUE_AUTOMATICALLY"
  | "REVIEW_FIRST"
  | "PRODUCT_ONLY";
export type AutomationConditionMode = "all" | "any";
export type AutomationConditionField =
  | "marketplace"
  | "monitor"
  | "source_group"
  | "source_type"
  | "price"
  | "original_price"
  | "discount_percent"
  | "coupon_exists"
  | "free_shipping"
  | "category"
  | "product_title"
  | "keywords"
  | "image_available"
  | "affiliate_conversion_status"
  | "deal_score"
  | "commission";
export type AutomationOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "is_true"
  | "is_false"
  | "exists"
  | "not_exists";
export interface AutomationCondition {
  id: string;
  field: AutomationConditionField;
  operator: AutomationOperator;
  value?: string | number | boolean | null;
}
export interface AutomationTriggerConfig {
  scope?: "any" | "monitor" | "group";
  monitorId?: string | null;
  groupId?: string | null;
  sourceType?: ProductRecord["sourceType"] | null;
}
export interface AutomationPreparationConfig {
  messageMode?: "generated_cta" | "original_message";
  templateId?: string | null;
  useDefaultTemplate?: boolean;
  instruction?: string | null;
  autoSelectMedia?: boolean;
  requireImage?: boolean;
}
export interface AutomationActionConfig {
  queueId?: string | null;
  placement?: "end" | "next";
  allowDuplicate?: boolean;
}
export interface AutomationConfiguration {
  name: string;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  conditionMode: AutomationConditionMode;
  conditions: AutomationCondition[];
  preparationConfig: AutomationPreparationConfig;
  actionType: AutomationActionType;
  actionConfig: AutomationActionConfig;
  evaluationOrder: number;
  stopAfterMatch: boolean;
}
export interface AutomationRule extends AutomationConfiguration {
  id: string;
  userId: string;
  status: AutomationStatus;
  currentVersion: number;
  triggerCount: number;
  lastTriggeredAt: string | null;
  activatedAt: string | null;
  safetyPausedAt: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
  metrics?: {
    analyzed: number;
    matched: number;
    completed: number;
    failed: number;
    awaitingReview: number;
    ignored: number;
  };
}
export interface AutomationVersion {
  id: string;
  automationId: string;
  userId: string;
  version: number;
  configuration: AutomationConfiguration;
  createdAt: string;
}
export type AutomationExecutionStatus =
  | "received"
  | "evaluating"
  | "matched"
  | "processing"
  | "awaiting_review"
  | "queued"
  | "completed"
  | "ignored"
  | "failed"
  | "cancelled"
  | "waiting_dependency"
  | "retry_wait";
export interface AutomationExecution {
  id: string;
  userId: string;
  automationId: string;
  automationVersionId: string;
  eventType: AutomationTriggerType;
  sourceType: string;
  sourceReferenceId: string;
  eventPayload: Record<string, unknown>;
  origin: string;
  causationId: string | null;
  evaluationOrder: number;
  stopAfterMatch: boolean;
  status: AutomationExecutionStatus;
  attemptCount: number;
  workerId: string;
  errorCode: string | null;
  errorMessageSafe: string | null;
  preparedSnapshotId: string | null;
  queueItemId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ConditionResult {
  conditionId: string;
  field: AutomationConditionField;
  operator: AutomationOperator;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}
export interface AutomationEventContext {
  sourceType: string;
  sourceReferenceId: string;
  productId?: string | null;
  captureId?: string | null;
  marketplace?: string | null;
  monitor?: string | null;
  sourceGroup?: string | null;
  productSourceType?: string | null;
  price?: number | null;
  originalPrice?: number | null;
  discountPercent?: number | null;
  couponExists?: boolean | null;
  freeShipping?: boolean | null;
  category?: string | null;
  productTitle?: string | null;
  keywords?: string | null;
  imageAvailable?: boolean | null;
  affiliateConversionStatus?: string | null;
  dealScore?: number | null;
  commission?: number | null;
}
export interface PreparedSnapshot {
  id: string;
  executionId: string;
  snapshotVersion: number;
  productId: string;
  sourceType: string;
  sourceReferenceId: string | null;
  finalText: string;
  primaryMediaAssetId: string | null;
  affiliateUrl: string | null;
  sourceUrl: string | null;
  templateId: string | null;
  templateVersion: number | null;
  ctaGenerationId: string | null;
  preparedAt: string;
}
export interface AutomationReview {
  id: string;
  automationId: string;
  automationName: string;
  executionId: string;
  preparedSnapshotId: string;
  plannedQueueId: string | null;
  plannedQueueName: string | null;
  status: "pending" | "approved" | "rejected";
  product: Pick<
    ProductRecord,
    "id" | "title" | "marketplace" | "price" | "discountPercent"
  >;
  snapshot: PreparedSnapshot;
  createdAt: string;
}
export interface AutomationOptions {
  queues: Array<{ id: string; name: string; status: string }>;
  templates: Array<{
    id: string;
    name: string;
    active: boolean;
    isDefault: boolean;
  }>;
  monitors: Array<{ id: string; name: string; groupId: string }>;
  products: Array<{
    id: string;
    title: string;
    marketplace: string;
    sourceType: string;
  }>;
}
export interface AutomationRepository {
  list(userId: string): Promise<AutomationRule[]>;
  get(userId: string, id: string): Promise<AutomationRule | null>;
  create(
    userId: string,
    input: AutomationConfiguration,
  ): Promise<AutomationRule>;
  update(
    userId: string,
    id: string,
    input: AutomationConfiguration,
  ): Promise<AutomationRule | null>;
  setStatus(
    userId: string,
    id: string,
    status: AutomationStatus,
    errorCode?: string | null,
  ): Promise<AutomationRule | null>;
  reorder(userId: string, ids: string[]): Promise<AutomationRule[]>;
  options(userId: string): Promise<AutomationOptions>;
  enqueueEvent(job: InternalAutomationJob): Promise<number>;
  claimNext(
    workerId: string,
    staleBefore: string,
  ): Promise<AutomationExecution | null>;
  getVersion(execution: AutomationExecution): Promise<AutomationVersion | null>;
  eventContext(
    execution: AutomationExecution,
  ): Promise<AutomationEventContext | null>;
  captureContextForAnalysis?(
    userId: string,
    analysisId: string,
  ): Promise<Pick<AutomationEventContext, "captureId" | "monitor" | "sourceGroup"> | null>;
  priorStoppingMatch(execution: AutomationExecution): Promise<boolean>;
  recentExecutionCount(userId: string, since: string): Promise<number>;
  safetyPause(userId: string): Promise<void>;
  trace(
    execution: AutomationExecution,
    stepType: string,
    status: "passed" | "failed" | "skipped" | "completed",
    facts?: Record<string, unknown>,
  ): Promise<void>;
  finish(
    execution: AutomationExecution,
    status: AutomationExecutionStatus,
    patch?: {
      errorCode?: string | null;
      errorMessageSafe?: string | null;
      preparedSnapshotId?: string | null;
      queueItemId?: string | null;
    },
  ): Promise<void>;
  retry(
    execution: AutomationExecution,
    errorCode: string,
    message: string,
    retryAt: string | null,
  ): Promise<void>;
  waitForAffiliate(
    execution: AutomationExecution,
    productId: string,
    message: string,
  ): Promise<void>;
  resumeAfterAffiliateConversion(
    userId: string,
    conversionId: string,
  ): Promise<number>;
  saveSnapshot(
    execution: AutomationExecution,
    input: Omit<
      PreparedSnapshot,
      "id" | "executionId" | "snapshotVersion" | "preparedAt"
    >,
  ): Promise<PreparedSnapshot>;
  createReview(
    execution: AutomationExecution,
    snapshot: PreparedSnapshot,
    queueId: string | null,
  ): Promise<AutomationReview>;
  listExecutions(
    userId: string,
    automationId?: string,
  ): Promise<AutomationExecution[]>;
  deleteExecution(userId: string, executionId: string): Promise<boolean>;
  listReviews(userId: string): Promise<AutomationReview[]>;
  getReview(userId: string, id: string): Promise<AutomationReview | null>;
  updateReviewSnapshot(
    userId: string,
    id: string,
    snapshot: PreparedSnapshot,
  ): Promise<void>;
  completeReview(
    userId: string,
    id: string,
    status: "approved" | "rejected",
    reason?: string | null,
  ): Promise<void>;
  findDuplicateQueueItem(
    userId: string,
    productId: string,
  ): Promise<string | null>;
}
