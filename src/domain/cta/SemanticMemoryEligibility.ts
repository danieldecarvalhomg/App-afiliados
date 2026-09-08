import type { CtaMemoryItem, CtaRule } from "./types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().trim();
type Facts = { title: string; category: string | null; marketplace: string };

export function ctaRuleEligible(rule: CtaRule, facts: Facts): boolean {
  return semanticMemoryEligible({ active: rule.active, scope: rule.scope, condition: { conditions: rule.condition ?? [] } }, facts);
}

export function semanticMemoryEligible(item: Pick<CtaMemoryItem, "active" | "scope" | "condition">, facts: Facts): boolean {
  if (!item.active || item.scope === "one_off") return false;
  if (item.scope !== "conditional" && item.scope !== "exception") return true;
  const fields: Record<string, string | null> = { category: facts.category, marketplace: facts.marketplace, product: facts.title, title: facts.title };
  const check = (field: string, operator: string, expected: unknown): boolean => {
    operator = ({ equals: "eq", equal: "eq", not_equals: "neq" } as Record<string, string>)[operator] ?? operator;
    // Condições subjetivas (humor, estilo) continuam explícitas no prompt da IA.
    if (!(field in fields)) return true;
    const actual = fields[field];
    if (operator === "exists") return !!actual;
    if (operator === "not_exists") return !actual;
    if (typeof expected !== "string") return false;
    if (operator === "neq") return normalize(actual ?? "") !== normalize(expected);
    if (!actual) return false;
    if (operator === "contains") return normalize(actual).includes(normalize(expected));
    if (operator === "eq") return normalize(actual) === normalize(expected);
    return false;
  };
  return Object.entries(item.condition).every(([key, value]) => {
    if (key === "conditions" && Array.isArray(value)) return value.every((condition) =>
      !!condition && typeof condition === "object" && check(condition.field, condition.operator, condition.value));
    if (!(key in fields)) return true;
    return Array.isArray(value) ? value.some((option) => check(key, "eq", option)) : check(key, key === "product" ? "contains" : "eq", value);
  });
}
