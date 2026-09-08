import { describe, expect, it, vi } from "vitest";
import { SupabaseUsageQuotaService } from "./SupabaseUsageQuotaService";

describe("SupabaseUsageQuotaService", () => {
  it("traduz o bloqueio por produto em um erro público específico", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { allowed: false, reason: "PRODUCT_LIMIT", productUsed: 30, productLimit: 30 },
      error: null,
    });
    const service = new SupabaseUsageQuotaService({ rpc } as never);

    await expect(service.consumeAiGeneration("user", "product")).rejects.toThrow("USAGE_LIMIT_AI_GENERATION_PRODUCT");
    expect(rpc).toHaveBeenCalledWith("consume_subscription_ai_generation_for_product", {
      p_user_id: "user", p_product_id: "product", p_amount: 1,
    });
  });

  it("lê o contador mensal do produto", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { productUsed: 7, productLimit: 30, usagePeriodStart: "2026-09-01" },
      error: null,
    });
    const service = new SupabaseUsageQuotaService({ rpc } as never);

    await expect(service.getProductAiGenerationUsage("user", "product")).resolves.toEqual({
      used: 7, limit: 30, usagePeriodStart: "2026-09-01",
    });
  });
});
