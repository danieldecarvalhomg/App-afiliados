import type { CtaCreativeGenerationInput } from "./CtaAIProvider";

/** Planeja a direção sem tabelas por categoria: usa somente o contexto factual,
 * memória recuperada e sinais recentes. A escrita concreta continua a cargo do
 * provider, que pode interpretar semanticamente o produto. */
export class CtaCreativeAnglePlanner {
  plan(
    input: Pick<CtaCreativeGenerationInput, "creativeContext" | "memory" | "instruction" | "variantIndex">,
  ) {
    const recentAngles = (input.memory.recentCtas ?? []).map((item) => item.angle).filter(Boolean) as string[];
    const directions = [
      "situação de uso ou problema cotidiano sugerido pelos dados confiáveis",
      "descoberta espontânea ou indicação próxima",
      "contexto da oportunidade comercial factual, sem urgência inventada",
    ];
    return {
      objective: input.instruction?.trim() || "Encontrar um ângulo específico, natural e coerente com o produto",
      diversityDirection: directions[input.variantIndex % directions.length],
      avoid: [...new Set(recentAngles.slice(0, 12))],
    };
  }
}
