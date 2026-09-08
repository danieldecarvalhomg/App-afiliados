import { describe, expect, it } from "vitest";
import type { CtaGeneration } from "../cta/types";
import type { QueueItem } from "../dispatch/types";
import { reusableSentCtas } from "./ReusableProductCtas";

const generation: CtaGeneration = {
  id: "cta-1",
  userId: "user-a",
  productId: "product-1",
  ctaProfileId: "profile-1",
  templateId: "template-1",
  generatedText: "Oferta",
  finalText: "Oferta",
  wasEdited: false,
  generationMode: "single",
  publishable: true,
  status: "valid",
  structureSignature: "signature",
  structureSnapshot: {} as CtaGeneration["structureSnapshot"],
  provider: "test",
  model: "test",
  validationErrors: [],
  variantIndex: 0,
  variantGroupId: null,
  createdAt: "2026-08-27T00:00:00.000Z",
};

const item: QueueItem = {
  id: "queue-1",
  userId: "user-a",
  campaignId: "campaign-1",
  campaignName: "Fila",
  connectionId: "connection-1",
  connectionLabel: "WhatsApp",
  sourceType: "cta_generation",
  sourceReferenceId: generation.id,
  contentSnapshot: {
    text: "Oferta",
    caption: null,
    primaryMediaAssetId: null,
    hasMedia: false,
    watermark: { enabled: false, text: "", position: "bottom-right", opacity: 0.72 },
    affiliateUrl: "https://affiliate.test",
    sourceUrl: "https://shopee.com.br/product/123456/987654",
    productId: generation.productId,
    productTitle: "Produto",
    ctaGenerationId: generation.id,
    templateId: generation.templateId ?? null,
    templateVersion: 1,
    generatedAt: generation.createdAt,
  },
  destinationSnapshot: [],
  queueConfigSnapshot: {
    mode: "continuous",
    intervalBetweenItemsSeconds: 60,
    timezone: "America/Sao_Paulo",
    allowedStartTime: "00:00",
    allowedEndTime: "23:59",
    allowedDays: [1, 2, 3, 4, 5, 6, 7],
    fixedSlots: [],
  },
  position: 1,
  scheduledAt: generation.createdAt,
  nextExecutionAt: null,
  manualRequestedAt: null,
  startedAt: generation.createdAt,
  completedAt: generation.createdAt,
  status: "completed",
  idempotencyKey: "test",
  progress: { total: 1, sent: 1, failed: 0, pending: 0, uncertain: 0 },
  createdAt: generation.createdAt,
  updatedAt: generation.createdAt,
};

describe("reusableSentCtas", () => {
  it("libera somente a CTA válida de um envio concluído", () => {
    expect(reusableSentCtas([generation], [item]).get("product-1")?.id).toBe(
      "cta-1",
    );
  });

  it("não libera CTA que nunca foi enviada ou deixou de ser publicável", () => {
    expect(
      reusableSentCtas([generation], [{ ...item, status: "queued" }]).size,
    ).toBe(0);
    expect(
      reusableSentCtas([{ ...generation, publishable: false }], [item]).size,
    ).toBe(0);
  });

  it("não associa um envio a outro produto", () => {
    expect(
      reusableSentCtas([generation], [
        {
          ...item,
          contentSnapshot: {
            ...item.contentSnapshot,
            productId: "product-2",
          },
        },
      ]).size,
    ).toBe(0);
  });
});
