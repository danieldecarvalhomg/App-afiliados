import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProductAiGenerationUsage, SubscriptionFeature, UsageMetric, UsageQuotaService } from '../../domain/usage/UsageQuotaService';

type ProductAiUsagePayload = {
  allowed?: boolean;
  reason?: string;
  productUsed?: number;
  productLimit?: number | null;
  usagePeriodStart?: string;
};

export class SupabaseUsageQuotaService implements UsageQuotaService {
  constructor(private readonly db:SupabaseClient){}
  async consume(userId:string,metric:UsageMetric,amount=1):Promise<void>{
    const {data,error}=await this.db.rpc('consume_subscription_usage',{p_user_id:userId,p_metric:metric,p_amount:Math.max(1,Math.floor(amount))});
    if(error)throw error;
    const result=(Array.isArray(data)?data[0]:data) as {allowed?:boolean}|null;
    if(result?.allowed===false)throw new Error(`USAGE_LIMIT_${metric.toUpperCase()}`);
  }
  async assertFeature(userId:string,feature:SubscriptionFeature):Promise<void>{
    const {data,error}=await this.db.rpc('subscription_has_feature',{p_user_id:userId,p_feature:feature});
    if(error)throw error;
    if(data!==true)throw new Error(`FEATURE_NOT_AVAILABLE_${feature.toUpperCase()}`);
  }
  async consumeAiGeneration(userId:string,productId:string,amount=1):Promise<ProductAiGenerationUsage>{
    const {data,error}=await this.db.rpc('consume_subscription_ai_generation_for_product',{
      p_user_id:userId,
      p_product_id:productId,
      p_amount:Math.max(1,Math.floor(amount)),
    });
    if(error)throw error;
    const result=(Array.isArray(data)?data[0]:data) as ProductAiUsagePayload|null;
    if(result?.allowed===false)
      throw new Error(result.reason==='PRODUCT_LIMIT'?'USAGE_LIMIT_AI_GENERATION_PRODUCT':'USAGE_LIMIT_AI_GENERATION');
    return {
      used:Number(result?.productUsed??0),
      limit:result?.productLimit==null?null:Number(result.productLimit),
      usagePeriodStart:typeof result?.usagePeriodStart==='string'?result.usagePeriodStart:'',
    };
  }
  async getProductAiGenerationUsage(userId:string,productId:string):Promise<ProductAiGenerationUsage>{
    const {data,error}=await this.db.rpc('get_subscription_ai_generation_product_usage',{
      p_user_id:userId,
      p_product_id:productId,
    });
    if(error)throw error;
    const result=(Array.isArray(data)?data[0]:data) as ProductAiUsagePayload|null;
    return {
      used:Number(result?.productUsed??0),
      limit:result?.productLimit==null?null:Number(result.productLimit),
      usagePeriodStart:typeof result?.usagePeriodStart==='string'?result.usagePeriodStart:'',
    };
  }
}
