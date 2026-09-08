import { randomUUID } from "node:crypto";
import type { AffiliateConversionService } from "../affiliate/AffiliateConversionService";
import type { AffiliateRepository } from "../affiliate/AffiliateRepository";
import type { QueueService } from "../dispatch/QueueService";
import type { ProductMediaService } from "../media/ProductMediaService";
import type { CtaIntelligenceService } from "../cta/CtaIntelligenceService";
import type { ReviewSettingsRepository } from "../monitoring/ReviewSettingsRepository";
import type { AutomationEventBus } from "../../backend/automation/eventBus";
import { ConditionEngine } from "./ConditionEngine";
import type {
  AutomationConfiguration,
  AutomationEventContext,
  AutomationExecution,
  AutomationOptions,
  AutomationRepository,
  AutomationReview,
  AutomationRule,
  AutomationStatus,
  InternalAutomationEventHandler,
  InternalAutomationJob,
  PreparedSnapshot,
} from "./types";
import { AdaptiveWorkerLoop } from "../workers/AdaptiveWorkerLoop";

const STALE_MS = 5 * 60_000,
  MAX_VOLUME = 500,
  BACKOFF = [5_000, 30_000];
class AutomationFailure extends Error {
  constructor(
    message: string,
    readonly transient = false,
    readonly safeMessage: string | null = null,
  ) {
    super(message);
  }
}
const safe = (error: unknown) =>
  error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message)
    ? error.message
    : "AUTOMATION_PROCESSING_FAILED";
const isProductAiGenerationLimit = (error: unknown) =>
  error instanceof Error && error.message === "USAGE_LIMIT_AI_GENERATION_PRODUCT";

export class AutomationEngine implements InternalAutomationEventHandler {
  private readonly workerId = `automation-engine-${randomUUID()}`;
  private draining = false;
  private wake = false;
  constructor(
    private repository: AutomationRepository,
    private products: AffiliateRepository,
    private conversions: AffiliateConversionService,
    private media: ProductMediaService | undefined,
    private cta: CtaIntelligenceService,
    private queue: QueueService,
    private conditions = new ConditionEngine(),
    private events?: AutomationEventBus,
    private reviewSettings?: ReviewSettingsRepository,
  ) {}
  list(userId: string) {
    return this.repository.list(userId);
  }
  get(userId: string, id: string) {
    return this.repository.get(userId, id);
  }
  options(userId: string): Promise<AutomationOptions> {
    return this.repository.options(userId);
  }
  executions(userId: string, id?: string) {
    return this.repository.listExecutions(userId, id);
  }
  async deleteExecution(userId: string, executionId: string) {
    if (!executionId?.trim()) throw new Error("AUTOMATION_EXECUTION_NOT_FOUND");
    const deleted = await this.repository.deleteExecution(userId, executionId);
    if (!deleted) throw new Error("AUTOMATION_EXECUTION_DELETE_NOT_ALLOWED");
    this.events?.publish(userId, {
      type: "automation.execution.changed",
      executionId,
    });
    return { deleted: true } as const;
  }
  reviews(userId: string) {
    return this.repository.listReviews(userId);
  }
  async create(userId: string, input: AutomationConfiguration) {
    const value = await this.repository.create(userId, this.validate(input));
    this.events?.publish(userId, {
      type: "automation.rule.changed",
      automationId: value.id,
    });
    return value;
  }
  async update(userId: string, id: string, input: AutomationConfiguration) {
    const value = await this.repository.update(
      userId,
      id,
      this.validate(input),
    );
    if (!value) throw new Error("AUTOMATION_NOT_FOUND");
    this.events?.publish(userId, {
      type: "automation.rule.changed",
      automationId: value.id,
    });
    return value;
  }
  reorder(userId: string, ids: string[]) {
    return this.repository.reorder(userId, ids);
  }
  async status(userId: string, id: string, status: AutomationStatus) {
    const current = await this.repository.get(userId, id);
    if (!current) throw new Error("AUTOMATION_NOT_FOUND");
    if (status === "active") await this.validateOwnership(userId, current);
    const value = await this.repository.setStatus(userId, id, status);
    if (!value) throw new Error("AUTOMATION_NOT_FOUND");
    this.events?.publish(userId, {
      type: "automation.rule.changed",
      automationId: value.id,
    });
    return value;
  }
  private validate(input: AutomationConfiguration): AutomationConfiguration {
    if (!input?.name?.trim() || input.name.trim().length > 120)
      throw new Error("AUTOMATION_NAME_INVALID");
    if (
      !["PROMOTION_DETECTED", "MARKETPLACE_DEAL", "PRODUCT_CREATED"].includes(
        input.triggerType,
      )
    )
      throw new Error("AUTOMATION_TRIGGER_INVALID");
    if (
      !["all", "any"].includes(input.conditionMode) ||
      !Array.isArray(input.conditions) ||
      input.conditions.length > 20
    )
      throw new Error("AUTOMATION_CONDITIONS_INVALID");
    input.conditions.forEach((item) => this.conditions.validate(item));
    if (
      !["QUEUE_AUTOMATICALLY", "REVIEW_FIRST", "PRODUCT_ONLY"].includes(
        input.actionType,
      )
    )
      throw new Error("AUTOMATION_ACTION_INVALID");
    if (
      input.preparationConfig?.messageMode &&
      !["generated_cta", "original_message"].includes(
        input.preparationConfig.messageMode,
      )
    )
      throw new Error("AUTOMATION_MESSAGE_MODE_INVALID");
    return {
      ...input,
      name: input.name.trim(),
      evaluationOrder: Number.isInteger(input.evaluationOrder)
        ? input.evaluationOrder
        : 0,
      triggerConfig: input.triggerConfig ?? {},
      preparationConfig: {
        messageMode: "generated_cta",
        autoSelectMedia: true,
        requireImage: false,
        ...input.preparationConfig,
        instruction:
          input.preparationConfig?.instruction?.trim().slice(0, 1000) || null,
      },
      actionConfig: {
        placement: "end",
        allowDuplicate: false,
        ...input.actionConfig,
      },
      stopAfterMatch: input.stopAfterMatch !== false,
    };
  }
  private async validateOwnership(
    userId: string,
    input: AutomationConfiguration,
  ) {
    const opts = await this.repository.options(userId);
    if (
      ["QUEUE_AUTOMATICALLY", "REVIEW_FIRST"].includes(input.actionType) &&
      !opts.queues.some((x) => x.id === input.actionConfig.queueId)
    )
      throw new Error("AUTOMATION_QUEUE_UNAVAILABLE");
    if (
      input.preparationConfig.messageMode !== "original_message" &&
      !input.preparationConfig.useDefaultTemplate &&
      !opts.templates.some((x) => x.id === input.preparationConfig.templateId)
    )
      throw new Error("AUTOMATION_TEMPLATE_UNAVAILABLE");
    if (
      input.triggerConfig.scope === "monitor" &&
      !opts.monitors.some((x) => x.id === input.triggerConfig.monitorId)
    )
      throw new Error("AUTOMATION_MONITOR_UNAVAILABLE");
    if (
      input.triggerConfig.scope === "group" &&
      !opts.monitors.some((x) => x.groupId === input.triggerConfig.groupId)
    )
      throw new Error("AUTOMATION_GROUP_UNAVAILABLE");
  }
  async handle(job: InternalAutomationJob) {
    if (job.eventType === "AFFILIATE_CONVERTED") {
      const conversionId = typeof job.payload.conversionId === "string" ? job.payload.conversionId : "";
      if (!conversionId) throw new Error("AUTOMATION_AFFILIATE_CONVERSION_ID_REQUIRED");
      await this.repository.resumeAfterAffiliateConversion(job.userId, conversionId);
      this.events?.publish(job.userId, { type: "automation.execution.changed" });
      this.kick();
      return;
    }
    if (
      !["PROMOTION_DETECTED", "MARKETPLACE_DEAL", "PRODUCT_CREATED"].includes(
        job.eventType,
      )
    )
      return;
    if (
      job.eventType === "PROMOTION_DETECTED" &&
      (await this.isReviewRequired(job.userId)) &&
      job.payload.reviewApproved !== true
    ) {
      // O evento pode ter sido enfileirado antes de o usuário ligar a
      // proteção. Bloquear aqui fecha essa janela sem criar produto.
      return;
    }
    const count = await this.repository.recentExecutionCount(
      job.userId,
      new Date(Date.now() - 5 * 60_000).toISOString(),
    );
    if (count >= MAX_VOLUME) {
      await this.repository.safetyPause(job.userId);
      throw new Error("AUTOMATION_SAFETY_PAUSE");
    }
    await this.repository.enqueueEvent(job);
    this.events?.publish(job.userId, { type: "automation.execution.changed" });
    this.kick();
  }
  kick() {
    void this.drain().catch((error) =>
      console.error("[AfiliHub:AutomationEngine] Ciclo falhou.", {
        errorCode: safe(error),
      }),
    );
  }
  async drain(max = 30) {
    if (this.draining) {
      this.wake = true;
      return 0;
    }
    this.draining = true;
    let processed = 0;
    try {
      do {
        this.wake = false;
        while (processed < max) {
          const item = await this.repository.claimNext(
            this.workerId,
            new Date(Date.now() - STALE_MS).toISOString(),
          );
          if (!item) break;
          await this.process(item);
          processed++;
        }
      } while (this.wake && processed < max);
      return processed;
    } finally {
      this.draining = false;
    }
  }
  private scopeMatches(
    config: AutomationConfiguration,
    context: AutomationEventContext,
  ) {
    const trigger = config.triggerConfig;
    if (trigger.scope === "monitor" && trigger.monitorId !== context.monitor)
      return false;
    if (trigger.scope === "group" && trigger.groupId !== context.sourceGroup)
      return false;
    if (
      config.triggerType === "PRODUCT_CREATED" &&
      trigger.sourceType &&
      trigger.sourceType !== context.productSourceType
    )
      return false;
    return true;
  }
  private async process(execution: AutomationExecution) {
    try {
      if (
        execution.eventType === "PROMOTION_DETECTED" &&
        (await this.isReviewRequired(execution.userId)) &&
        execution.eventPayload.reviewApproved !== true
      ) {
        await this.repository.trace(
          execution,
          "global_review_guard",
          "skipped",
          {
            reason: "global_review_required",
          },
        );
        await this.repository.finish(execution, "ignored", {
          errorCode: "REVIEW_REQUIRED_GLOBAL",
          errorMessageSafe:
            "A revisão global está ligada; nenhuma automação cadastrou o produto.",
        });
        return;
      }
      if (await this.repository.priorStoppingMatch(execution)) {
        await this.repository.trace(execution, "evaluation_order", "skipped", {
          reason: "previous_stopping_match",
        });
        await this.repository.finish(execution, "cancelled", {
          errorCode: "SKIPPED_DUE_TO_PREVIOUS_MATCH",
          errorMessageSafe:
            "Outra automação anterior correspondeu e interrompeu a avaliação.",
        });
        return;
      }
      const version = await this.repository.getVersion(execution);
      if (!version) throw new AutomationFailure("AUTOMATION_VERSION_NOT_FOUND");
      const context = await this.repository.eventContext(execution);
      if (!context) throw new AutomationFailure("AUTOMATION_SOURCE_NOT_FOUND");
      await this.repository.trace(execution, "trigger", "passed", {
        eventType: execution.eventType,
        sourceType: execution.sourceType,
        sourceReferenceId: execution.sourceReferenceId,
      });
      if (!this.scopeMatches(version.configuration, context)) {
        await this.repository.trace(execution, "trigger_scope", "failed", {
          scope: version.configuration.triggerConfig.scope ?? "any",
        });
        await this.repository.finish(execution, "ignored");
        return;
      }
      const evaluated = this.conditions.evaluateAll(
        version.configuration.conditions,
        version.configuration.conditionMode,
        context,
      );
      for (const result of evaluated.results)
        await this.repository.trace(
          execution,
          "condition",
          result.passed ? "passed" : "failed",
          {
            conditionId: result.conditionId,
            field: result.field,
            operator: result.operator,
            expected: result.expected ?? null,
            actual: result.actual ?? null,
          },
        );
      if (!evaluated.passed) {
        await this.repository.finish(execution, "ignored");
        return;
      }
      await this.repository.trace(execution, "conditions", "passed", {
        mode: version.configuration.conditionMode,
      });
      await this.prepareAndAct(execution, version.configuration, context);
    } catch (error) {
      const code = safe(error);
      const transient = error instanceof AutomationFailure && error.transient;
      const retry =
        transient && execution.attemptCount < 3
          ? new Date(
              Date.now() +
                (BACKOFF[execution.attemptCount - 1] ?? BACKOFF.at(-1)!),
            ).toISOString()
          : null;
      await this.repository
        .trace(execution, "failure", "failed", {
          errorCode: code,
          willRetry: Boolean(retry),
        })
        .catch(() => undefined);
      const failureMessage =
        error instanceof AutomationFailure && error.safeMessage
          ? error.safeMessage
          : this.message(code);
      await this.repository.retry(execution, code, failureMessage, retry);
    } finally {
      this.events?.publish(execution.userId, {
        type: "automation.execution.changed",
        automationId: execution.automationId,
        executionId: execution.id,
      });
    }
  }
  private async prepareAndAct(
    e: AutomationExecution,
    config: AutomationConfiguration,
    context: AutomationEventContext,
  ) {
    let product = context.productId
      ? await this.products.getProduct(e.userId, context.productId)
      : null;
    if (!product && context.captureId) {
      product = await this.products.createWhatsAppProductForCapture(
        e.userId,
        context.captureId,
      );
      this.conversions.kick();
    }
    if (!product)
      throw new AutomationFailure("AUTOMATION_PRODUCT_NOT_RESOLVED");
    await this.repository.trace(e, "product_resolved", "completed", {
      productId: product.id,
      reused: Boolean(context.productId),
    });
    if (config.actionType === "PRODUCT_ONLY") {
      await this.repository.finish(e, "completed");
      return;
    }
    product = (await this.products.getProduct(e.userId, product.id)) ?? product;
    if (product.affiliateStatus !== "converted" || !product.affiliateUrl) {
      if (
        ["pending", "resolving", "resolved", "converting", "awaiting_companion"].includes(
          product.affiliateStatus,
        )
      )
      {
        const message = this.message("AUTOMATION_AFFILIATE_PENDING");
        await this.repository.trace(e, "affiliate_wait", "skipped", {
          productId: product.id,
          status: product.affiliateStatus,
          waitingFor: "affiliate_conversion",
        });
        await this.repository.waitForAffiliate(e, product.id, message);
        return;
      }
      throw new AutomationFailure("AUTOMATION_AFFILIATE_NOT_PUBLISHABLE");
    }
    await this.repository.trace(e, "affiliate_resolved", "completed", {
      status: product.affiliateStatus,
    });
    const presentation = await this.media?.list(e.userId, product.id);
    const primary =
      presentation?.primaryImage?.id ?? product.primaryMediaAssetId ?? null;
    if (config.preparationConfig.requireImage && !primary)
      throw new AutomationFailure("AUTOMATION_IMAGE_REQUIRED");
    await this.repository.trace(
      e,
      "media_resolved",
      primary ? "completed" : "skipped",
      {
        primaryMediaAssetId: primary,
        required: Boolean(config.preparationConfig.requireImage),
      },
    );
    const useOriginalMessage =
      config.preparationConfig.messageMode === "original_message";
    const selectedTemplateId = config.preparationConfig.useDefaultTemplate
      ? undefined
      : (config.preparationConfig.templateId ?? undefined);
    const productAiUsage = useOriginalMessage
      ? null
      : await this.cta.productAiGenerationUsage?.(e.userId, product.id);
    const productAiLimitReached =
      productAiUsage?.limit != null && productAiUsage.used >= productAiUsage.limit;
    let reusableGeneration = null;
    let fallbackReason: "product_ai_generation_limit" | null = null;
    let generation;
    if (useOriginalMessage) {
      generation = await this.cta.originalMessage(e.userId, product.id);
    } else if (productAiLimitReached) {
      fallbackReason = "product_ai_generation_limit";
      generation = await this.originalMessageFallback(e, product.id, fallbackReason);
    } else {
      reusableGeneration = await this.cta.reusable(e.userId, product.id, selectedTemplateId);
      if (reusableGeneration) {
        generation = reusableGeneration;
      } else {
        try {
          generation = (
            await this.cta.generate(e.userId, product.id, {
              templateId: selectedTemplateId,
              instruction: config.preparationConfig.instruction ?? undefined,
              count: 1,
              mode: "single",
            })
          )[0];
        } catch (error) {
          if (!isProductAiGenerationLimit(error)) throw error;
          fallbackReason = "product_ai_generation_limit";
          generation = await this.originalMessageFallback(e, product.id, fallbackReason);
        }
      }
    }
    if (!generation?.publishable || generation.status !== "valid") {
      const validationErrors = generation?.validationErrors ?? [];
      await this.repository.trace(e, "cta_validation", "failed", {
        ctaGenerationId: generation?.id ?? null,
        generationStatus: generation?.status ?? "missing",
        validationErrors,
      });
      throw new AutomationFailure(
        "AUTOMATION_CTA_NOT_PUBLISHABLE",
        false,
        this.ctaFailureMessage(validationErrors),
      );
    }
    await this.repository.trace(e, "cta_resolved", "completed", {
      ctaGenerationId: generation.id,
      reused: Boolean(reusableGeneration),
      generationMode: generation.generationMode,
      messageMode: useOriginalMessage || fallbackReason ? "original_message" : "generated_cta",
      fallbackReason,
    });
    const structure = generation.structureSnapshot as unknown as Record<
      string,
      unknown
    >;
    const templateVersion = Number(
      structure.sourceVersion ?? structure.templateVersion,
    );
    let prepared: PreparedSnapshot;
    try {
      prepared = await this.repository.saveSnapshot(e, {
        productId: product.id,
        sourceType: product.sourceType,
        sourceReferenceId: product.sourceReferenceId ?? null,
        finalText: generation.finalText,
        primaryMediaAssetId: primary,
        affiliateUrl: product.affiliateUrl,
        sourceUrl: product.sourceUrl,
        templateId: generation.templateId ?? null,
        templateVersion: Number.isInteger(templateVersion)
          ? templateVersion
          : null,
        ctaGenerationId: generation.id,
      });
    } catch (error) {
      console.error("[AfiliHub:AutomationEngine] Snapshot não pôde ser salvo.", {
        executionId: e.id,
        errorCode:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : safe(error),
      });
      throw new AutomationFailure(
        "AUTOMATION_SNAPSHOT_PERSISTENCE_FAILED",
        true,
      );
    }
    await this.repository.trace(e, "snapshot_created", "completed", {
      preparedSnapshotId: prepared.id,
      ctaGenerationId: generation.id,
    });
    if (config.actionType === "REVIEW_FIRST") {
      await this.repository.createReview(
        e,
        prepared,
        config.actionConfig.queueId ?? null,
      );
      await this.repository.trace(e, "review_created", "completed", {
        queueId: config.actionConfig.queueId ?? null,
      });
      await this.repository.finish(e, "awaiting_review", {
        preparedSnapshotId: prepared.id,
      });
      return;
    }
    const queueItemId = await this.enqueueSnapshot(e, prepared, config);
    await this.repository.finish(e, "queued", {
      preparedSnapshotId: prepared.id,
      queueItemId,
    });
  }
  private async enqueueSnapshot(
    e: AutomationExecution,
    s: PreparedSnapshot,
    config: AutomationConfiguration,
  ) {
    if (!config.actionConfig.queueId)
      throw new AutomationFailure("AUTOMATION_QUEUE_UNAVAILABLE");
    if (!config.actionConfig.allowDuplicate) {
      const duplicate = await this.repository.findDuplicateQueueItem(
        e.userId,
        s.productId,
      );
      if (duplicate) {
        await this.repository.trace(e, "queue_dedupe", "skipped", {
          existingQueueItemId: duplicate,
        });
        return duplicate;
      }
    }
    if (!s.ctaGenerationId)
      throw new AutomationFailure("AUTOMATION_CTA_NOT_PUBLISHABLE");
    const input = {
      campaignId: config.actionConfig.queueId,
      sourceType: "cta_generation" as const,
      sourceReferenceId: s.ctaGenerationId,
      placement: config.actionConfig.placement ?? "end",
      idempotencyKey: `automation:${e.id}`,
    };
    const preview = await this.queue.preview(e.userId, input);
    const item = await this.queue.create(e.userId, {
      ...input,
      expectedSnapshotHash: preview.snapshotHash,
    });
    await this.repository.trace(e, "queue_item_created", "completed", {
      queueId: item.campaignId,
      queueItemId: item.id,
      position: item.position,
    });
    return item.id;
  }
  async dryRun(
    userId: string,
    automationId: string,
    source: { productId?: string; captureId?: string; fullPreview?: boolean },
  ) {
    const rule = await this.repository.get(userId, automationId);
    if (!rule) throw new Error("AUTOMATION_NOT_FOUND");
    let context: AutomationEventContext | null = null;
    if (source.productId) {
      const product = await this.products.getProduct(userId, source.productId);
      if (product) {
        const captureContext =
          product.sourceType === "whatsapp" && product.sourceReferenceId
            ? await this.repository.captureContextForAnalysis?.(
                userId,
                product.sourceReferenceId,
              )
            : null;
        context = {
          sourceType: "product",
          sourceReferenceId: product.id,
          productId: product.id,
          marketplace: product.marketplace,
          productSourceType: product.sourceType,
          price: product.price,
          originalPrice: product.originalPrice,
          discountPercent: product.discountPercent,
          couponExists: Boolean(
            product.couponCode || product.couponDescription,
          ),
          freeShipping: product.freeShipping,
          category: product.category,
          productTitle: product.title,
          keywords: product.title,
          imageAvailable: Boolean(product.primaryMediaAssetId),
          affiliateConversionStatus: product.affiliateStatus,
          ...captureContext,
        };
      }
    }
    if (!context) throw new Error("AUTOMATION_TEST_SOURCE_REQUIRED");
    const result = this.conditions.evaluateAll(
      rule.conditions,
      rule.conditionMode,
      context,
    );
    await this.validateOwnership(userId, rule);
    const preparationErrors: string[] = [];
    if (
      result.passed &&
      rule.actionType !== "PRODUCT_ONLY" &&
      rule.preparationConfig.requireImage === true &&
      context.imageAvailable !== true
    ) {
      preparationErrors.push(
        "A automação exige imagem, mas o produto não possui mídia válida.",
      );
    }
    let preview: null | {
      text: string;
      publishable: boolean;
      validationErrors: string[];
    } = null;
    if (source.fullPreview && source.productId && result.passed) {
      const useOriginalMessage =
        rule.preparationConfig.messageMode === "original_message";
      const options = useOriginalMessage
        ? null
        : await this.repository.options(userId);
      const templateId = useOriginalMessage
        ? null
        : rule.preparationConfig.useDefaultTemplate
          ? (
              options!.templates.find((x) => x.isDefault && x.active) ??
              options!.templates.find((x) => x.active) ??
              options!.templates[0]
            )?.id
          : rule.preparationConfig.templateId;
      if (!useOriginalMessage && !templateId)
        throw new Error("AUTOMATION_TEMPLATE_UNAVAILABLE");
      const value = useOriginalMessage
        ? await this.cta.originalMessagePreview(userId, source.productId)
        : await this.cta.preview(userId, templateId!, {
            productId: source.productId,
            instruction: rule.preparationConfig.instruction ?? undefined,
          });
      preview = {
        text: value.text,
        publishable: value.publishable,
        validationErrors: value.validationErrors,
      };
      if (!preview.publishable)
        preparationErrors.push(
          this.ctaFailureMessage(preview.validationErrors),
        );
    }
    return {
      trigger: {
        passed: this.scopeMatches(rule, context),
        type: rule.triggerType,
      },
      conditions: result,
      configuration: {
        queueId: rule.actionConfig.queueId ?? null,
        templateId: rule.preparationConfig.templateId ?? null,
        actionType: rule.actionType,
      },
      preparation: {
        passed: preparationErrors.length === 0,
        errors: preparationErrors,
      },
      wouldExecute:
        result.passed &&
        this.scopeMatches(rule, context) &&
        preparationErrors.length === 0,
      preview,
    };
  }
  async approveReview(userId: string, id: string) {
    const review = await this.repository.getReview(userId, id);
    if (!review || review.status !== "pending")
      throw new Error("AUTOMATION_REVIEW_NOT_FOUND");
    if (!review.plannedQueueId) throw new Error("AUTOMATION_QUEUE_UNAVAILABLE");
    const duplicate = await this.repository.findDuplicateQueueItem(
      userId,
      review.snapshot.productId,
    );
    let queueItemId = duplicate;
    if (!queueItemId) {
      if (!review.snapshot.ctaGenerationId)
        throw new Error("AUTOMATION_CTA_NOT_PUBLISHABLE");
      const input = {
        campaignId: review.plannedQueueId,
        sourceType: "cta_generation" as const,
        sourceReferenceId: review.snapshot.ctaGenerationId,
        placement: "end" as const,
        idempotencyKey: `automation-review:${review.id}`,
      };
      const preview = await this.queue.preview(userId, input);
      queueItemId = (
        await this.queue.create(userId, {
          ...input,
          expectedSnapshotHash: preview.snapshotHash,
        })
      ).id;
    }
    await this.repository.completeReview(userId, id, "approved");
    return { queueItemId };
  }
  async rejectReview(userId: string, id: string, reason?: string) {
    const review = await this.repository.getReview(userId, id);
    if (!review || review.status !== "pending")
      throw new Error("AUTOMATION_REVIEW_NOT_FOUND");
    await this.repository.completeReview(
      userId,
      id,
      "rejected",
      reason?.trim().slice(0, 500) || null,
    );
    return { rejected: true };
  }
  async editReview(userId: string, id: string, text: string) {
    const review = await this.repository.getReview(userId, id);
    if (
      !review ||
      review.status !== "pending" ||
      !review.snapshot.ctaGenerationId
    )
      throw new Error("AUTOMATION_REVIEW_NOT_FOUND");
    const edited = await this.cta.edit(
      userId,
      review.snapshot.ctaGenerationId,
      text,
    );
    if (!edited?.publishable || edited.status !== "valid")
      throw new Error("AUTOMATION_REVIEW_TEXT_INVALID");
    const execution = (
      await this.repository.listExecutions(userId, review.automationId)
    ).find((x) => x.id === review.executionId);
    if (!execution) throw new Error("AUTOMATION_EXECUTION_NOT_FOUND");
    const reviewedProduct = review.snapshot.sourceUrl
      ? null
      : await this.products.getProduct(userId, review.snapshot.productId);
    const next = await this.repository.saveSnapshot(execution, {
      productId: review.snapshot.productId,
      sourceType: review.snapshot.sourceType,
      sourceReferenceId: review.snapshot.sourceReferenceId,
      finalText: edited.finalText,
      primaryMediaAssetId: review.snapshot.primaryMediaAssetId,
      affiliateUrl: review.snapshot.affiliateUrl,
      sourceUrl:
        review.snapshot.sourceUrl ?? reviewedProduct?.sourceUrl ?? null,
      templateId: review.snapshot.templateId,
      templateVersion: review.snapshot.templateVersion,
      ctaGenerationId: edited.id,
    });
    await this.repository.updateReviewSnapshot(userId, id, next);
    return next;
  }
  private async originalMessageFallback(
    execution: AutomationExecution,
    productId: string,
    reason: "product_ai_generation_limit",
  ) {
    try {
      const original = await this.cta.originalMessage(execution.userId, productId);
      await this.repository.trace(execution, "cta_quota_fallback", "completed", {
        reason,
        productId,
        ctaGenerationId: original.id,
        messageMode: "original_message",
      });
      return original;
    } catch (error) {
      await this.repository.trace(execution, "cta_quota_fallback", "failed", {
        reason,
        productId,
        errorCode: safe(error),
      });
      throw new AutomationFailure(
        "AUTOMATION_CTA_QUOTA_FALLBACK_UNAVAILABLE",
        false,
        "A cota de IA deste produto foi atingida e a mensagem capturada não está disponível para substituição.",
      );
    }
  }
  private async isReviewRequired(userId: string): Promise<boolean> {
    if (!this.reviewSettings) return true;
    try {
      return await this.reviewSettings.getReviewRequired(userId);
    } catch (error) {
      console.error(
        "[AfiliHub:AutomationEngine] Não foi possível ler a revisão global; mantendo proteção.",
        error,
      );
      return true;
    }
  }
  private ctaFailureMessage(errors: string[]) {
    const labels: Record<string, string> = {
      FACT_PRICE_MISMATCH: "a mensagem mencionou um preço diferente do produto",
      FACT_DISCOUNT_MISMATCH:
        "a mensagem mencionou um desconto diferente do produto",
      FACT_COUPON_INVENTED: "a mensagem inventou um cupom",
      FACT_COUPON_MISMATCH: "a mensagem mencionou um cupom diferente",
      FACT_FREE_SHIPPING_INVENTED: "a mensagem inventou frete grátis",
      UNSUPPORTED_FACTUAL_CLAIM:
        "a mensagem incluiu uma afirmação comercial sem comprovação",
      SOURCE_URL_FORBIDDEN: "a mensagem tentou usar o link original",
      AFFILIATE_URL_MISMATCH: "a mensagem usou um link diferente do afiliado",
      PROHIBITED_PHRASE: "a mensagem contém uma frase proibida",
      REQUIRED_PHRASE_MISSING: "uma frase obrigatória não foi incluída",
      AI_SLOT_FACTS_FORBIDDEN:
        "um trecho criativo incluiu preço, percentual ou link comercial",
      AI_SLOT_BOUNDARY_OPENING:
        "o CTA inicial incluiu uma chamada de compra fora do bloco correto",
      AI_SLOT_BOUNDARY_CTA:
        "uma chamada de ação apareceu fora do bloco correto",
      AI_FACT_UNVERIFIED:
        "o CTA incluiu uma especificação, estoque, prazo ou urgência sem comprovação",
      AI_SLOT_NOT_REQUESTED: "a IA retornou um bloco que não foi solicitado",
      AI_SLOT_MISSING: "a IA não retornou todos os blocos solicitados",
      AI_COPY_TOO_GENERIC: "a mensagem ficou genérica demais para o produto",
      AI_VARIANT_TOO_SIMILAR:
        "a mensagem ficou muito parecida com outra variante",
    };
    const reasons = [
      ...new Set(errors.map((code) => labels[code]).filter(Boolean)),
    ];
    return reasons.length
      ? `A mensagem foi bloqueada: ${reasons.join("; ")}.`
      : this.message("AUTOMATION_CTA_NOT_PUBLISHABLE");
  }
  private message(code: string) {
    return (
      (
        {
          AUTOMATION_AFFILIATE_PENDING:
            "A conversão afiliada ainda está em processamento.",
          AUTOMATION_AFFILIATE_NOT_PUBLISHABLE:
            "O link afiliado não ficou válido; o link original não foi usado.",
          AUTOMATION_IMAGE_REQUIRED:
            "A automação exige imagem, mas nenhuma mídia válida está disponível.",
          AUTOMATION_CTA_NOT_PUBLISHABLE:
            "A mensagem não passou pela validação factual.",
          AUTOMATION_CTA_QUOTA_FALLBACK_UNAVAILABLE:
            "A cota de IA deste produto foi atingida e a mensagem capturada não está disponível para substituição.",
          CTA_ORIGINAL_MESSAGE_UNAVAILABLE:
            "A mensagem original só pode ser usada em produtos capturados pelo Monitor de Grupos.",
          CTA_ORIGINAL_MESSAGE_NOT_FOUND:
            "A captura original não está mais disponível no histórico do Monitor de Grupos.",
          CTA_ORIGINAL_LINKS_NOT_FOUND:
            "A mensagem original não possui links comerciais para converter.",
          CTA_ORIGINAL_LINKS_NOT_CONVERTED:
            "Nem todos os links da mensagem original terminaram de ser convertidos.",
          AUTOMATION_SOURCE_NOT_FOUND:
            "A origem desta execução não foi encontrada.",
          AUTOMATION_VERSION_NOT_FOUND:
            "A versão da automação usada nesta execução não está mais disponível.",
          AUTOMATION_PRODUCT_NOT_RESOLVED:
            "Não foi possível localizar ou cadastrar o produto da promoção.",
          AUTOMATION_QUEUE_UNAVAILABLE:
            "A fila configurada não está disponível.",
          AUTOMATION_TEMPLATE_UNAVAILABLE:
            "O template configurado não está disponível.",
          AUTOMATION_SNAPSHOT_PERSISTENCE_FAILED:
            "A promoção foi preparada, mas houve uma falha técnica ao salvá-la antes da fila. O AfiliHub tentará novamente.",
        } as Record<string, string>
      )[code] ?? "A execução não pôde ser concluída com segurança."
    );
  }
}

export class AutomationWorker {
  private readonly loop: AdaptiveWorkerLoop;
  constructor(
    private engine: AutomationEngine,
    private intervalMs = 2_000,
  ) { this.loop = new AdaptiveWorkerLoop(() => this.engine.drain(), { minDelayMs: intervalMs, maxDelayMs: 60_000 }); }
  start() {
    this.loop.start();
  }
  stop() {
    this.loop.stop();
  }
}
