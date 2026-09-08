import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AutomationConfiguration,
  AutomationEventContext,
  AutomationExecution,
  AutomationExecutionStatus,
  AutomationOptions,
  AutomationRepository,
  AutomationReview,
  AutomationRule,
  AutomationStatus,
  AutomationVersion,
  InternalAutomationJob,
  PreparedSnapshot,
} from "../../domain/automation/types";
type Row = Record<string, any>;
const isMissingColumnError = (error: Row | null, column: string) => {
  if (!error) return false;
  if (error.code === "42703") return true;
  return (
    error.code === "PGRST204" &&
    typeof error.message === "string" &&
    error.message.includes(`'${column}' column`)
  );
};
const config = (r: Row): AutomationConfiguration => ({
  name: r.name,
  triggerType: r.trigger_type,
  triggerConfig: r.trigger_config ?? {},
  conditionMode: r.condition_mode ?? "all",
  conditions: Array.isArray(r.conditions) ? r.conditions : [],
  preparationConfig: r.preparation_config ?? {},
  actionType: r.action_type,
  actionConfig: r.action_config ?? {},
  evaluationOrder: Number(r.evaluation_order ?? 0),
  stopAfterMatch: r.stop_after_match !== false,
});
const rule = (r: Row): AutomationRule => ({
  id: r.id,
  userId: r.user_id,
  status: r.status,
  currentVersion: Number(r.current_version ?? 1),
  triggerCount: Number(r.trigger_count ?? 0),
  lastTriggeredAt: r.last_triggered_at ?? null,
  activatedAt: r.activated_at ?? null,
  safetyPausedAt: r.safety_paused_at ?? null,
  errorCode: r.error_code ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  ...config(r),
});
const execution = (r: Row): AutomationExecution => ({
  id: r.id,
  userId: r.user_id,
  automationId: r.automation_id,
  automationVersionId: r.automation_version_id,
  eventType: r.event_type,
  sourceType: r.source_type,
  sourceReferenceId: r.source_reference_id,
  eventPayload: r.event_payload ?? {},
  origin: r.origin ?? "domain",
  causationId: r.causation_id ?? null,
  evaluationOrder: Number(r.evaluation_order ?? 0),
  stopAfterMatch: r.stop_after_match !== false,
  status: r.status,
  attemptCount: Number(r.attempt_count ?? 0),
  workerId: r.locked_by ?? "",
  errorCode: r.error_code ?? null,
  errorMessageSafe: r.error_message_safe ?? null,
  preparedSnapshotId: r.prepared_snapshot_id ?? null,
  queueItemId: r.queue_item_id ?? null,
  startedAt: r.started_at ?? null,
  completedAt: r.completed_at ?? null,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
const snapshot = (r: Row): PreparedSnapshot => ({
  id: r.id,
  executionId: r.execution_id,
  snapshotVersion: Number(r.snapshot_version),
  productId: r.product_id,
  sourceType: r.source_type,
  sourceReferenceId: r.source_reference_id ?? null,
  finalText: r.final_text,
  primaryMediaAssetId: r.primary_media_asset_id ?? null,
  affiliateUrl: r.affiliate_url ?? null,
  sourceUrl: r.source_url ?? null,
  templateId: r.template_id ?? null,
  templateVersion:
    r.template_version == null ? null : Number(r.template_version),
  ctaGenerationId: r.cta_generation_id ?? null,
  preparedAt: r.prepared_at,
});

export class SupabaseAutomationRepository implements AutomationRepository {
  constructor(private db: SupabaseClient) {}
  private row(input: AutomationConfiguration) {
    return {
      name: input.name.trim(),
      trigger_condition: input.triggerType,
      action: input.actionType,
      trigger_type: input.triggerType,
      trigger_config: input.triggerConfig,
      condition_mode: input.conditionMode,
      conditions: input.conditions,
      preparation_config: input.preparationConfig,
      action_type: input.actionType,
      action_config: input.actionConfig,
      evaluation_order: input.evaluationOrder,
      stop_after_match: input.stopAfterMatch,
      updated_at: new Date().toISOString(),
    };
  }
  async list(userId: string) {
    const { data, error } = await this.db
      .from("automation_rules")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("evaluation_order")
      .order("created_at");
    if (error) throw error;
    const items = (data ?? []).map(rule);
    const { data: stats, error: statsError } = await this.db
      .from("automation_executions")
      .select("automation_id,status")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60_000).toISOString());
    if (statsError) throw statsError;
    return items.map((item) => {
      const rows = (stats ?? []).filter((x) => x.automation_id === item.id);
      return {
        ...item,
        metrics: {
          analyzed: rows.length,
          matched: rows.filter(
            (x) => !["ignored", "cancelled"].includes(x.status),
          ).length,
          completed: rows.filter((x) =>
            ["completed", "queued"].includes(x.status),
          ).length,
          failed: rows.filter((x) => x.status === "failed").length,
          awaitingReview: rows.filter((x) => x.status === "awaiting_review")
            .length,
          ignored: rows.filter((x) => x.status === "ignored").length,
        },
      };
    });
  }
  async get(userId: string, id: string) {
    const { data, error } = await this.db
      .from("automation_rules")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rule(data) : null;
  }
  async create(userId: string, input: AutomationConfiguration) {
    const { data, error } = await this.db
      .from("automation_rules")
      .insert({
        user_id: userId,
        status: "draft",
        trigger_count: 0,
        ...this.row(input),
        current_version: 1,
      })
      .select("*")
      .single();
    if (error) throw error;
    await this.version(userId, data.id, 1, input);
    return rule(data);
  }
  async update(userId: string, id: string, input: AutomationConfiguration) {
    const current = await this.get(userId, id);
    if (!current) return null;
    const next = current.currentVersion + 1;
    const { data, error } = await this.db
      .from("automation_rules")
      .update({ ...this.row(input), current_version: next, error_code: null })
      .eq("user_id", userId)
      .eq("id", id)
      .neq("status", "archived")
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    await this.version(userId, id, next, input);
    return rule(data);
  }
  private async version(
    userId: string,
    id: string,
    version: number,
    input: AutomationConfiguration,
  ) {
    const { error } = await this.db
      .from("automation_versions")
      .insert({
        automation_id: id,
        user_id: userId,
        version,
        configuration_snapshot: input,
      });
    if (error) throw error;
  }
  async setStatus(
    userId: string,
    id: string,
    status: AutomationStatus,
    errorCode: string | null = null,
  ) {
    const patch: Row = {
      status,
      error_code: errorCode,
      updated_at: new Date().toISOString(),
    };
    if (status === "active") patch.activated_at = new Date().toISOString();
    const { data, error } = await this.db
      .from("automation_rules")
      .update(patch)
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return data ? rule(data) : null;
  }
  async reorder(userId: string, ids: string[]) {
    const current = await this.list(userId);
    if (
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !current.some((x) => x.id === id))
    )
      throw new Error("AUTOMATION_ORDER_INVALID");
    for (let i = 0; i < ids.length; i++) {
      const { error } = await this.db
        .from("automation_rules")
        .update({ evaluation_order: i, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", ids[i]);
      if (error) throw error;
    }
    return this.list(userId);
  }
  async options(userId: string): Promise<AutomationOptions> {
    const [q, t, m, p, d] = await Promise.all([
      this.db
        .from("campaigns")
        .select("id,name,status")
        .eq("user_id", userId)
        .not("status", "in", "(archived,cancelled,completed)")
        .order("name"),
      this.db
        .from("cta_templates")
        .select("id,name,active,is_default")
        .eq("user_id", userId)
        .eq("active", true)
        .order("name"),
      this.db
        .from("group_monitors")
        .select("id,group_id,whatsapp_groups(name)")
        .eq("user_id", userId)
        .eq("enabled", true)
        .is("deleted_at", null),
      this.db
        .from("products")
        .select("id,title,marketplace,source_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      this.db
        .from("system_events")
        .select("payload")
        .eq("user_id", userId)
        .eq("event_type", "product.deleted"),
    ]);
    for (const x of [q, t, m, p, d]) if (x.error) throw x.error;
    const deletedProductIds = new Set(
      (d.data ?? [])
        .map((x: Row) => x.payload?.product_id)
        .filter((id): id is string => typeof id === "string"),
    );
    return {
      queues: (q.data ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        status: x.status,
      })),
      templates: (t.data ?? []).map((x) => ({
        id: x.id,
        name: x.name,
        active: x.active !== false,
        isDefault: Boolean(x.is_default),
      })),
      monitors: (m.data ?? []).map((x: Row) => ({
        id: x.id,
        name:
          (Array.isArray(x.whatsapp_groups)
            ? x.whatsapp_groups[0]
            : x.whatsapp_groups
          )?.name ?? "Monitor",
        groupId: x.group_id,
      })),
      products: (p.data ?? [])
        .filter((x) => !deletedProductIds.has(x.id))
        .map((x) => ({
          id: x.id,
          title: x.title,
          marketplace: x.marketplace,
          sourceType: x.source_type,
        })),
    };
  }
  async enqueueEvent(job: InternalAutomationJob) {
    if (
      !["PROMOTION_DETECTED", "MARKETPLACE_DEAL", "PRODUCT_CREATED"].includes(
        job.eventType,
      )
    )
      return 0;
    const { data: rules, error } = await this.db
      .from("automation_rules")
      .select("*")
      .eq("user_id", job.userId)
      .eq("status", "active")
      .eq("trigger_type", job.eventType)
      .order("evaluation_order");
    if (error) throw error;
    const sourceType =
      job.eventType === "PROMOTION_DETECTED"
        ? "promotion"
        : job.eventType === "MARKETPLACE_DEAL"
          ? "marketplace_deal"
          : "product";
    const sourceReferenceId = String(
      job.payload.capturedMessageId ??
        job.payload.dealId ??
        job.payload.productId ??
        job.idempotencyKey,
    );
    let count = 0;
    for (const row of rules ?? []) {
      const { data: v, error: vError } = await this.db
        .from("automation_versions")
        .select("*")
        .eq("automation_id", row.id)
        .eq("user_id", job.userId)
        .eq("version", row.current_version)
        .maybeSingle();
      if (vError) throw vError;
      if (!v) continue;
      const payload = { ...job.payload, internalJobId: job.id };
      const { error: insertError } = await this.db
        .from("automation_executions")
        .insert({
          user_id: job.userId,
          automation_id: row.id,
          automation_version_id: v.id,
          event_type: job.eventType,
          source_type: sourceType,
          source_reference_id: sourceReferenceId,
          event_payload: payload,
          origin: String(job.payload.origin ?? "domain"),
          causation_id:
            typeof job.payload.causationId === "string"
              ? job.payload.causationId
              : job.id,
          evaluation_order: row.evaluation_order,
          stop_after_match: row.stop_after_match,
        });
      if (insertError && insertError.code !== "23505") throw insertError;
      if (!insertError) count++;
    }
    return count;
  }
  async claimNext(workerId: string, staleBefore: string) {
    const { data, error } = await this.db.rpc(
      "claim_next_automation_execution",
      { p_worker_id: workerId, p_stale_before: staleBefore },
    );
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? execution(row) : null;
  }
  async getVersion(e: AutomationExecution) {
    const { data, error } = await this.db
      .from("automation_versions")
      .select("*")
      .eq("id", e.automationVersionId)
      .eq("user_id", e.userId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? {
          id: data.id,
          automationId: data.automation_id,
          userId: data.user_id,
          version: Number(data.version),
          configuration: data.configuration_snapshot as AutomationConfiguration,
          createdAt: data.created_at,
        }
      : null;
  }
  async eventContext(
    e: AutomationExecution,
  ): Promise<AutomationEventContext | null> {
    if (e.eventType === "PRODUCT_CREATED") {
      const { data, error } = await this.db
        .from("products")
        .select("*")
        .eq("id", e.sourceReferenceId)
        .eq("user_id", e.userId)
        .maybeSingle();
      if (error) throw error;
      return data
        ? this.productContext(data, e.sourceType, e.sourceReferenceId)
        : null;
    }
    if (e.eventType === "PROMOTION_DETECTED") {
      const { data: a, error } = await this.db
        .from("promotion_analyses")
        .select("*,captured_messages!inner(media_metadata,raw_content)")
        .eq("captured_message_id", e.sourceReferenceId)
        .eq("user_id", e.userId)
        .maybeSingle();
      if (error) throw error;
      if (!a) return null;
      const { data: s, error: sError } = await this.db
        .from("captured_message_sources")
        .select("monitor_id,group_id")
        .eq("captured_message_id", e.sourceReferenceId)
        .eq("user_id", e.userId)
        .order("observed_at")
        .limit(1)
        .maybeSingle();
      if (sError) throw sError;
      const capture = Array.isArray(a.captured_messages)
        ? a.captured_messages[0]
        : a.captured_messages;
      return {
        sourceType: "promotion",
        sourceReferenceId: e.sourceReferenceId,
        captureId: e.sourceReferenceId,
        marketplace: a.marketplace,
        monitor: s?.monitor_id ?? null,
        sourceGroup: s?.group_id ?? null,
        productSourceType: "whatsapp",
        price: a.price == null ? null : Number(a.price),
        originalPrice:
          a.original_price == null ? null : Number(a.original_price),
        discountPercent:
          a.discount_percent == null ? null : Number(a.discount_percent),
        couponExists: Boolean(a.coupon_code || a.coupon_description),
        freeShipping: a.free_shipping,
        category: null,
        productTitle: a.product_name,
        keywords: capture?.raw_content ?? a.product_name,
        imageAvailable: Boolean(capture?.media_metadata?.available),
        affiliateConversionStatus: null,
      };
    }
    return {
      sourceType: e.sourceType,
      sourceReferenceId: e.sourceReferenceId,
      marketplace:
        typeof e.eventPayload.marketplace === "string"
          ? e.eventPayload.marketplace
          : null,
      price: Number(e.eventPayload.price) || null,
      discountPercent: Number(e.eventPayload.discountPercent) || null,
      dealScore: Number(e.eventPayload.dealScore) || null,
      commission: Number(e.eventPayload.commission) || null,
      productTitle:
        typeof e.eventPayload.title === "string" ? e.eventPayload.title : null,
    };
  }
  async captureContextForAnalysis(userId: string, analysisId: string) {
    const { data: analysis, error: analysisError } = await this.db
      .from("promotion_analyses")
      .select("captured_message_id")
      .eq("id", analysisId)
      .eq("user_id", userId)
      .maybeSingle();
    if (analysisError) throw analysisError;
    if (!analysis?.captured_message_id) return null;
    const { data: source, error: sourceError } = await this.db
      .from("captured_message_sources")
      .select("monitor_id,group_id")
      .eq("captured_message_id", analysis.captured_message_id)
      .eq("user_id", userId)
      .order("observed_at")
      .limit(1)
      .maybeSingle();
    if (sourceError) throw sourceError;
    return {
      captureId: analysis.captured_message_id,
      monitor: source?.monitor_id ?? null,
      sourceGroup: source?.group_id ?? null,
    };
  }
  private productContext(
    p: Row,
    sourceType: string,
    sourceReferenceId: string,
  ): AutomationEventContext {
    return {
      sourceType,
      sourceReferenceId,
      productId: p.id,
      marketplace: p.marketplace,
      productSourceType: p.source_type,
      price: p.price == null ? null : Number(p.price),
      originalPrice: p.original_price == null ? null : Number(p.original_price),
      discountPercent:
        p.discount_percent == null ? null : Number(p.discount_percent),
      couponExists: Boolean(p.coupon_code || p.coupon_description),
      freeShipping: p.free_shipping,
      category: p.category ?? null,
      productTitle: p.title,
      keywords: p.title,
      imageAvailable: Boolean(p.primary_media_asset_id),
      affiliateConversionStatus: p.affiliate_status,
    };
  }
  async priorStoppingMatch(e: AutomationExecution) {
    const { data, error } = await this.db
      .from("automation_executions")
      .select("id")
      .eq("user_id", e.userId)
      .eq("source_type", e.sourceType)
      .eq("source_reference_id", e.sourceReferenceId)
      .lt("evaluation_order", e.evaluationOrder)
      .eq("stop_after_match", true)
      .in("status", [
        "matched",
        "processing",
        "awaiting_review",
        "queued",
        "completed",
      ])
      .limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  }
  async recentExecutionCount(userId: string, since: string) {
    const { count, error } = await this.db
      .from("automation_executions")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .gte("created_at", since);
    if (error) throw error;
    return count ?? 0;
  }
  async safetyPause(userId: string) {
    const now = new Date().toISOString();
    const { error } = await this.db
      .from("automation_rules")
      .update({
        status: "error",
        error_code: "AUTOMATION_SAFETY_PAUSE",
        safety_paused_at: now,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw error;
  }
  async trace(
    e: AutomationExecution,
    stepType: string,
    status: "passed" | "failed" | "skipped" | "completed",
    facts: Record<string, unknown> = {},
  ) {
    const { error } = await this.db
      .from("automation_execution_steps")
      .insert({
        user_id: e.userId,
        execution_id: e.id,
        step_type: stepType,
        status,
        facts,
      });
    if (error) throw error;
  }
  async finish(
    e: AutomationExecution,
    status: AutomationExecutionStatus,
    patch: Row = {},
  ) {
    const terminal = [
      "ignored",
      "failed",
      "cancelled",
      "completed",
      "queued",
      "awaiting_review",
    ].includes(status);
    const { error } = await this.db
      .from("automation_executions")
      .update({
        status,
        error_code: patch.errorCode ?? null,
        error_message_safe: patch.errorMessageSafe ?? null,
        prepared_snapshot_id: patch.preparedSnapshotId ?? e.preparedSnapshotId,
        queue_item_id: patch.queueItemId ?? e.queueItemId,
        locked_at: null,
        locked_by: null,
        completed_at: terminal ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", e.id)
      .eq("user_id", e.userId)
      .eq("locked_by", e.workerId);
    if (error) throw error;
  }
  async retry(
    e: AutomationExecution,
    errorCode: string,
    message: string,
    retryAt: string | null,
  ) {
    await this.finish(e, retryAt ? "retry_wait" : "failed", {
      errorCode,
      errorMessageSafe: message,
    });
    if (retryAt) {
      const { error } = await this.db
        .from("automation_executions")
        .update({ available_at: retryAt, completed_at: null })
        .eq("id", e.id)
        .eq("user_id", e.userId);
      if (error) throw error;
    }
  }
  async waitForAffiliate(e: AutomationExecution, productId: string, message: string) {
    await this.finish(e, "waiting_dependency", {
      errorCode: "AUTOMATION_AFFILIATE_PENDING",
      errorMessageSafe: message,
    });
    const { error } = await this.db
      .from("automation_execution_steps")
      .insert({
        user_id: e.userId,
        execution_id: e.id,
        step_type: "dependency_registered",
        status: "completed",
        facts: { dependency: "affiliate_conversion", productId },
      });
    if (error) throw error;
    // Fecha a corrida em que a conversão termina entre a leitura do produto e
    // o registro da dependência. Nesse caso, a própria execução se libera.
    const { data: product, error: productError } = await this.db
      .from("products")
      .select("affiliate_status,affiliate_url")
      .eq("id", productId)
      .eq("user_id", e.userId)
      .maybeSingle();
    if (productError) throw productError;
    if (product?.affiliate_status === "converted" && product.affiliate_url) {
      const { error: wakeError } = await this.db
        .from("automation_executions")
        .update({
          status: "received", attempt_count: 0, available_at: new Date().toISOString(),
          error_code: null, error_message_safe: null, completed_at: null, updated_at: new Date().toISOString(),
        })
        .eq("id", e.id)
        .eq("user_id", e.userId)
        .eq("status", "waiting_dependency");
      if (wakeError) throw wakeError;
    }
  }
  async resumeAfterAffiliateConversion(userId: string, conversionId: string): Promise<number> {
    const { data: directlyLinked, error: directError } = await this.db
      .from("products")
      .select("id")
      .eq("user_id", userId)
      .eq("affiliate_conversion_id", conversionId);
    if (directError) throw directError;
    const productIds = new Set<string>((directlyLinked ?? []).map((row) => row.id));
    if (!productIds.size) {
      const { data: conversion, error: conversionError } = await this.db
        .from("affiliate_conversions")
        .select("source_type,source_reference_id")
        .eq("id", conversionId)
        .eq("user_id", userId)
        .maybeSingle();
      if (conversionError) throw conversionError;
      if (conversion?.source_reference_id) {
        const { data: products, error: productError } = await this.db
          .from("products")
          .select("id")
          .eq("user_id", userId)
          .eq("source_type", conversion.source_type)
          .eq("source_reference_id", conversion.source_reference_id);
        if (productError) throw productError;
        for (const product of products ?? []) productIds.add(product.id);
      }
    }
    if (!productIds.size) return 0;
    const executionIds = new Set<string>();
    for (const productId of productIds) {
      const { data: steps, error } = await this.db
        .from("automation_execution_steps")
        .select("execution_id")
        .eq("user_id", userId)
        .contains("facts", { productId });
      if (error) throw error;
      for (const step of steps ?? []) executionIds.add(step.execution_id);
    }
    if (!executionIds.size) return 0;
    const { data, error } = await this.db
      .from("automation_executions")
      .update({
        status: "received",
        attempt_count: 0,
        available_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        completed_at: null,
        error_code: null,
        error_message_safe: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .in("id", [...executionIds])
      .in("status", ["waiting_dependency", "retry_wait", "failed"])
      .eq("error_code", "AUTOMATION_AFFILIATE_PENDING")
      .select("id");
    if (error) throw error;
    return data?.length ?? 0;
  }
  async saveSnapshot(
    e: AutomationExecution,
    input: Omit<
      PreparedSnapshot,
      "id" | "executionId" | "snapshotVersion" | "preparedAt"
    >,
  ) {
    const { data: prior, error: priorError } = await this.db
      .from("automation_prepared_snapshots")
      .select("snapshot_version")
      .eq("execution_id", e.id)
      .order("snapshot_version", { ascending: false })
      .limit(1);
    if (priorError) throw priorError;
    const version = Number(prior?.[0]?.snapshot_version ?? 0) + 1;
    if (version > 1)
      await this.db
        .from("automation_prepared_snapshots")
        .update({ superseded_at: new Date().toISOString() })
        .eq("execution_id", e.id)
        .is("superseded_at", null);
    const insertPayload: Row = {
        user_id: e.userId,
        execution_id: e.id,
        snapshot_version: version,
        product_id: input.productId,
        source_type: input.sourceType,
        source_reference_id: input.sourceReferenceId,
        final_text: input.finalText,
        primary_media_asset_id: input.primaryMediaAssetId,
        affiliate_url: input.affiliateUrl,
        source_url: input.sourceUrl,
        template_id: input.templateId,
        template_version: input.templateVersion,
        cta_generation_id: input.ctaGenerationId,
    };
    let { data, error } = await this.db
      .from("automation_prepared_snapshots")
      .insert(insertPayload)
      .select("*")
      .single();
    // Permite rollout gradual: instalações que ainda não receberam a
    // migração não podem perder a execução inteira por causa do novo campo.
    if (isMissingColumnError(error, "source_url")) {
      delete insertPayload.source_url;
      ({ data, error } = await this.db
        .from("automation_prepared_snapshots")
        .insert(insertPayload)
        .select("*")
        .single());
    }
    if (error) throw error;
    return snapshot(data);
  }
  async createReview(
    e: AutomationExecution,
    s: PreparedSnapshot,
    queueId: string | null,
  ) {
    const { data, error } = await this.db
      .from("automation_reviews")
      .upsert(
        {
          user_id: e.userId,
          automation_id: e.automationId,
          execution_id: e.id,
          prepared_snapshot_id: s.id,
          planned_queue_id: queueId,
        },
        { onConflict: "execution_id" },
      )
      .select("id")
      .single();
    if (error) throw error;
    return (await this.getReview(e.userId, data.id))!;
  }
  async listExecutions(userId: string, automationId?: string) {
    let q = this.db
      .from("automation_executions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (automationId) q = q.eq("automation_id", automationId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(execution);
  }
  async deleteExecution(userId: string, executionId: string) {
    const { data, error } = await this.db
      .from("automation_executions")
      .delete()
      .eq("id", executionId)
      .eq("user_id", userId)
      .in("status", ["failed", "retry_wait"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  async listReviews(userId: string) {
    const { data, error } = await this.db
      .from("automation_reviews")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return Promise.all(
      (data ?? []).map((x) => this.getReview(userId, x.id)),
    ).then((x) => x.filter(Boolean) as AutomationReview[]);
  }
  async getReview(
    userId: string,
    id: string,
  ): Promise<AutomationReview | null> {
    const { data: r, error } = await this.db
      .from("automation_reviews")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!r) return null;
    const [{ data: s, error: se }, { data: a, error: ae }] = await Promise.all([
      this.db
        .from("automation_prepared_snapshots")
        .select("*")
        .eq("id", r.prepared_snapshot_id)
        .eq("user_id", userId)
        .single(),
      this.db
        .from("automation_rules")
        .select("name")
        .eq("id", r.automation_id)
        .eq("user_id", userId)
        .single(),
    ]);
    if (se) throw se;
    if (ae) throw ae;
    const [{ data: p, error: pe }, q] = await Promise.all([
      this.db
        .from("products")
        .select("id,title,marketplace,price,discount_percent")
        .eq("id", s.product_id)
        .eq("user_id", userId)
        .single(),
      r.planned_queue_id
        ? this.db
            .from("campaigns")
            .select("name")
            .eq("id", r.planned_queue_id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (pe) throw pe;
    if (q.error) throw q.error;
    return {
      id: r.id,
      automationId: r.automation_id,
      automationName: a.name,
      executionId: r.execution_id,
      preparedSnapshotId: r.prepared_snapshot_id,
      plannedQueueId: r.planned_queue_id ?? null,
      plannedQueueName: q.data?.name ?? null,
      status: r.status,
      product: {
        id: p.id,
        title: p.title,
        marketplace: p.marketplace,
        price: p.price == null ? null : Number(p.price),
        discountPercent:
          p.discount_percent == null ? null : Number(p.discount_percent),
      },
      snapshot: snapshot(s),
      createdAt: r.created_at,
    };
  }
  async updateReviewSnapshot(userId: string, id: string, s: PreparedSnapshot) {
    const { error } = await this.db
      .from("automation_reviews")
      .update({
        prepared_snapshot_id: s.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
  }
  async completeReview(
    userId: string,
    id: string,
    status: "approved" | "rejected",
    reason: string | null = null,
  ) {
    const { error } = await this.db
      .from("automation_reviews")
      .update({
        status,
        rejection_reason: reason,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending");
    if (error) throw error;
  }
  async findDuplicateQueueItem(userId: string, productId: string) {
    const { data, error } = await this.db
      .from("queue_items")
      .select("id")
      .eq("user_id", userId)
      .contains("content_snapshot", { productId })
      // Evita duplicidade apenas enquanto o produto ainda está nesta fila.
      // Um envio concluído não pode bloquear uma nova promoção futura.
      .in("status", [
        "draft",
        "scheduled",
        "queued",
        "sending",
        "paused",
        "partially_failed",
      ])
      .limit(1);
    if (error) throw error;
    return data?.[0]?.id ?? null;
  }
}
