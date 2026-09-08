import { legacyBlocksToDocument } from "./LegacyTemplateAdapter";
import { MessageTemplateRenderer } from "./MessageTemplateRenderer";
import type { CtaFacts, CtaGeneratedSlot, EffectiveCtaBlueprint } from "./types";

export { applyWhatsAppFormat, hasValidWhatsAppMarkup } from "./WhatsAppFormatting";

/**
 * Adaptador somente de migração. Toda renderização passa pelo documento
 * canônico e usa apenas a antiga `opening` como `{cta_ia}`. O antigo bloco
 * final `cta` é ignorado deliberadamente.
 */
export class CtaTemplateRenderer {
  constructor(private renderer = new MessageTemplateRenderer()) {}

  render(blueprint: EffectiveCtaBlueprint, facts: CtaFacts, slots: CtaGeneratedSlot[]): string {
    const ctaText = slots.find((slot) => slot.blockId === "cta_ia" || slot.blockId === "opening")?.text ?? "";
    return this.renderer.render(legacyBlocksToDocument(blueprint.blocks), facts, ctaText).text;
  }
}
