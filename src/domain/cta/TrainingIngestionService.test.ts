import { describe, expect, it, vi } from "vitest";
import { chunkTrainingSource, TrainingIngestionService } from "./TrainingIngestionService";

const item = {
  kind: "instruction" as const,
  scope: "persistent" as const,
  semanticText: "Escreva como uma recomendação natural",
  condition: {}, polarity: "positive" as const, priority: 80,
};

describe("TrainingIngestionService", () => {
  it.each([0, -1, 1, 2.5, Number.NaN, Number.POSITIVE_INFINITY])("recusa tamanho de chunk inválido %s sem laço infinito", (limit) => {
    expect(() => chunkTrainingSource("texto", limit)).toThrow("CTA_TRAINING_CHUNK_LIMIT_INVALID");
  });
  it("mantém pares UTF-16 inteiros entre chunks", () => {
    const input = "x🚀a🎉b😀c";
    const chunks = chunkTrainingSource(input, 2);
    expect(chunks.join("")).toBe(input);
    expect(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(chunk))).toBe(true);
  });
  it("processa o limite de um milhão de caracteres sem perder conteúdo", () => {
    const input = "abc 🚀\n\n".repeat(125000);
    const chunks = chunkTrainingSource(input);
    expect(input).toHaveLength(1_000_000);
    expect(chunks.join("")).toBe(input);
    expect(chunks.every((chunk) => chunk.length <= 12000)).toBe(true);
  });
  it("marca fonte como falha se o provedor falhar, sem aplicar memória", async () => {
    const repository = { createTrainingSource: vi.fn().mockResolvedValue({ id: "s" }), failTrainingSource: vi.fn().mockResolvedValue(undefined), saveTrainingReview: vi.fn() };
    const provider = { interpretTrainingChunk: vi.fn().mockRejectedValue(new Error("CTA_AI_TIMEOUT")), reconcileTraining: vi.fn() };
    await expect(new TrainingIngestionService(repository as never, provider as never).analyze("u", "manual")).rejects.toThrow("CTA_AI_TIMEOUT");
    expect(repository.failTrainingSource).toHaveBeenCalledWith("u", "s", "CTA_AI_TIMEOUT");
    expect(repository.saveTrainingReview).not.toHaveBeenCalled();
  });
  it("divide fontes grandes sem truncar, reordenar ou perder bytes", () => {
    const source = `${"a".repeat(13_001)}\n\n${"b".repeat(25_007)}\núltima linha`;
    const chunks = chunkTrainingSource(source, 4_000);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.join("")).toBe(source);
    expect(chunks.every((chunk) => chunk.length <= 4_000)).toBe(true);
  });

  it("persiste a fonte original, interpreta todos os chunks e reconcilia globalmente", async () => {
    const raw = `${"preferência natural. ".repeat(900)}\n\nEvite urgência falsa.`;
    const repository = {
      createTrainingSource: vi.fn().mockImplementation(async (_user, input) => ({ id: "source", status: "analyzing", createdAt: "", ...input })),
      listMemoryItems: vi.fn().mockResolvedValue([]),
      saveTrainingReview: vi.fn().mockImplementation(async (_user, _source, review) => ({ source: { id: "source", status: "review", charCount: raw.length, chunkCount: chunkTrainingSource(raw).length, createdAt: "" }, ...review })),
      failTrainingSource: vi.fn(),
    };
    const provider = {
      interpretTrainingChunk: vi.fn().mockImplementation(async ({ chunkIndex }) => ({ output: { summary: [`chunk ${chunkIndex}`], items: [item] }, provider: "test", model: "test", processingMs: 1 })),
      reconcileTraining: vi.fn().mockResolvedValue({ output: { summary: ["Preferências consolidadas"], items: [item, { ...item, kind: "negative_example", polarity: "negative", semanticText: "Evite urgência falsa" }], conflicts: [{ prior: "urgência", replacement: "natural", resolution: "substituir" }] }, provider: "test", model: "test", processingMs: 1 }),
    };
    const review = await new TrainingIngestionService(repository as never, provider as never).analyze("u", raw);
    expect(repository.createTrainingSource).toHaveBeenCalledWith("u", expect.objectContaining({ content: raw, charCount: raw.length }));
    expect(provider.interpretTrainingChunk).toHaveBeenCalledTimes(chunkTrainingSource(raw).length);
    expect(provider.reconcileTraining).toHaveBeenCalledOnce();
    expect(review.counts).toMatchObject({ rules: 1, avoided: 1, negativeExamples: 1 });
    expect(review.conflicts).toHaveLength(1);
  });

  it("consolida cenários numerados repetidos sem poluir a memória", async () => {
    const body = "o leitor quer organizar a cozinha. Use somente dados confirmados e mantenha a compra como escolha livre.";
    const scenario = (number: number, kind: "instruction" | "reference" = "instruction") => ({
      ...item, kind, polarity: kind === "reference" ? "neutral" as const : item.polarity, semanticText: `Situação ${number}: ${body}`,
    });
    const repository = {
      createTrainingSource: vi.fn().mockResolvedValue({ id: "source" }), listMemoryItems: vi.fn().mockResolvedValue([]),
      saveTrainingReview: vi.fn().mockImplementation(async (_user, _source, review) => ({ source: { id: "source", status: "review", charCount: 10, chunkCount: 1, createdAt: "" }, ...review })), failTrainingSource: vi.fn(),
    };
    const provider = {
      interpretTrainingChunk: vi.fn().mockResolvedValue({ output: { summary: [], items: [scenario(1)] }, provider: "test", model: "test", processingMs: 1 }),
      reconcileTraining: vi.fn().mockResolvedValue({ output: { summary: [], items: [scenario(1), scenario(9, "reference"), scenario(17)], conflicts: [] }, provider: "test", model: "test", processingMs: 1 }),
    };
    const review = await new TrainingIngestionService(repository as never, provider as never).analyze("u", "manual");
    expect(review.items).toHaveLength(1);
    expect(review.items[0]).toMatchObject({ kind: "instruction", semanticText: `Situação 1: ${body}` });
  });

  it("aplica somente uma revisão confirmada", async () => {
    const review = { source: { id: "source", status: "review", charCount: 10, chunkCount: 1, createdAt: "" }, summary: [], items: [item], counts: { rules: 1, conditions: 0, avoided: 0, positiveExamples: 0, negativeExamples: 0 }, conflicts: [] } as const;
    const repository = {
      getOrCreateProfile: vi.fn().mockResolvedValue({ id: "profile" }),
      getTrainingReview: vi.fn().mockResolvedValue(review),
      applyTrainingMemory: vi.fn().mockResolvedValue(7),
    };
    await expect(new TrainingIngestionService(repository as never, {} as never).apply("u", "source"))
      .resolves.toEqual({ applied: true, memoryVersion: 7, items: 1 });
    expect(repository.applyTrainingMemory).toHaveBeenCalledWith("u", "profile", "source", review);
  });

  it("recusa fonte acima do limite antes de persistir", async () => {
    const repository = { createTrainingSource: vi.fn() };
    const service = new TrainingIngestionService(repository as never, { interpretTrainingChunk: vi.fn(), reconcileTraining: vi.fn() } as never);
    await expect(service.analyze("u", "x".repeat(1_000_001))).rejects.toThrow("CTA_TRAINING_SOURCE_TOO_LARGE");
    expect(repository.createTrainingSource).not.toHaveBeenCalled();
  });
});
