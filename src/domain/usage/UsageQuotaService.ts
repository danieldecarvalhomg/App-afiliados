export type UsageMetric = 'dispatch' | 'channel' | 'ai_generation' | 'affiliate_conversion' | 'monitored_group' | 'radar_refresh';
export type SubscriptionFeature = 'amazon'|'shopee'|'mercado_livre'|'radar'|'group_monitor'|'ai_cta'|'ai_trainer'|'landing_pages';

export interface ProductAiGenerationUsage {
  used: number;
  limit: number | null;
  usagePeriodStart: string;
}

export interface UsageQuotaService {
  consume(userId:string, metric:UsageMetric, amount?:number):Promise<void>;
  assertFeature?(userId:string, feature:SubscriptionFeature):Promise<void>;
  /** Consome a franquia mensal total e a franquia mensal do produto na mesma operação. */
  consumeAiGeneration?(userId:string, productId:string, amount?:number):Promise<ProductAiGenerationUsage>;
  getProductAiGenerationUsage?(userId:string, productId:string):Promise<ProductAiGenerationUsage>;
}
