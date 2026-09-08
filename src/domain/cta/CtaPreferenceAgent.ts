import type { CtaAIProvider, CtaInterpretation } from "./CtaAIProvider";
import type { CtaBlueprint, CtaFeedbackStrength, CtaProfile, CtaRule } from "./types";

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && !!value.trim() && value.length <= max;
const strengths: CtaFeedbackStrength[] = ["weak_positive", "positive", "strong_positive", "weak_negative", "negative", "strong_negative"];

export class CtaPreferenceAgent {
  constructor(private readonly provider: CtaAIProvider) {}

  async interpret(input: Parameters<CtaAIProvider["interpretCtaInstruction"]>[0]) {
    const result = await this.provider.interpretCtaInstruction(input);
    // O provider pode reutilizar a resposta em cache. Nunca altere esse objeto.
    const output = structuredClone(result.output);
    const invalid = () => { throw new Error("CTA_ASSISTANT_OUTPUT_INVALID"); };
    if (!record(output)) return invalid();
    if (!["persistent", "conditional", "exception", "one_off"].includes(output.scope) ||
        typeof output.requiresConfirmation !== "boolean" || !text(output.reply, 20_000) ||
        !record(output.profilePatch) || !Array.isArray(output.ruleChanges) ||
        !Array.isArray(output.structureOperations) || !Array.isArray(output.changeSummary) ||
        !output.changeSummary.every((item) => text(item, 5_000))) return invalid();
    if (output.structureOperations.length > 20 || output.ruleChanges.length > 100 || output.changeSummary.length > 100)
      throw new Error("CTA_ASSISTANT_OUTPUT_TOO_LARGE");
    for (const change of output.ruleChanges) {
      if (!record(change) || !["add", "archive"].includes(change.action) || !text(change.ruleType, 100) ||
          !text(change.value, 500) || (change.condition !== undefined && !Array.isArray(change.condition))) return invalid();
      if (change.scope !== undefined && !["persistent", "conditional", "exception", "one_off"].includes(change.scope)) return invalid();
    }
    output.ruleChanges = output.ruleChanges.filter((change) => change.scope !== "one_off");
    if (output.examples !== undefined && (!Array.isArray(output.examples) || output.examples.length > 50)) return invalid();
    const examples = [...(output.examples ?? []), ...(output.example ? [output.example] : [])];
    for (const example of examples) {
      if (!record(example) || !text(example.text, 20_000) || !["positive", "negative", "reference"].includes(example.sentiment)) return invalid();
      example.traits = Array.isArray(example.traits) ? example.traits.filter((item) => text(item, 500)).slice(0, 50) : [];
    }
    output.examples = examples.filter((example, index) => examples.findIndex((other) => other.text.trim() === example.text.trim() && other.sentiment === example.sentiment) === index);
    delete output.example;
    if (output.archiveMemoryIds !== undefined && (!Array.isArray(output.archiveMemoryIds) || output.archiveMemoryIds.length > 100 || !output.archiveMemoryIds.every((id) => text(id, 100)))) return invalid();
    output.archiveMemoryIds = [...new Set(output.archiveMemoryIds ?? [])].filter((id) => input.memory?.some((item) => item.id === id && item.active));
    if (output.feedback) {
      if (!record(output.feedback) || !strengths.includes(output.feedback.strength as CtaFeedbackStrength) ||
          !record(output.feedback.aspects) || !Object.values(output.feedback.aspects).every((item) => text(item, 500))) return invalid();
      if (!input.recentGenerations.some((item) => item.id === output.feedback?.generationId)) delete output.feedback.generationId;
    }
    if (output.structureOperations.length) {
      output.reply = "Essa configuração pertence a Templates. Abra o template atual para alterar ordem, posição, condições ou agrupamentos.";
      output.scope = "one_off";
      output.requiresConfirmation = false;
      output.changeSummary = [];
      delete output.example;
      output.examples = [];
      output.archiveMemoryIds = [];
      delete output.feedback;
    }
    output.structureOperations = [];
    // Condições e exceções ficam nas regras/memória; o perfil é global.
    if (output.scope !== "persistent") output.profilePatch = {};
    if (output.scope === "one_off") output.ruleChanges = [];
    return { ...result, output: output as CtaInterpretation };
  }
}
