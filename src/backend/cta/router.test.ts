import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("../middleware/auth", () => ({ getAuthUser: mocks.auth }));
import { createCtaRouter } from "./router";

let server: Server;
let base: string;
const service = { assistant: vi.fn(), trainingReview: vi.fn(), applyTraining: vi.fn(), deleteLearnedMemory: vi.fn(), resetMemory: vi.fn(), productAiGenerationUsage: vi.fn() };
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use("/api/cta", createCtaRouter(service as never));
  server = await new Promise<Server>((resolve) => { const value = app.listen(0, "127.0.0.1", () => resolve(value)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/cta`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ id: "owner" }); service.assistant.mockReset().mockResolvedValue({ reply: "ok" }); });
const request = (path = "/assistant/message", body: unknown = { message: "Olá" }, method = "POST") => fetch(base + path, {
  method,
  headers: { "content-type": "application/json" },
  ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
});

describe("API do treinador", () => {
  it("deriva o proprietário da autenticação e ignora userId forjado", async () => {
    expect((await request("/assistant/message", { message: "Olá", userId: "victim" })).status).toBe(200);
    expect(service.assistant).toHaveBeenCalledWith("owner", "Olá");
  });
  it("expõe somente a cota do produto pertencente ao usuário autenticado", async () => {
    service.productAiGenerationUsage.mockResolvedValue({ used: 4, limit: 30, usagePeriodStart: "2026-09-01" });
    const response = await request("/products/product-a/ai-usage", undefined, "GET");
    expect(response.status).toBe(200);
    expect(service.productAiGenerationUsage).toHaveBeenCalledWith("owner", "product-a");
    expect((await response.json()).data).toMatchObject({ used: 4, limit: 30 });
  });
  it.each(["/assistant/message", "/training/analyze", "/training/source/apply"])("exige login em %s", async (path) => {
    mocks.auth.mockResolvedValue(null);
    const response = await request(path);
    expect(response.status).toBe(401);
    expect(service.assistant).not.toHaveBeenCalled();
    expect(service.trainingReview).not.toHaveBeenCalled();
    expect(service.applyTraining).not.toHaveBeenCalled();
  });
  it.each([
    ["CTA_AI_TIMEOUT", 504], ["CTA_AI_RATE_LIMITED", 429], ["CTA_AI_PROVIDER_FAILED", 502], ["CTA_AI_OVERLOADED",503],
    ["CTA_ASSISTANT_OUTPUT_INVALID", 502], ["CTA_TRAINING_OUTPUT_INVALID", 502],
    ["CTA_TRAINING_SOURCE_TOO_LARGE", 413], ["CTA_TRAINING_SOURCE_REQUIRED", 400],
    ["CTA_TRAINING_REVIEW_NOT_FOUND", 404], ["FEATURE_NOT_AVAILABLE_AI_TRAINER", 403], ["USAGE_LIMIT_AI_GENERATION", 403], ["USAGE_LIMIT_AI_GENERATION_PRODUCT", 403],
  ])("mapeia %s para HTTP %i", async (code, status) => {
    service.assistant.mockRejectedValue(new Error(code as string));
    const response = await request();
    expect(response.status).toBe(status);
    expect((await response.json()).error.code).toBe(code);
  });
  it("mapeia corretamente exceção de domínio do Postgres", async () => {
    service.assistant.mockRejectedValue({ code: "P0001", message: "CTA_TRAINING_REVIEW_NOT_FOUND" });
    const response = await request(); expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("CTA_TRAINING_REVIEW_NOT_FOUND");
  });
  it("não expõe detalhes internos pelo campo code", async () => {
    service.assistant.mockRejectedValue(new Error("request failed: https://secret.example?key=private"));
    const response = await request(); expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private");
  });
  it("trata rejeição inesperada da autenticação sem pendurar a conexão", async () => {
    mocks.auth.mockRejectedValue(new Error("auth offline"));
    const response = await request(); expect(response.status).toBe(500);
    expect(service.assistant).not.toHaveBeenCalled();
  });
});
