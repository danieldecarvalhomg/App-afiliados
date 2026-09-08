import type { CtaAIProvider } from "./CtaAIProvider";
import type { CtaRepository } from "./CtaRepository";
import type { CtaMemoryItem, CtaTrainingReview } from "./types";

const MAX_SOURCE_CHARS = 1_000_000;
const CHUNK_CHARS = 12_000;
const MAX_ITEMS = 2_000;

export function validateTrainingSource(raw: unknown): asserts raw is string {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("CTA_TRAINING_SOURCE_REQUIRED");
  if (raw.length > MAX_SOURCE_CHARS) throw new Error("CTA_TRAINING_SOURCE_TOO_LARGE");
}

export function chunkTrainingSource(content: string, limit = CHUNK_CHARS): string[] {
  if (!Number.isInteger(limit) || limit < 2) throw new Error("CTA_TRAINING_CHUNK_LIMIT_INVALID");
  if (!content) return [];
  const chunks: string[] = [];
  let current = "";
  const flush = () => { if (current) { chunks.push(current); current = ""; } };
  const append = (piece: string) => {
    if (!piece) return;
    if (piece.length > limit) {
      flush();
      for (let start = 0; start < piece.length;) {
        let end = Math.min(start + limit, piece.length);
        if (end < piece.length && /[\uD800-\uDBFF]/u.test(piece[end - 1]) && /[\uDC00-\uDFFF]/u.test(piece[end])) end--;
        chunks.push(piece.slice(start, end)); start = end;
      }
      return;
    }
    if (current && current.length + piece.length > limit) flush();
    current += piece;
  };
  const paragraphs = content.match(/[\s\S]*?(?:\n{2,}|$)/gu) ?? [content];
  for (const paragraph of paragraphs) append(paragraph);
  flush();
  if (chunks.join("") !== content) throw new Error("CTA_TRAINING_CHUNKING_DATA_LOSS");
  return chunks;
}

const counts = (items: CtaTrainingReview["items"]): CtaTrainingReview["counts"] => ({
  rules: items.filter((item) => item.kind === "instruction" || item.kind === "correction").length,
  conditions: items.filter((item) => item.scope === "conditional" || item.scope === "exception").length,
  avoided: items.filter((item) => item.polarity === "negative").length,
  positiveExamples: items.filter((item) => item.kind === "positive_example").length,
  negativeExamples: items.filter((item) => item.kind === "negative_example").length,
});

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function summary(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 200 || !value.every((item) => typeof item === "string" && item.length <= 5_000))
    throw new Error("CTA_TRAINING_OUTPUT_INVALID");
  return value;
}
function sanitizeItems(items: CtaTrainingReview["items"]): CtaTrainingReview["items"] {
  if (!Array.isArray(items)) throw new Error("CTA_TRAINING_OUTPUT_INVALID");
  if (items.length > MAX_ITEMS) throw new Error("CTA_TRAINING_OUTPUT_TOO_LARGE");
  if (items.some((item) => !record(item) ||
      !["instruction", "positive_example", "negative_example", "reference", "feedback", "comparison", "correction", "meta_feedback"].includes(item.kind) ||
      !["persistent", "conditional", "exception", "one_off"].includes(item.scope) ||
      !["positive", "negative", "neutral"].includes(item.polarity) || !record(item.condition) ||
      typeof item.semanticText !== "string" || !item.semanticText.trim() || item.semanticText.length > 5_000 ||
      typeof item.priority !== "number" || !Number.isFinite(item.priority))) throw new Error("CTA_TRAINING_OUTPUT_INVALID");
  return items.filter((item) => item.scope !== "one_off").map((item) => ({
    kind: item.kind,
    scope: item.scope,
    semanticText: item.semanticText.trim(),
    condition: item.condition,
    polarity: item.polarity,
    priority: Math.max(1, Math.min(100, Math.round(item.priority))),
  }));
}

const stableCondition = (condition: Record<string, unknown>) => JSON.stringify(
  Object.fromEntries(Object.entries(condition).sort(([left], [right]) => left.localeCompare(right))),
);
const scenarioPrefix = /^\s*situa[çc][aã]o\s+\d+\s*:\s*/iu;
const canonicalSemanticText = (text: string) => text
  .replace(scenarioPrefix, "")
  .normalize("NFD").replace(/[\u0300-\u036f]/gu, "")
  .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]+/gu, " ").trim();
const kindRank = (kind: ProposedMemoryItem["kind"]) =>
  ["positive_example", "negative_example"].includes(kind) ? 4
    : ["instruction", "correction"].includes(kind) ? 3
      : kind === "reference" ? 2 : 1;

export function dedupeTrainingItems(items: ProposedMemoryItem[]): ProposedMemoryItem[] {
  const unique: ProposedMemoryItem[] = [];
  for (const item of items) {
    const canonical = canonicalSemanticText(item.semanticText);
    const scenario = scenarioPrefix.test(item.semanticText);
    const family = scenario ? "numbered_scenario" : item.kind;
    const context = scenario
      ? `${item.scope}|${stableCondition(item.condition)}`
      : `${item.scope}|${item.polarity}|${stableCondition(item.condition)}`;
    const existingIndex = unique.findIndex((candidate) => {
      const candidateScenario = scenarioPrefix.test(candidate.semanticText);
      const candidateContext = candidateScenario
        ? `${candidate.scope}|${stableCondition(candidate.condition)}`
        : `${candidate.scope}|${candidate.polarity}|${stableCondition(candidate.condition)}`;
      if (candidateContext !== context) return false;
      if ((candidateScenario ? "numbered_scenario" : candidate.kind) !== family) return false;
      const other = canonicalSemanticText(candidate.semanticText);
      return other === canonical || (Math.min(other.length, canonical.length) >= 60 && (other.startsWith(canonical) || canonical.startsWith(other)));
    });
    if (existingIndex < 0) { unique.push(item); continue; }
    const existing = unique[existingIndex];
    const longer = canonicalSemanticText(item.semanticText).length > canonicalSemanticText(existing.semanticText).length ? item : existing;
    const preferred = kindRank(item.kind) > kindRank(existing.kind) ? item : existing;
    unique[existingIndex] = { ...longer, kind: preferred.kind, polarity: preferred.polarity, priority: Math.max(existing.priority, item.priority) };
  }
  return unique;
}

export class TrainingIngestionService {
  constructor(private repository: CtaRepository, private provider: CtaAIProvider) {}

  async analyze(userId: string, raw: string): Promise<CtaTrainingReview> {
    validateTrainingSource(raw);
    if (!this.provider.interpretTrainingChunk || !this.provider.reconcileTraining)
      throw new Error("CTA_TRAINING_PROVIDER_UNAVAILABLE");
    // O texto original é persistido antes da primeira interpretação para que
    // nenhuma falha de IA destrua a fonte auditável.
    const chunks = chunkTrainingSource(raw);
    const source = await this.repository.createTrainingSource(userId, {
      content: raw,
      charCount: raw.length,
      chunkCount: chunks.length,
    });
    try {
      const interpreted: Array<{ summary: string[]; items: CtaTrainingReview["items"] }> = [];
      // Concorrência limitada: acelera manuais grandes sem disparar centenas de
      // requests simultâneos nem perder a ordem original.
      for (let offset = 0; offset < chunks.length; offset += 3) {
        const batch = await Promise.all(chunks.slice(offset, offset + 3).map(async (content, index) => {
          const result = await this.provider.interpretTrainingChunk!({
            content,
            chunkIndex: offset + index,
            chunkCount: chunks.length,
          });
          if (!record(result.output)) throw new Error("CTA_TRAINING_OUTPUT_INVALID");
          return { summary: summary(result.output.summary), items: sanitizeItems(result.output.items) };
        }));
        interpreted.push(...batch);
      }
      const existing = await this.repository.listMemoryItems(userId, true);
      const reconciled = await this.provider.reconcileTraining({ chunks: interpreted, existing });
      if (!record(reconciled.output)) throw new Error("CTA_TRAINING_OUTPUT_INVALID");
      const items = sanitizeItems(reconciled.output.items);
      // Reconciliação pode resumir exemplos em regras. Preserve a evidência
      // explícita extraída da fonte, inclusive exemplos negativos.
      const isExample = (item: ProposedMemoryItem) => ["positive_example", "negative_example", "reference"].includes(item.kind);
      const exampleKey = (item: ProposedMemoryItem) => JSON.stringify([item.kind, item.scope, item.semanticText.toLocaleLowerCase("pt-BR"), item.condition]);
      const seenExamples = new Set(items.filter(isExample).map(exampleKey));
      for (const item of interpreted.flatMap((chunk) => chunk.items).filter(isExample)) {
        if (!seenExamples.has(exampleKey(item))) { items.push(item); seenExamples.add(exampleKey(item)); }
      }
      const uniqueItems = dedupeTrainingItems(items);
      if (uniqueItems.length > MAX_ITEMS) throw new Error("CTA_TRAINING_OUTPUT_TOO_LARGE");
      const conflicts = reconciled.output.conflicts ?? [];
      if (!Array.isArray(conflicts) || conflicts.length > 500 || conflicts.some((item) => !record(item) ||
          ![item.prior, item.replacement, item.resolution].every((value) => typeof value === "string" && value.length <= 5_000)))
        throw new Error("CTA_TRAINING_OUTPUT_INVALID");
      const review = {
        summary: summary(reconciled.output.summary),
        items: uniqueItems,
        counts: counts(uniqueItems),
        conflicts,
      };
      return await this.repository.saveTrainingReview(userId, source.id, review);
    } catch (error) {
      const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : "CTA_TRAINING_ANALYSIS_FAILED";
      await this.repository.failTrainingSource(userId, source.id, code).catch(() => undefined);
      throw error;
    }
  }

  async apply(userId: string, sourceId: string) {
    const [profile, review] = await Promise.all([
      this.repository.getOrCreateProfile(userId),
      this.repository.getTrainingReview(userId, sourceId),
    ]);
    if (!review || review.source.status !== "review") throw new Error("CTA_TRAINING_REVIEW_NOT_FOUND");
    const version = await this.repository.applyTrainingMemory(userId, profile.id, sourceId, review);
    return { applied: true as const, memoryVersion: version, items: review.items.length };
  }

  memory(userId: string) { return this.repository.memoryView(userId); }
  removeMemory(userId: string, id: string) { return this.repository.deleteMemoryItem(userId, id); }
}

export type ProposedMemoryItem = Pick<CtaMemoryItem, "kind" | "scope" | "semanticText" | "condition" | "polarity" | "priority">;
