import type { CtaBlock, CtaFacts, CtaGeneratedSlot } from "./types";

const normalized = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const hasValue = (
  text: string,
  value: string | null | undefined,
) => Boolean(value && value.length > 2 && normalized(text).includes(normalized(value)));
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const withoutKnownCoupon = (text: string, couponCode: string | null) =>
  couponCode?.trim()
    ? text.replace(new RegExp(escapeRegExp(couponCode.trim()), "giu"), "")
    : text;

export class CtaSlotBoundaryValidator {
  validate(
    blocks: CtaBlock[],
    slots: CtaGeneratedSlot[],
    facts: CtaFacts,
  ): string[] {
    const errors: string[] = [];
    const allowed = new Map(
      blocks
        .filter((block) => block.copyMode === "AI_GENERATED")
        .map((block) => [block.id, block]),
    );
    for (const slot of slots) {
      const block = allowed.get(slot.blockId);
      if (!block) {
        errors.push("AI_SLOT_NOT_REQUESTED");
        continue;
      }
      const text = slot.text;
      if (
        /https?:\/\//iu.test(text) ||
        /R\$\s*\d/iu.test(text) ||
        hasValue(text, facts.affiliateUrl) ||
        hasValue(text, facts.sourceUrl)
      )
        errors.push("AI_SLOT_FACTS_FORBIDDEN");

      // Referenciar o código de cupom conhecido é permitido. Só percentuais fora
      // dele são tratados como um fato comercial criado pelo slot de linguagem.
      if (
        /\b\d+(?:[.,]\d+)?\s*%/u.test(
          withoutKnownCoupon(text, facts.couponCode ?? facts.couponDescription),
        )
      )
        errors.push("AI_SLOT_FACTS_FORBIDDEN");
      // O CTA é linguagem, não uma fonte de ficha técnica. Quantidades,
      // estoque, prazo e frete só podem aparecer quando estão nos fatos
      // determinísticos recebidos do produto.
      const factualSource = [facts.title, facts.couponDescription, facts.couponCode]
        .filter(Boolean).join(" ");
      const quantitativeClaims = text.match(/\b\d+(?:[.,]\d+)?\s*(?:w(?:atts?)?|mah|gb|tb|cm|mm|kg|g|l|litros?|h|horas?|minutos?)\b/giu) ?? [];
      if (quantitativeClaims.some((claim) => !normalized(factualSource).includes(normalized(claim))))
        errors.push("AI_FACT_UNVERIFIED");
      if (/(?:^|\s|[,.!?])(?:\u00faltimas? unidades?|estoque (?:baixo|limitado)|restam? \d+|acaba (?:hoje|amanhã)|só hoje)\b/iu.test(text))
        errors.push("AI_FACT_UNVERIFIED");
      if (/\bfrete grátis\b/iu.test(text) && facts.freeShipping !== true)
        errors.push("AI_FACT_UNVERIFIED");
      if (
        block.key === "opening" &&
        /\b(?:compre|garanta|aproveite|confira|acesse|clique)\b/iu.test(text)
      )
        errors.push("AI_SLOT_BOUNDARY_OPENING");
      if (
        block.key !== "cta" && block.key !== "cta_ia" &&
        /\b(?:clique|acesse)\s+(?:aqui|agora|no link)\b/iu.test(text)
      )
        errors.push("AI_SLOT_BOUNDARY_CTA");
    }
    const received = new Set(slots.map((slot) => slot.blockId));
    for (const id of allowed.keys())
      if (!received.has(id)) errors.push("AI_SLOT_MISSING");
    return [...new Set(errors)];
  }
}
