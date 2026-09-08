import type {
  MessageTemplateCondition,
  MessageTemplateConditionField,
  MessageTemplateConditionOperator,
  MessageTemplateDocument,
  MessageTemplateNode,
  MessageTemplateVariable,
} from "./types";

const VARIABLES = new Set<MessageTemplateVariable>([
  "produto",
  "preco",
  "preco_original",
  "desconto",
  "cupom",
  "coupon_link",
  "affiliate_link",
  "marketplace",
  "frete_gratis",
]);
const FIELDS = new Set<MessageTemplateConditionField>([
  "preco_original",
  "desconto",
  "cupom",
  "coupon_link",
  "frete_gratis",
  "marketplace",
  "preco",
]);
const OPERATORS: Record<string, MessageTemplateConditionOperator> = {
  "=": "eq",
  "==": "eq",
  "!=": "neq",
  ">": "gt",
  ">=": "gte",
  "<": "lt",
  "<=": "lte",
};

export class TemplateSyntaxError extends Error {
  readonly code = "TEMPLATE_DSL_INVALID";
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(`${message} (linha ${line}, coluna ${column})`);
    this.name = "TemplateSyntaxError";
  }
}

const scalar = (raw: string): string | number | boolean => {
  const value = raw.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, "$1$2");
  if (/^-?\d+(?:[.,]\d+)?$/u.test(value)) return Number(value.replace(",", "."));
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

function parseCondition(raw: string, fail: (message: string) => never): MessageTemplateCondition {
  const source = raw.trim();
  const exists = source.match(/^([a-z_]+)\s+(exists|not_exists)$/iu);
  if (exists) {
    if (!FIELDS.has(exists[1] as MessageTemplateConditionField)) fail(`Campo condicional desconhecido: ${exists[1]}`);
    return {
      field: exists[1] as MessageTemplateConditionField,
      operator: exists[2] as "exists" | "not_exists",
    };
  }
  const compared = source.match(/^([a-z_]+)\s*(>=|<=|!=|==|=|>|<)\s*(.+)$/u);
  if (compared) {
    if (!FIELDS.has(compared[1] as MessageTemplateConditionField)) fail(`Campo condicional desconhecido: ${compared[1]}`);
    return {
      field: compared[1] as MessageTemplateConditionField,
      operator: OPERATORS[compared[2]],
      value: scalar(compared[3]),
    };
  }
  if (!FIELDS.has(source as MessageTemplateConditionField)) fail(`Condição inválida: ${source}`);
  return { field: source as MessageTemplateConditionField, operator: "exists" };
}

interface Frame {
  node: Extract<MessageTemplateNode, { type: "conditional" }>;
  branch: "then" | "else";
}

function collapseFormatting(nodes: MessageTemplateNode[]): MessageTemplateNode[] {
  const nested = nodes.map((node) => node.type === "conditional"
    ? { ...node, then: collapseFormatting(node.then), else: collapseFormatting(node.else) }
    : node);
  const formats = [
    { open: "```", close: "```", format: "monospace" as const },
    { open: "*", close: "*", format: "bold" as const },
    { open: "_", close: "_", format: "italic" as const },
    { open: "~", close: "~", format: "strikethrough" as const },
  ];
  for (let index = 1; index < nested.length - 1; index++) {
    const node = nested[index];
    const before = nested[index - 1];
    const after = nested[index + 1];
    if ((node.type !== "cta" && node.type !== "variable") || before.type !== "text" || after.type !== "text") continue;
    const match = formats.find((item) => before.text.endsWith(item.open) && after.text.startsWith(item.close));
    if (!match) continue;
    before.text = before.text.slice(0, -match.open.length);
    after.text = after.text.slice(match.close.length);
    nested[index] = { ...node, format: match.format };
  }
  for (let index = 1; index < nested.length; index++) {
    const node = nested[index];
    const before = nested[index - 1];
    if ((node.type !== "cta" && node.type !== "variable") || before.type !== "text") continue;
    const prefix = before.text.endsWith("> ") ? { text: "> ", format: "quote" as const }
      : before.text.endsWith("- ") ? { text: "- ", format: "bullet_list" as const }
        : /(?:^|\n)1\. $/u.test(before.text) ? { text: "1. ", format: "numbered_list" as const }
          : null;
    if (!prefix) continue;
    before.text = before.text.slice(0, -prefix.text.length);
    nested[index] = { ...node, format: prefix.format };
  }
  return nested.filter((node) => node.type !== "text" || node.text.length > 0);
}

export class TemplateParser {
  parse(dsl: string): MessageTemplateDocument {
    if (typeof dsl !== "string") throw new TemplateSyntaxError("Template manual inválido", 1, 1);
    if (dsl.length > 200_000) throw new TemplateSyntaxError("Template manual excede 200.000 caracteres", 1, 1);
    const root: MessageTemplateNode[] = [];
    const stack: Frame[] = [];
    let cursor = 0;
    let sequence = 0;
    const id = () => `node_${++sequence}`;
    const current = () => {
      const frame = stack.at(-1);
      return frame ? frame.node[frame.branch] : root;
    };
    const location = (offset: number) => {
      const before = dsl.slice(0, offset);
      const lines = before.split("\n");
      return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
    };
    const failAt = (offset: number, message: string): never => {
      const where = location(offset);
      throw new TemplateSyntaxError(message, where.line, where.column);
    };
    const pushText = (text: string) => {
      if (!text) return;
      const list = current();
      const prior = list.at(-1);
      if (prior?.type === "text") prior.text += text;
      else list.push({ id: id(), type: "text", text });
    };

    const token = /\{([^{}]+)\}/gu;
    for (let match = token.exec(dsl); match; match = token.exec(dsl)) {
      pushText(dsl.slice(cursor, match.index));
      const directive = match[1].trim();
      if (directive === "cta_ia") current().push({ id: id(), type: "cta" });
      else if (VARIABLES.has(directive as MessageTemplateVariable)) {
        current().push({ id: id(), type: "variable", key: directive as MessageTemplateVariable });
      } else if (directive.startsWith("if ")) {
        const node: Extract<MessageTemplateNode, { type: "conditional" }> = {
          id: id(),
          type: "conditional",
          condition: parseCondition(directive.slice(3), (message) => failAt(match!.index, message)),
          then: [],
          else: [],
        };
        current().push(node);
        stack.push({ node, branch: "then" });
      } else if (directive === "else") {
        const frame = stack.at(-1);
        if (!frame) failAt(match.index, "{else} sem {if}");
        const activeFrame = frame!;
        if (activeFrame.branch === "else") failAt(match.index, "A condição possui mais de um {else}");
        activeFrame.branch = "else";
      } else if (directive === "/if") {
        if (!stack.length) failAt(match.index, "{/if} sem {if}");
        stack.pop();
      } else {
        failAt(match.index, `Variável ou diretiva desconhecida: {${directive}}`);
      }
      cursor = match.index + match[0].length;
    }
    pushText(dsl.slice(cursor));
    if (stack.length) {
      const open = stack.at(-1)!;
      const offset = dsl.lastIndexOf(`{if ${open.node.condition.field}`);
      failAt(Math.max(0, offset), "Condicional não fechada; adicione {/if}");
    }
    return { version: 1, nodes: collapseFormatting(root) };
  }
}

export const isTemplateVariable = (value: string): value is MessageTemplateVariable =>
  VARIABLES.has(value as MessageTemplateVariable);
