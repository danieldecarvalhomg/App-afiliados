import { applyWhatsAppFormat, hasValidWhatsAppMarkup, normalizeWhatsAppMarkup } from "./WhatsAppFormatting";
import type {
  CtaFacts,
  MessageTemplateCondition,
  MessageTemplateDocument,
  MessageTemplateNode,
  MessageTemplateVariable,
} from "./types";

const brl = (value: number | null) => value == null ? "" : new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
}).format(value);

const factual = (key: MessageTemplateVariable, facts: CtaFacts): string => {
  switch (key) {
    case "produto": return facts.title;
    case "preco": return brl(facts.price);
    case "preco_original": return brl(facts.originalPrice);
    case "desconto": return facts.discountPercent == null ? "" : `${Math.round(facts.discountPercent)}%`;
    case "cupom": return facts.couponCode ?? facts.couponDescription ?? "";
    case "coupon_link": return facts.couponLink ?? "";
    case "affiliate_link": return facts.affiliateUrl ?? "";
    case "marketplace": return facts.marketplace;
    case "frete_gratis": return facts.freeShipping ? "Frete grátis" : "";
  }
};

const conditionValue = (field: MessageTemplateCondition["field"], facts: CtaFacts): unknown => {
  switch (field) {
    case "preco_original": return facts.originalPrice;
    case "desconto": return facts.discountPercent;
    case "cupom": return facts.couponCode ?? facts.couponDescription;
    case "coupon_link": return facts.couponLink;
    case "frete_gratis": return facts.freeShipping;
    case "marketplace": return facts.marketplace;
    case "preco": return facts.price;
  }
};

const OMITTED_FRAGMENT = "\uE000";

/**
 * Uma seção condicional ausente pode ficar entre dois separadores de bloco.
 * Mantemos apenas o maior dos espaçamentos dos dois lados, em vez de somá-los.
 */
function compactOmittedFragments(value: string): string {
  return value.replace(/[ \t\r\n]*\uE000(?:[ \t\r\n]*\uE000)*[ \t\r\n]*/gu, (match) => {
    const whitespace = match.split(OMITTED_FRAGMENT);
    const newlines = Math.max(...whitespace.map((part) => (part.match(/\n/gu) ?? []).length));
    if (newlines > 0) return "\n".repeat(newlines);
    return whitespace.some((part) => part.length > 0) ? " " : "";
  });
}

export class MessageTemplateConditionEngine {
  evaluate(condition: MessageTemplateCondition, facts: CtaFacts): boolean {
    const actual = conditionValue(condition.field, facts);
    switch (condition.operator) {
      case "exists": return actual !== null && actual !== undefined && actual !== "";
      case "not_exists": return actual === null || actual === undefined || actual === "";
      case "eq": {
        if (typeof actual === "string" && typeof condition.value === "string") return actual.toLowerCase() === condition.value.toLowerCase();
        if (typeof actual === "boolean" && typeof condition.value === "string") return actual === (condition.value.toLowerCase() === "true");
        if (typeof actual === "number" && typeof condition.value === "string") return actual === Number(condition.value.replace(",", "."));
        return actual === condition.value;
      }
      case "neq": {
        if (typeof actual === "string" && typeof condition.value === "string") return actual.toLowerCase() !== condition.value.toLowerCase();
        if (typeof actual === "boolean" && typeof condition.value === "string") return actual !== (condition.value.toLowerCase() === "true");
        if (typeof actual === "number" && typeof condition.value === "string") return actual !== Number(condition.value.replace(",", "."));
        return actual !== condition.value;
      }
      case "gt": return Number(actual) > Number(condition.value);
      case "gte": return Number(actual) >= Number(condition.value);
      case "lt": return Number(actual) < Number(condition.value);
      case "lte": return Number(actual) <= Number(condition.value);
    }
  }
}

export interface MessageRenderResult {
  text: string;
  usedVariables: MessageTemplateVariable[];
  ctaSlots: number;
  markupRepairs: string[];
}

export class MessageTemplateRenderer {
  constructor(private conditions = new MessageTemplateConditionEngine()) {}

  render(document: MessageTemplateDocument, facts: CtaFacts, ctaText: string): MessageRenderResult {
    const used = new Set<MessageTemplateVariable>();
    let ctaSlots = 0;
    const renderNodes = (nodes: MessageTemplateNode[]): string => nodes.map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "cta") {
        ctaSlots++;
        const rendered = applyWhatsAppFormat(ctaText, node.format ?? "normal");
        return rendered || OMITTED_FRAGMENT;
      }
      if (node.type === "variable") {
        used.add(node.key);
        const rendered = applyWhatsAppFormat(factual(node.key, facts), node.format ?? "normal");
        return rendered || OMITTED_FRAGMENT;
      }
      const rendered = renderNodes(this.conditions.evaluate(node.condition, facts) ? node.then : node.else);
      return rendered.replaceAll(OMITTED_FRAGMENT, "").trim() ? rendered : OMITTED_FRAGMENT;
    }).join("");
    const rawText = compactOmittedFragments(renderNodes(document.nodes)).trim();
    if (ctaSlots > 1) throw new Error("TEMPLATE_MULTIPLE_CTA_SLOTS");
    const normalized = normalizeWhatsAppMarkup(rawText);
    const text = normalized.text;
    if (!hasValidWhatsAppMarkup(text)) throw new Error("CTA_WHATSAPP_FORMAT_INVALID");
    return { text, usedVariables: [...used], ctaSlots, markupRepairs: normalized.removedMarkers };
  }

  structuralPreview(document: MessageTemplateDocument): string {
    const renderNodes = (nodes: MessageTemplateNode[]): string => nodes.map((node) => {
      if (node.type === "text") return node.text;
      if (node.type === "cta") return "[CTA gerado pelo Treinador]";
      if (node.type === "variable") return `[${node.key}]`;
      return renderNodes(node.then);
    }).join("");
    return renderNodes(document.nodes).trim();
  }
}
