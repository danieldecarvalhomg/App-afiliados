import { TemplateParser } from "./TemplateParser";
import { TemplateSerializer } from "./TemplateSerializer";
import type { CtaBlock, MessageTemplateDocument } from "./types";

const variable: Record<string, string> = {
  product: "{produto}",
  price: "{preco}",
  original_price: "{preco_original}",
  discount: "{desconto}",
  coupon: "{cupom}",
  coupon_link: "{coupon_link}",
  affiliate_link: "{affiliate_link}",
  marketplace: "{marketplace}",
  free_shipping: "{frete_gratis}",
};
const formatted = (value: string, format: CtaBlock["whatsappFormat"]) => {
  switch (format) {
    case "bold": return `*${value}*`;
    case "italic": return `_${value}_`;
    case "strikethrough": return `~${value}~`;
    case "monospace": return `\`\`\`${value}\`\`\``;
    case "quote": return `> ${value}`;
    case "bullet_list": return `- ${value}`;
    case "numbered_list": return `1. ${value}`;
    default: return value;
  }
};
const condition = (block: CtaBlock, content: string) => block.conditions.reduceRight(
  (result, item) => {
    const field = item.field === "price" ? "preco" : item.field === "original_price" ? "preco_original" : item.field === "discount" ? "desconto" : item.field === "coupon" ? "cupom" : item.field === "coupon_link" ? "coupon_link" : item.field === "free_shipping" ? "frete_gratis" : "marketplace";
    const operator = item.operator === "gte" ? ">=" : item.operator === "lte" ? "<=" : item.operator === "gt" ? ">" : item.operator === "lt" ? "<" : item.operator === "eq" ? "=" : item.operator === "neq" ? "!=" : item.operator;
    const expression = [field, operator === "exists" ? "" : operator, item.value ?? ""].filter((value) => value !== "").join(" ");
    return `{if ${expression}}${result}{/if}`;
  },
  content,
);

/** Converte uma vez o formato legado. O antigo CTA final é preservado no banco
 * pela migration, mas deliberadamente não entra na nova experiência. */
export function legacyBlocksToDocument(blocks: CtaBlock[]): MessageTemplateDocument {
  const pieces = blocks.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).flatMap((block) => {
    if (!block.enabled || block.frequency === "never" || block.key === "cta") return [];
    let value = "";
    if (block.key === "opening") value = "{cta_ia}";
    else if (variable[block.key]) value = variable[block.key];
    else if (block.copyMode === "EXACT_TEXT" && block.fixedText) value = block.fixedText;
    // Outros slots IA antigos não pertencem ao Trainer CTA-only. O metadata
    // original continua na coluna legacy_final_cta/blocks para auditoria.
    if (!value) return [];
    return [condition(block, formatted(value, block.whatsappFormat ?? "normal"))];
  });
  return new TemplateParser().parse(pieces.join("\n\n"));
}

export const documentToDsl = (document: MessageTemplateDocument) =>
  new TemplateSerializer().serialize(document);

export const demonstrationTemplateDocument = () => new TemplateParser().parse(
  `{cta_ia}\n\n*{produto}*\n\n{if preco_original}~DE {preco_original}~\n*POR {preco}*{else}*POR {preco}*{/if}\n\n{if cupom}🎟️ Cupom: *{cupom}*{/if}\n\n{if coupon_link}👉 Pegue o cupom:\n{coupon_link}{/if}\n\n👉 Produto:\n{affiliate_link}`,
);
