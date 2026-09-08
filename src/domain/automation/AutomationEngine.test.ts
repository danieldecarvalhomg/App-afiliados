import { describe, expect, it, vi } from "vitest";
import { AutomationEngine } from "./AutomationEngine";
import type { InternalAutomationJob } from "./types";

const job: InternalAutomationJob = {
  id: "job-1",
  userId: "user-a",
  eventType: "PROMOTION_DETECTED",
  idempotencyKey: "capture-1",
  payload: { capturedMessageId: "capture-1" },
  attemptCount: 1,
  workerId: "",
};

function setup(reviewRequired: boolean) {
  const repository = {
    recentExecutionCount: vi.fn().mockResolvedValue(0),
    safetyPause: vi.fn(),
    enqueueEvent: vi.fn().mockResolvedValue(1),
    claimNext: vi.fn().mockResolvedValue(null),
    deleteExecution: vi.fn().mockResolvedValue(true),
    resumeAfterAffiliateConversion: vi.fn().mockResolvedValue(1),
  };
  const settings = {
    getReviewRequired: vi.fn().mockResolvedValue(reviewRequired),
    setReviewRequired: vi.fn(),
    getReviewSettings: vi.fn().mockResolvedValue({ reviewRequired, autoApprovalRules: [] }),
    setReviewSettings: vi.fn(),
  };
  const engine = new AutomationEngine(
    repository as never,
    {} as never,
    {} as never,
    undefined,
    {} as never,
    {} as never,
    undefined,
    undefined,
    settings,
  );
  return { engine, repository, settings };
}

describe("proteção de revisão global", () => {
  it("não enfileira promoção enquanto a revisão estiver ligada", async () => {
    const { engine, repository } = setup(true);
    await engine.handle(job);
    expect(repository.enqueueEvent).not.toHaveBeenCalled();
    expect(repository.recentExecutionCount).not.toHaveBeenCalled();
  });

  it("permite o motor quando a revisão estiver desligada", async () => {
    const { engine, repository } = setup(false);
    await engine.handle(job);
    expect(repository.enqueueEvent).toHaveBeenCalledWith(job);
  });

  it("permite retomar uma promoção aprovada mesmo com a revisão global ligada", async () => {
    const { engine, repository } = setup(true);
    const approvedJob = {
      ...job,
      id: "job-approved",
      idempotencyKey: "capture-1:approved",
      payload: { ...job.payload, reviewApproved: true },
    };
    await engine.handle(approvedJob);
    expect(repository.enqueueEvent).toHaveBeenCalledWith(approvedJob);
  });

  it("exclui uma execução somente quando o repositório confirma a falha", async () => {
    const { engine, repository } = setup(false);
    await expect(engine.deleteExecution("user-a", "execution-1")).resolves.toEqual({
      deleted: true,
    });
    expect(repository.deleteExecution).toHaveBeenCalledWith(
      "user-a",
      "execution-1",
    );
  });

  it("libera execuções dependentes somente ao receber AFFILIATE_CONVERTED", async () => {
    const { engine, repository } = setup(false);
    await engine.handle({ ...job, eventType: "AFFILIATE_CONVERTED", payload: { conversionId: "conversion-1" } });
    expect(repository.resumeAfterAffiliateConversion).toHaveBeenCalledWith("user-a", "conversion-1");
    expect(repository.enqueueEvent).not.toHaveBeenCalled();
  });
});

function setupMessageMode(messageMode: "original_message" | "generated_cta") {
  const execution = {
    id: "execution", userId: "user-a", automationId: "automation",
    automationVersionId: "version", eventType: "PROMOTION_DETECTED",
    sourceType: "whatsapp_capture", sourceReferenceId: "capture",
    eventPayload: { reviewApproved: true }, origin: "monitor", causationId: null,
    evaluationOrder: 0, stopAfterMatch: true, status: "received",
    attemptCount: 1, workerId: "", errorCode: null, errorMessageSafe: null,
    preparedSnapshotId: null, queueItemId: null, startedAt: null,
    completedAt: null, createdAt: "", updatedAt: "",
  };
  const configuration = {
    name: "Monitor", triggerType: "PROMOTION_DETECTED", triggerConfig: { scope: "any" },
    conditionMode: "all", conditions: [], actionType: "QUEUE_AUTOMATICALLY",
    preparationConfig: { messageMode, useDefaultTemplate: true, autoSelectMedia: true, requireImage: false },
    actionConfig: { queueId: "queue", placement: "end", allowDuplicate: false },
    evaluationOrder: 0, stopAfterMatch: true,
  };
  const product = {
    id: "product", userId: "user-a", sourceType: "whatsapp", sourceReferenceId: "analysis",
    title: "Echo Dot", category: null, imageUrl: null, primaryMediaAssetId: null,
    price: 249, originalPrice: 399, discountPercent: 38, currency: "BRL",
    couponCode: null, couponDescription: null, couponLink: null, freeShipping: null,
    marketplace: "shopee", sourceUrl: "https://source.test/echo",
    affiliateUrl: "https://affiliate.test/echo", affiliateStatus: "converted",
    affiliateConversionId: null, observations: null, createdAt: "", updatedAt: "",
  };
  const originalGeneration = {
    id: "generation-original", userId: "user-a", productId: "product",
    ctaProfileId: null, templateId: "template", ctaText: null,
    generatedText: "Mensagem capturada\nhttps://affiliate.test/echo",
    finalText: "Mensagem capturada\nhttps://affiliate.test/echo",
    wasEdited: false, generationMode: "original_message", publishable: true,
    status: "valid", structureSignature: "original-message-v1",
    structureSnapshot: { kind: "original-message-v1", captureId: "capture", linkCount: 1, sourceVersion: 2 },
    provider: "promofy", model: "original-message", validationErrors: [],
    variantIndex: 0, variantGroupId: null, createdAt: "",
  };
  const generated = {
    ...originalGeneration, id: "generation-ai", ctaProfileId: "profile",
    templateId: "template", ctaText: "Tava de olho no Echo Dot?",
    generatedText: "Tava de olho no Echo Dot?\nhttps://affiliate.test/echo",
    finalText: "Tava de olho no Echo Dot?\nhttps://affiliate.test/echo",
    generationMode: "single", structureSignature: "template-v2",
    structureSnapshot: { kind: "message-template-v1", templateId: "template", templateVersion: 2 },
    provider: "test", model: "test",
  };
  const repository = {
    claimNext: vi.fn().mockResolvedValueOnce(execution).mockResolvedValue(null),
    priorStoppingMatch: vi.fn().mockResolvedValue(false),
    getVersion: vi.fn().mockResolvedValue({ configuration }),
    eventContext: vi.fn().mockResolvedValue({ sourceType: "capture", sourceReferenceId: "capture", productId: "product", productSourceType: "whatsapp" }),
    trace: vi.fn(), finish: vi.fn(), retry: vi.fn(), waitForAffiliate: vi.fn(),
    saveSnapshot: vi.fn().mockImplementation(async (_execution, input) => ({ id: "snapshot", executionId: "execution", snapshotVersion: 1, preparedAt: "", ...input })),
    findDuplicateQueueItem: vi.fn().mockResolvedValue(null),
  };
  const products = { getProduct: vi.fn().mockResolvedValue(product), createWhatsAppProductForCapture: vi.fn() };
  const cta = {
    originalMessage: vi.fn().mockResolvedValue(originalGeneration),
    reusable: vi.fn().mockResolvedValue(null),
    generate: vi.fn().mockResolvedValue([generated]),
    productAiGenerationUsage: vi.fn().mockResolvedValue(null),
  };
  const queue = {
    preview: vi.fn().mockResolvedValue({ snapshotHash: "hash" }),
    create: vi.fn().mockResolvedValue({ id: "queue-item", campaignId: "queue", position: 1 }),
  };
  const settings = { getReviewRequired: vi.fn().mockResolvedValue(false) };
  const engine = new AutomationEngine(repository as never, products as never, { kick: vi.fn() } as never, undefined, cta as never, queue as never, undefined, undefined, settings as never);
  return { engine, repository, products, cta, queue, originalGeneration, generated };
}

describe("modos de mensagem do monitor", () => {
  it("Modo 1 preserva a mensagem original e não consulta Trainer nem Template", async () => {
    const { engine, repository, cta, queue, originalGeneration } = setupMessageMode("original_message");
    await engine.drain();
    expect(cta.originalMessage).toHaveBeenCalledWith("user-a", "product");
    expect(cta.reusable).not.toHaveBeenCalled();
    expect(cta.generate).not.toHaveBeenCalled();
    expect(repository.saveSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ finalText: originalGeneration.finalText, templateId: "template", templateVersion: 2, ctaGenerationId: "generation-original" }));
    expect(queue.create).toHaveBeenCalledWith("user-a", expect.objectContaining({ sourceReferenceId: "generation-original" }));
  });

  it("Modo 2 usa CTA + Template e mantém o pipeline existente de snapshot e fila", async () => {
    const { engine, repository, cta, queue, generated } = setupMessageMode("generated_cta");
    await engine.drain();
    expect(cta.originalMessage).not.toHaveBeenCalled();
    expect(cta.reusable).toHaveBeenCalledWith("user-a", "product", undefined);
    expect(cta.generate).toHaveBeenCalledWith("user-a", "product", expect.objectContaining({ count: 1, mode: "single" }));
    expect(repository.saveSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ finalText: generated.finalText, templateId: "template", templateVersion: 2 }));
    expect(queue.create).toHaveBeenCalledWith("user-a", expect.objectContaining({ sourceReferenceId: "generation-ai", idempotencyKey: "automation:execution" }));
  });

  it("troca para a mensagem capturada quando a cota mensal do produto já foi atingida", async () => {
    const { engine, repository, cta, queue, originalGeneration } = setupMessageMode("generated_cta");
    cta.productAiGenerationUsage = vi.fn().mockResolvedValue({ used: 30, limit: 30, usagePeriodStart: "2026-09-01" });

    await engine.drain();

    expect(cta.originalMessage).toHaveBeenCalledWith("user-a", "product");
    expect(cta.reusable).not.toHaveBeenCalled();
    expect(cta.generate).not.toHaveBeenCalled();
    expect(repository.trace).toHaveBeenCalledWith(expect.anything(), "cta_quota_fallback", "completed", expect.objectContaining({ reason: "product_ai_generation_limit" }));
    expect(repository.saveSnapshot).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ finalText: originalGeneration.finalText, ctaGenerationId: "generation-original" }));
    expect(queue.create).toHaveBeenCalledWith("user-a", expect.objectContaining({ sourceReferenceId: "generation-original" }));
  });

  it("troca para a mensagem capturada se a cota for atingida entre a consulta e a geração", async () => {
    const { engine, repository, cta, queue } = setupMessageMode("generated_cta");
    cta.productAiGenerationUsage = vi.fn().mockResolvedValue({ used: 29, limit: 30, usagePeriodStart: "2026-09-01" });
    cta.generate.mockRejectedValue(new Error("USAGE_LIMIT_AI_GENERATION_PRODUCT"));

    await engine.drain();

    expect(cta.generate).toHaveBeenCalledOnce();
    expect(cta.originalMessage).toHaveBeenCalledWith("user-a", "product");
    expect(repository.trace).toHaveBeenCalledWith(expect.anything(), "cta_quota_fallback", "completed", expect.anything());
    expect(queue.create).toHaveBeenCalledWith("user-a", expect.objectContaining({ sourceReferenceId: "generation-original" }));
  });

  it("estaciona sem agendar retentativa enquanto o link afiliado está convertendo", async () => {
    const { engine, repository, products, cta, queue } = setupMessageMode("generated_cta");
    products.getProduct.mockResolvedValue({
      ...(await products.getProduct()),
      affiliateStatus: "converting",
      affiliateUrl: null,
    });
    await engine.drain();
    expect(repository.waitForAffiliate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "execution" }),
      "product",
      "A conversão afiliada ainda está em processamento.",
    );
    expect(repository.retry).not.toHaveBeenCalled();
    expect(cta.generate).not.toHaveBeenCalled();
    expect(queue.create).not.toHaveBeenCalled();
  });
});

describe("aprovação de automação", () => {
  it("enfileira a geração canônica para preservar apresentação do template", async () => {
    const review = {
      id: "review",
      userId: "user-a",
      automationId: "automation",
      executionId: "execution",
      preparedSnapshotId: "snapshot",
      plannedQueueId: "queue",
      status: "pending",
      rejectionReason: null,
      reviewedAt: null,
      createdAt: "",
      updatedAt: "",
      product: { id: "product", title: "Produto", marketplace: "shopee" },
      snapshot: {
        id: "snapshot",
        executionId: "execution",
        snapshotVersion: 1,
        productId: "product",
        sourceType: "whatsapp",
        sourceReferenceId: "capture",
        finalText: "Oferta convertida",
        primaryMediaAssetId: null,
        affiliateUrl: "https://affiliate.test/product",
        sourceUrl: "https://source.test/product",
        templateId: "template",
        templateVersion: 2,
        ctaGenerationId: "generation",
        preparedAt: "",
      },
    };
    const repository = {
      getReview: vi.fn().mockResolvedValue(review),
      findDuplicateQueueItem: vi.fn().mockResolvedValue(null),
      completeReview: vi.fn(),
    };
    const queue = {
      preview: vi.fn().mockResolvedValue({ snapshotHash: "hash" }),
      create: vi.fn().mockResolvedValue({ id: "queue-item" }),
    };
    const engine = new AutomationEngine(
      repository as never,
      {} as never,
      {} as never,
      undefined,
      {} as never,
      queue as never,
    );

    await expect(engine.approveReview("user-a", "review")).resolves.toEqual({
      queueItemId: "queue-item",
    });
    expect(queue.preview).toHaveBeenCalledWith("user-a", {
      campaignId: "queue",
      sourceType: "cta_generation",
      sourceReferenceId: "generation",
      placement: "end",
      idempotencyKey: "automation-review:review",
    });
    expect(queue.create).toHaveBeenCalledWith(
      "user-a",
      expect.objectContaining({
        sourceType: "cta_generation",
        sourceReferenceId: "generation",
        expectedSnapshotHash: "hash",
      }),
    );
  });
});

describe("prévia de automação", () => {
  it("preserva monitor e grupo da captura ao testar um Product do WhatsApp", async () => {
    const rule = {
      id: "automation", userId: "user-a", name: "Regra",
      triggerType: "PROMOTION_DETECTED", triggerConfig: { scope: "monitor", monitorId: "monitor-1" },
      conditionMode: "all", conditions: [], actionType: "REVIEW_FIRST",
      preparationConfig: { messageMode: "original_message", useDefaultTemplate: true, autoSelectMedia: true, requireImage: false },
      actionConfig: { queueId: "queue", placement: "end", allowDuplicate: false },
      evaluationOrder: 0, stopAfterMatch: true,
    };
    const product = {
      id: "product", userId: "user-a", title: "Produto", marketplace: "shopee",
      sourceType: "whatsapp", sourceReferenceId: "analysis-1", price: 10,
      originalPrice: 20, discountPercent: 50, couponCode: null,
      couponDescription: null, couponLink: null, freeShipping: null,
      primaryMediaAssetId: null, affiliateStatus: "converted",
    };
    const repository = {
      get: vi.fn().mockResolvedValue(rule),
      captureContextForAnalysis: vi.fn().mockResolvedValue({ captureId: "capture-1", monitor: "monitor-1", sourceGroup: "group-1" }),
      options: vi.fn().mockResolvedValue({
        queues: [{ id: "queue", name: "Fila", status: "active" }],
        templates: [],
        monitors: [{ id: "monitor-1", name: "Monitor", groupId: "group-1" }],
        products: [],
      }),
    };
    const cta = { originalMessagePreview: vi.fn().mockResolvedValue({ text: "Copy original\nhttps://affiliate.test", publishable: true, validationErrors: [] }) };
    const engine = new AutomationEngine(repository as never, { getProduct: vi.fn().mockResolvedValue(product) } as never, {} as never, undefined, cta as never, {} as never);

    const result = await engine.dryRun("user-a", "automation", { productId: "product", fullPreview: true });

    expect(repository.captureContextForAnalysis).toHaveBeenCalledWith("user-a", "analysis-1");
    expect(result.trigger).toMatchObject({ passed: true });
    expect(result.wouldExecute).toBe(true);
    expect(result.preview?.text).toContain("Copy original");
  });

  it("usa o primeiro template ativo quando não há um padrão marcado", async () => {
    const rule = {
      id: "automation",
      userId: "user-a",
      name: "Regra",
      triggerType: "PRODUCT_CREATED",
      triggerConfig: { scope: "any" },
      conditionMode: "all",
      conditions: [],
      actionType: "REVIEW_FIRST",
      preparationConfig: {
        messageMode: "generated_cta",
        useDefaultTemplate: true,
        autoSelectMedia: true,
        requireImage: false,
      },
      actionConfig: { queueId: "queue", placement: "end", allowDuplicate: false },
      evaluationOrder: 0,
      stopAfterMatch: true,
    };
    const product = {
      id: "product",
      userId: "user-a",
      title: "Produto",
      marketplace: "shopee",
      sourceType: "manual",
      sourceReferenceId: null,
      price: 10,
      originalPrice: 20,
      discountPercent: 50,
      couponCode: null,
      couponDescription: null,
      couponLink: null,
      freeShipping: null,
      primaryMediaAssetId: null,
      affiliateStatus: "converted",
    };
    const repository = {
      get: vi.fn().mockResolvedValue(rule),
      options: vi.fn().mockResolvedValue({
        queues: [{ id: "queue", name: "Fila", status: "active" }],
        templates: [
          { id: "inactive", name: "Inativo", active: false, isDefault: false },
          { id: "active", name: "Ativo", active: true, isDefault: false },
        ],
        monitors: [],
        products: [],
      }),
    };
    const products = { getProduct: vi.fn().mockResolvedValue(product) };
    const cta = {
      preview: vi.fn().mockResolvedValue({
        text: "Prévia",
        publishable: true,
        validationErrors: [],
      }),
    };
    const engine = new AutomationEngine(
      repository as never,
      products as never,
      {} as never,
      undefined,
      cta as never,
      {} as never,
    );

    const result = await engine.dryRun("user-a", "automation", {
      productId: "product",
      fullPreview: true,
    });

    expect(cta.preview).toHaveBeenCalledWith("user-a", "active", {
      productId: "product",
      instruction: undefined,
    });
    expect(result.preview?.text).toBe("Prévia");

    cta.preview.mockResolvedValue({
      text: "Preço inventado",
      publishable: false,
      validationErrors: ["FACT_PRICE_MISMATCH"],
    });
    const blocked = await engine.dryRun("user-a", "automation", {
      productId: "product",
      fullPreview: true,
    });
    expect(blocked.wouldExecute).toBe(false);
    expect(blocked.preparation.errors).toContain(
      "A mensagem foi bloqueada: a mensagem mencionou um preço diferente do produto.",
    );
  });
});
