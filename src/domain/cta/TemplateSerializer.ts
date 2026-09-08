import type {
  MessageTemplateCondition,
  MessageTemplateDocument,
  MessageTemplateNode,
} from "./types";

const symbol: Record<MessageTemplateCondition["operator"], string> = {
  exists: "",
  not_exists: " not_exists",
  eq: " = ",
  neq: " != ",
  gt: " > ",
  gte: " >= ",
  lt: " < ",
  lte: " <= ",
};
const condition = (value: MessageTemplateCondition) => {
  if (value.operator === "exists") return value.field;
  if (value.operator === "not_exists") return `${value.field} not_exists`;
  const right = typeof value.value === "string" && /\s/u.test(value.value)
    ? JSON.stringify(value.value)
    : String(value.value ?? "");
  return `${value.field}${symbol[value.operator]}${right}`;
};

export class TemplateSerializer {
  serialize(document: MessageTemplateDocument): string {
    if (!document || document.version !== 1 || !Array.isArray(document.nodes))
      throw new Error("TEMPLATE_DOCUMENT_INVALID");
    const render = (nodes: MessageTemplateNode[]): string => nodes.map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "cta") return format("{cta_ia}", node.format);
      if (node.type === "variable") return format(`{${node.key}}`, node.format);
      return `{if ${condition(node.condition)}}${render(node.then)}${node.else.length ? `{else}${render(node.else)}` : ""}{/if}`;
    }).join("");
    return render(document.nodes);
  }
}

const format = (value: string, mode?: import("./types").CtaWhatsAppFormat) => {
  switch (mode) {
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

/**
 * Compara a representação canônica pelo DSL que ela produz, ignorando IDs e
 * aceitando as duas formas equivalentes de formatação WhatsApp:
 * `*{produto}*` (marcadores no texto) e um nó variável com `format: "bold"`.
 *
 * Templates oficiais antigos foram persistidos na primeira forma, enquanto o
 * parser atual normaliza para a segunda. Comparar a AST literal fazia a
 * conversão Blocos → Manual falhar mesmo quando o texto final era idêntico.
 */
export const templateDocumentsEquivalent = (
  left: MessageTemplateDocument,
  right: MessageTemplateDocument,
) => new TemplateSerializer().serialize(left) === new TemplateSerializer().serialize(right);
