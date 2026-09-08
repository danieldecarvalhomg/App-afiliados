import { describe, expect, it, vi } from "vitest";
import { SupabaseAutomationRepository } from "./SupabaseAutomationRepository";
import type { AutomationExecution } from "../../domain/automation/types";

const execution = {
  id: "execution-1",
  userId: "user-1",
} as AutomationExecution;

const input = {
  productId: "product-1",
  sourceType: "whatsapp",
  sourceReferenceId: "capture-1",
  finalText: "Promoção pronta",
  primaryMediaAssetId: null,
  affiliateUrl: "https://example.com/affiliate",
  sourceUrl: "https://example.com/source",
  templateId: null,
  templateVersion: null,
  ctaGenerationId: "cta-1",
};

describe("SupabaseAutomationRepository.saveSnapshot", () => {
  it("repete sem source_url quando o schema cache retorna PGRST204", async () => {
    const inserts: Array<Record<string, unknown>> = [];
    const db = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        })),
        insert: vi.fn((payload: Record<string, unknown>) => {
          inserts.push({ ...payload });
          const firstAttempt = inserts.length === 1;
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(
                firstAttempt
                  ? {
                      data: null,
                      error: {
                        code: "PGRST204",
                        message:
                          "Could not find the 'source_url' column of 'automation_prepared_snapshots' in the schema cache",
                      },
                    }
                  : {
                      data: {
                        id: "snapshot-1",
                        execution_id: execution.id,
                        snapshot_version: 1,
                        product_id: input.productId,
                        source_type: input.sourceType,
                        source_reference_id: input.sourceReferenceId,
                        final_text: input.finalText,
                        primary_media_asset_id: null,
                        affiliate_url: input.affiliateUrl,
                        template_id: null,
                        template_version: null,
                        cta_generation_id: input.ctaGenerationId,
                        prepared_at: "2026-08-27T15:00:00.000Z",
                      },
                      error: null,
                    },
              ),
            })),
          };
        }),
      })),
    };

    const repository = new SupabaseAutomationRepository(db as never);
    const saved = await repository.saveSnapshot(execution, input);

    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toHaveProperty("source_url", input.sourceUrl);
    expect(inserts[1]).not.toHaveProperty("source_url");
    expect(saved.id).toBe("snapshot-1");
    expect(saved.sourceUrl).toBeNull();
  });
});

describe("SupabaseAutomationRepository.deleteExecution", () => {
  it("remove somente execuções falhas do usuário", async () => {
    const db = {
      from: vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: "execution-1" },
                    error: null,
                  }),
                })),
              })),
            })),
          })),
        })),
      })),
    };

    const repository = new SupabaseAutomationRepository(db as never);

    await expect(
      repository.deleteExecution("user-1", "execution-1"),
    ).resolves.toBe(true);
  });
});
