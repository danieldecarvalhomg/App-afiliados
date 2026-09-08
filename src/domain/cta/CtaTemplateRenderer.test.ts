import { describe, expect, it } from "vitest";
import { CtaTemplateRenderer, applyWhatsAppFormat, hasValidWhatsAppMarkup } from "./CtaTemplateRenderer";
import type { CtaBlock, CtaFacts, EffectiveCtaBlueprint } from "./types";

const facts: CtaFacts = {
  productId: "p", title: "Echo Dot", category: null, price: 249,
  originalPrice: 399, discountPercent: 38, couponCode: "ECHO20",
  couponDescription: null, couponLink: "https://coupon.test/echo",
  freeShipping: true, marketplace: "shopee",
  affiliateUrl: "https://affiliate.test/a", sourceUrl: "https://source.test",
};
const make = (key: string, position: number, kind: CtaBlock["kind"] = "factual", format: CtaBlock["whatsappFormat"] = "normal"): CtaBlock => ({
  id: key, key, label: key, kind, enabled: true, position,
  positionMode: "flexible", frequency: "always", conditions: [],
  format: "separate_line", whatsappFormat: format, groupId: null,
  generationInstruction: null, fixedText: null,
  copyMode: kind === "creative" ? "AI_GENERATED" : null,
  copyLibraryItemId: null, objective: key,
});
const blueprint = (blocks: CtaBlock[]): EffectiveCtaBlueprint => ({
  id: "t", userId: "u", profileId: "p", version: 1, isDefault: true,
  blocks, createdAt: "", updatedAt: "", sourceVersion: 1,
  oneOffInstructions: [], structureSignature: "x",
});

describe("CtaTemplateRenderer migration adapter", () => {
  const renderer = new CtaTemplateRenderer();

  it("preserva a ordem absoluta do template legado", () => {
    const blocks = [make("price", 0), make("product", 1), make("opening", 2, "creative")];
    expect(renderer.render(blueprint(blocks), facts, [{ blockId: "opening", text: "Abertura" }]))
      .toBe("R$ 249,00\n\nEcho Dot\n\nAbertura");
  });

  it("remove o antigo CTA final da mensagem", () => {
    const blocks = [make("opening", 0, "creative"), make("product", 1), make("cta", 2, "creative")];
    const result = renderer.render(blueprint(blocks), facts, [
      { blockId: "opening", text: "Chamada inicial" },
      { blockId: "cta", text: "Compre agora" },
    ]);
    expect(result).toBe("Chamada inicial\n\nEcho Dot");
    expect(result).not.toContain("Compre agora");
  });

  it.each([
    ["bold", "*Echo Dot*"], ["italic", "_Echo Dot_"],
    ["strikethrough", "~Echo Dot~"], ["monospace", "```Echo Dot```"],
    ["quote", "> Echo Dot"], ["bullet_list", "- Echo Dot"],
    ["numbered_list", "1. Echo Dot"],
  ] as const)("formata %s com sintaxe WhatsApp", (format, expected) =>
    expect(applyWhatsAppFormat("Echo Dot", format)).toBe(expected));

  it("preserva texto exato e formata o CTA inicial", () => {
    const fixed = { ...make("fixed", 0, "custom"), copyMode: "EXACT_TEXT" as const, fixedText: "Confira abaixo" };
    const ai = make("opening", 1, "creative", "italic");
    expect(renderer.render(blueprint([fixed, ai]), facts, [{ blockId: "opening", text: "Olha esta" }]))
      .toBe("Confira abaixo\n\n_Olha esta_");
  });

  it("rejeita marcação quebrada", () => expect(hasValidWhatsAppMarkup("*Echo Dot")).toBe(false));
});
