import type { CtaInterpretation } from "./CtaAIProvider";
import type { CtaRule } from "./types";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
const polarity = (type: string) => type.startsWith("forbidden") ? "negative" : type.startsWith("required") ? "positive" : "neutral";

export class PreferenceConflictResolver {
  resolve(rules: CtaRule[], changes: CtaInterpretation["ruleChanges"], scope: CtaInterpretation["scope"] = "persistent") {
    const archiveIds = new Set<string>();
    const explicitArchives: CtaInterpretation["ruleChanges"] = [];
    const additions: CtaInterpretation["ruleChanges"] = [];
    for (const change of changes) {
      if (change.action === "archive") {
        explicitArchives.push(change);
        for (const rule of rules) if (
          rule.active && rule.ruleType === change.ruleType &&
          (normalize(rule.value) === normalize(change.value) || normalize(rule.value).includes(normalize(change.value)))
        ) archiveIds.add(rule.id);
        continue;
      }
      additions.push(change);
      const value = normalize(change.value);
      for (const rule of rules) {
        if (!rule.active || normalize(rule.value) !== value) continue;
        if (rule.scope !== (change.scope ?? scope) || JSON.stringify(rule.condition ?? []) !== JSON.stringify(change.condition ?? [])) continue;
        if (polarity(rule.ruleType) !== "neutral" && polarity(change.ruleType) !== "neutral" && polarity(rule.ruleType) !== polarity(change.ruleType))
          archiveIds.add(rule.id);
        // Repetir a mesma regra não cria duplicata; a nova formulação explícita
        // substitui o registro anterior para manter uma fonte ativa clara.
        if (rule.ruleType === change.ruleType) archiveIds.add(rule.id);
      }
    }
    return { archiveIds: [...archiveIds], explicitArchives, additions };
  }
}
