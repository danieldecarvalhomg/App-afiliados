import type {
  CtaFacts,
  CtaTemplateCreativeContext,
  MessageTemplateDocument,
  MessageTemplateNode,
  MessageTemplateVariable,
} from "./types";
import { MessageTemplateConditionEngine } from "./MessageTemplateRenderer";

const labels: Record<MessageTemplateVariable, string> = {
  produto: "Produto",
  preco: "Preço",
  preco_original: "Preço anterior",
  desconto: "Desconto",
  cupom: "Cupom",
  coupon_link: "Link do cupom",
  affiliate_link: "Link do produto",
  marketplace: "Marketplace",
  frete_gratis: "Frete grátis",
};

export class TemplateDocumentInspector {
  constructor(private conditions = new MessageTemplateConditionEngine()) {}

  countCta(document: MessageTemplateDocument): number {
    const count = (nodes: MessageTemplateNode[]): number => nodes.reduce(
      (total, node) => total + (node.type === "cta" ? 1 : node.type === "conditional" ? count(node.then) + count(node.else) : 0),
      0,
    );
    return count(document.nodes);
  }

  context(document: MessageTemplateDocument, facts: CtaFacts): CtaTemplateCreativeContext {
    const ordered: CtaTemplateCreativeContext["orderedBlocks"] = [];
    const visible: Record<string, boolean> = {};
    const walk = (nodes: MessageTemplateNode[]) => {
      for (const node of nodes) {
        if (node.type === "conditional") {
          walk(this.conditions.evaluate(node.condition, facts) ? node.then : node.else);
          continue;
        }
        if (node.type === "text") continue;
        const key = node.type === "cta" ? "cta_ia" : node.key;
        ordered.push({
          blockId: node.id,
          key,
          label: node.type === "cta" ? "CTA" : labels[node.key],
          position: ordered.length,
          kind: node.type === "cta" ? "creative" : "factual",
          copyMode: node.type === "cta" ? "AI_GENERATED" : null,
          objective: node.type === "cta" ? "criar uma chamada inicial contextual" : null,
          instruction: null,
        });
        if (node.type === "variable") visible[node.key] = true;
      }
    };
    walk(document.nodes);
    return {
      orderedBlocks: ordered,
      visibleFactualBlocks: visible,
      aiSlotIds: ordered.filter((item) => item.copyMode === "AI_GENERATED").map((item) => item.blockId),
    };
  }
}
