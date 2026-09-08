import type {
  AutomationCondition,
  AutomationConditionField,
  AutomationConditionMode,
  AutomationEventContext,
  AutomationOperator,
  ConditionResult,
} from "./types";

const fieldTypes: Record<
  AutomationConditionField,
  "string" | "number" | "boolean" | "nullable"
> = {
  marketplace: "string",
  monitor: "string",
  source_group: "string",
  source_type: "string",
  price: "number",
  original_price: "number",
  discount_percent: "number",
  coupon_exists: "boolean",
  free_shipping: "boolean",
  category: "string",
  product_title: "string",
  keywords: "string",
  image_available: "boolean",
  affiliate_conversion_status: "string",
  deal_score: "number",
  commission: "number",
};
const allowed: Record<
  "string" | "number" | "boolean" | "nullable",
  Set<AutomationOperator>
> = {
  string: new Set([
    "equals",
    "not_equals",
    "contains",
    "not_contains",
    "starts_with",
    "exists",
    "not_exists",
  ]),
  number: new Set([
    "equals",
    "not_equals",
    "greater_than",
    "greater_or_equal",
    "less_than",
    "less_or_equal",
    "exists",
    "not_exists",
  ]),
  boolean: new Set([
    "is_true",
    "is_false",
    "equals",
    "not_equals",
    "exists",
    "not_exists",
  ]),
  nullable: new Set(["exists", "not_exists"]),
};
const actual = (
  field: AutomationConditionField,
  c: AutomationEventContext,
): unknown =>
  ({
    marketplace: c.marketplace,
    monitor: c.monitor,
    source_group: c.sourceGroup,
    source_type: c.productSourceType ?? c.sourceType,
    price: c.price,
    original_price: c.originalPrice,
    discount_percent: c.discountPercent,
    coupon_exists: c.couponExists,
    free_shipping: c.freeShipping,
    category: c.category,
    product_title: c.productTitle,
    keywords: c.keywords ?? c.productTitle,
    image_available: c.imageAvailable,
    affiliate_conversion_status: c.affiliateConversionStatus,
    deal_score: c.dealScore,
    commission: c.commission,
  })[field];
const norm = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export class ConditionEngine {
  validate(condition: AutomationCondition): void {
    if (
      !fieldTypes[condition.field] ||
      !allowed[fieldTypes[condition.field]].has(condition.operator)
    )
      throw new Error("AUTOMATION_CONDITION_OPERATOR_INVALID");
    if (
      !["exists", "not_exists", "is_true", "is_false"].includes(
        condition.operator,
      ) &&
      condition.value === undefined
    )
      throw new Error("AUTOMATION_CONDITION_VALUE_REQUIRED");
  }
  evaluate(
    condition: AutomationCondition,
    context: AutomationEventContext,
  ): ConditionResult {
    this.validate(condition);
    const found = actual(condition.field, context);
    const expected = condition.value;
    let passed = false;
    switch (condition.operator) {
      case "exists":
        passed = found !== null && found !== undefined && found !== "";
        break;
      case "not_exists":
        passed = found === null || found === undefined || found === "";
        break;
      case "is_true":
        passed = found === true;
        break;
      case "is_false":
        passed = found === false;
        break;
      case "equals":
        passed =
          typeof found === "number"
            ? found === Number(expected)
            : typeof found === "boolean"
              ? found === Boolean(expected)
              : norm(found) === norm(expected);
        break;
      case "not_equals":
        passed =
          typeof found === "number"
            ? found !== Number(expected)
            : typeof found === "boolean"
              ? found !== Boolean(expected)
              : norm(found) !== norm(expected);
        break;
      case "contains":
        passed = norm(found).includes(norm(expected));
        break;
      case "not_contains":
        passed = !norm(found).includes(norm(expected));
        break;
      case "starts_with":
        passed = norm(found).startsWith(norm(expected));
        break;
      case "greater_than":
        passed = typeof found === "number" && found > Number(expected);
        break;
      case "greater_or_equal":
        passed = typeof found === "number" && found >= Number(expected);
        break;
      case "less_than":
        passed = typeof found === "number" && found < Number(expected);
        break;
      case "less_or_equal":
        passed = typeof found === "number" && found <= Number(expected);
        break;
    }
    return {
      conditionId: condition.id,
      field: condition.field,
      operator: condition.operator,
      expected,
      actual: found ?? null,
      passed,
    };
  }
  evaluateAll(
    conditions: AutomationCondition[],
    mode: AutomationConditionMode,
    context: AutomationEventContext,
  ) {
    const results = conditions.map((item) => this.evaluate(item, context));
    return {
      passed:
        results.length === 0 ||
        (mode === "all"
          ? results.every((item) => item.passed)
          : results.some((item) => item.passed)),
      results,
    };
  }
}
