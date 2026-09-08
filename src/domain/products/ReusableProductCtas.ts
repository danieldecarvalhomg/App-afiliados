import type { CtaGeneration } from "../cta/types";
import type { QueueItem } from "../dispatch/types";

/**
 * Retorna a última CTA que continua válida e que já concluiu pelo menos um
 * envio para o mesmo produto. A ordem recebida deve ser da execução mais nova
 * para a mais antiga.
 */
export function reusableSentCtas(
  generations: CtaGeneration[],
  queueItems: QueueItem[],
) {
  const valid = new Map(
    generations
      .filter(
        (generation) =>
          generation.status === "valid" && generation.publishable,
      )
      .map((generation) => [generation.id, generation]),
  );
  const byProduct = new Map<string, CtaGeneration>();

  for (const item of queueItems) {
    if (
      item.status !== "completed" ||
      item.sourceType !== "cta_generation" ||
      item.progress.sent < 1
    )
      continue;
    const generationId =
      item.contentSnapshot.ctaGenerationId ?? item.sourceReferenceId;
    const productId = item.contentSnapshot.productId;
    if (!generationId || !productId || byProduct.has(productId)) continue;
    const generation = valid.get(generationId);
    if (!generation || generation.productId !== productId) continue;
    byProduct.set(productId, generation);
  }

  return byProduct;
}
