import { describe, expect, it, vi } from "vitest";
import { CtaGenerationService } from "./CtaGenerationService";
import { TemplateParser } from "./TemplateParser";
import type { CtaFacts, CtaTemplate, MessageGenerationSnapshot } from "./types";

const snapshotFacts: CtaFacts = {
  productId: "product", title: "Echo Dot", category: "Eletrônicos",
  price: 249, originalPrice: 399, discountPercent: 38,
  couponCode: "ECHO20", couponDescription: null,
  couponLink: "https://cupom.test/original", freeShipping: true,
  marketplace: "shopee", affiliateUrl: "https://afiliado.test/original",
  sourceUrl: "https://origem.test/echo",
};
const profile = {
  id: "profile", userId: "u", tone: "natural", length: "medium",
  emojiLevel: "moderate", repetitionMode: "balanced",
  structuredPreferences: {}, naturalLanguagePreferences: null,
  version: 2, memoryEpoch: 3, createdAt: "", updatedAt: "",
} as const;

describe("CTA snapshot regeneration", () => {
  it("troca somente o CTA e preserva fatos, links, template e ordem do snapshot", async () => {
    const document = new TemplateParser().parse("{cta_ia}\nCupom: {coupon_link}\nProduto: {affiliate_link}");
    const snapshot: MessageGenerationSnapshot = {
      kind: "message-template-v1", templateId: "template",
      templateVersion: 4, trainerVersion: 1, document,
      dsl: "{cta_ia}\nCupom: {coupon_link}\nProduto: {affiliate_link}",
      facts: snapshotFacts, ctaText: "CTA anterior", angle: "anterior",
    };
    const template: CtaTemplate = {
      id: "template", userId: "u", name: "Atual", description: null,
      active: true, isDefault: true, version: 9, blocks: [],
      presentation: { defaultCaption: "", watermark: { enabled: false, text: "", position: "bottom-right", opacity: 0.72 } },
      document: new TemplateParser().parse("TEMPLATE ATUAL NÃO DEVE ENTRAR"),
      dsl: "TEMPLATE ATUAL NÃO DEVE ENTRAR", editorMode: "manual",
      officialKey: null, createdAt: "", updatedAt: "",
    };
    const repository = {
      getGeneration: vi.fn().mockResolvedValue({ id: "base", userId: "u", productId: "product", ctaProfileId: "profile", templateId: "template", generatedText: "", finalText: "", wasEdited: false, generationMode: "single", publishable: true, status: "valid", structureSignature: "old", structureSnapshot: snapshot, provider: "test", model: "test", validationErrors: [], variantIndex: 0, variantGroupId: null, createdAt: "" }),
      getOrCreateProfile: vi.fn().mockResolvedValue(profile),
      listRules: vi.fn().mockResolvedValue([]), listRelevantExamples: vi.fn().mockResolvedValue([]),
      listRecentGenerations: vi.fn().mockResolvedValue([]), listRelevantMemory: vi.fn().mockResolvedValue([]),
      getTemplate: vi.fn().mockResolvedValue(template), getDefaultTemplate: vi.fn().mockResolvedValue(template),
      createGeneration: vi.fn().mockImplementation(async (_user, input) => ({ id: "new", userId: "u", createdAt: "", ...input })),
    };
    const provider = {
      generateCta: vi.fn().mockResolvedValue({ output: { slots: [], candidates: [{ text: "Novo olhar para o Echo Dot", angle: "descoberta" }] }, provider: "test", model: "test", processingMs: 1 }),
      repairCta: vi.fn(),
    };
    const result = await new CtaGenerationService(repository as never, provider as never)
      .regenerateCta("u", "base", "mais natural");
    expect(result.ctaText).toBe("Novo olhar para o Echo Dot");
    expect(result.finalText).toBe("Novo olhar para o Echo Dot\nCupom: https://cupom.test/original\nProduto: https://afiliado.test/original");
    expect(result.finalText).not.toContain("TEMPLATE ATUAL");
    expect((result.structureSnapshot as MessageGenerationSnapshot).facts).toEqual(snapshotFacts);
    expect((result.structureSnapshot as MessageGenerationSnapshot).templateVersion).toBe(4);
    expect(repository.getTemplate).not.toHaveBeenCalled();
    expect(provider.generateCta).toHaveBeenCalledWith(expect.objectContaining({ instruction: "mais natural" }));
  });
});
