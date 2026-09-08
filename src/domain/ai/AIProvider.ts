import type { PromotionMarketplace } from '../monitoring/types';

export interface PromotionAIInput {
  text: string;
  links: string[];
  normalizedMoneyCandidates: number[];
  deterministicMarketplace: PromotionMarketplace | null;
}

/** Saída sem confiança: sempre passa pela validação do domínio antes do banco. */
export interface PromotionAIOutput {
  isPromotion: boolean | null;
  confidence: number;
  productName: string | null;
  price: number | null;
  originalPrice: number | null;
  coupon: { code: string | null; description: string | null } | null;
  freeShipping: boolean | null;
  marketplace: PromotionMarketplace;
  primaryProductLink: string | null;
  couponLinks: string[];
}

export interface AIProviderResult {
  output: unknown;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  processingMs: number;
}

export class AIProviderError extends Error {
  constructor(public readonly code: string, public readonly transient: boolean, message: string) {
    super(message);
  }
}

export interface AIProvider {
  analyzePromotion(input: PromotionAIInput): Promise<AIProviderResult>;
}
