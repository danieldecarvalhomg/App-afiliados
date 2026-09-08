import type { ProductMediaAnalysis } from './types';
import { createHash } from 'node:crypto';
import type { AiResponseCache } from '../ai/AiResponseCache';

export interface ProductMediaAnalysisProvider {
  analyzeProductMedia(input: { bytes: Uint8Array; mimeType: string; productTitle: string; productCategory: string | null }): Promise<{ output: unknown; provider: string; model: string; processingMs: number }>;
}

const classifications = new Set(['clean_product_photo','marketplace_product_image','lifestyle_product_photo','promotional_creative','screenshot','packaging','unknown']);
const bool = (value: unknown) => value === true;
const score = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export class ProductMediaAnalyzer {
  private readonly cache = new Map<string, { expiresAt:number; value:{ analysis:ProductMediaAnalysis; provider:string; model:string; processingMs:number } }>();
  constructor(private readonly provider: ProductMediaAnalysisProvider,private readonly persistentCache?:AiResponseCache) {}
  async analyze(input: { bytes: Uint8Array; mimeType: string; productTitle: string; productCategory: string | null }): Promise<{ analysis: ProductMediaAnalysis; provider: string; model: string; processingMs: number }> {
    const cacheKey = createHash('sha256').update(input.bytes).update(input.productTitle.trim().toLocaleLowerCase('pt-BR')).update(input.productCategory ?? '').update((this.provider as {model?:string}).model??'provider-default').digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value, provider:'media-cache', processingMs:0 };
    if (cached) this.cache.delete(cacheKey);
    const persisted=process.env.AI_COST_OPTIMIZATIONS_ENABLED!=='false'?await this.persistentCache?.get('media',cacheKey).catch(()=>null):null;
    if(persisted){
      const analysis=this.normalize(persisted.payload);
      const value={analysis,provider:'media-persistent-cache',model:persisted.model,processingMs:0};
      this.cache.set(cacheKey,{expiresAt:Date.now()+24*60*60_000,value});return value;
    }
    const result = await this.provider.analyzeProductMedia(input);
    const value = { ...result, analysis:this.normalize(result.output) };
    if (this.cache.size >= 5_000) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cacheKey, { expiresAt:Date.now()+24*60*60_000, value });
    if(process.env.AI_COST_OPTIMIZATIONS_ENABLED!=='false')void this.persistentCache?.set({kind:'media',key:cacheKey,payload:value.analysis,provider:result.provider,model:result.model,expiresAt:new Date(Date.now()+30*24*60*60_000).toISOString()}).catch(()=>undefined);
    return value;
  }
  private normalize(output:unknown):ProductMediaAnalysis{
    const row=output as Record<string,unknown>|null;if(!row||typeof row!=='object')throw new Error('MEDIA_AI_INVALID_OUTPUT');
    const classification=classifications.has(String(row.classification))?String(row.classification) as ProductMediaAnalysis['classification']:'unknown';
    return {classification,hasTextOverlay:bool(row.hasTextOverlay),hasDetectedBranding:bool(row.hasDetectedBranding),hasQrCode:bool(row.hasQrCode),hasWatermark:bool(row.hasWatermark),possibleConflictingCommercialText:bool(row.possibleConflictingCommercialText),productMatchConfidence:score(row.productMatchConfidence),productVisible:bool(row.productVisible),sharpnessScore:score(row.sharpnessScore)};
  }
  quality(analysis: ProductMediaAnalysis, width: number, height: number): number {
    const resolution = Math.min(1, Math.sqrt(width * height) / 1200);
    let value = 35 * resolution + 25 * analysis.productMatchConfidence + 15 * analysis.sharpnessScore + (analysis.productVisible ? 15 : 0);
    if (analysis.classification === 'clean_product_photo' || analysis.classification === 'marketplace_product_image') value += 10;
    if (analysis.hasTextOverlay) value -= 15; if (analysis.hasDetectedBranding) value -= 20;
    if (analysis.hasWatermark) value -= 25; if (analysis.hasQrCode) value -= 35;
    if (analysis.possibleConflictingCommercialText) value -= 20;
    return Math.max(0, Math.min(100, Math.round(value)));
  }
  needsReview(analysis: ProductMediaAnalysis): boolean {
    return analysis.productMatchConfidence < 0.65 || analysis.hasQrCode || analysis.hasWatermark || analysis.hasDetectedBranding || analysis.possibleConflictingCommercialText || ['promotional_creative','screenshot','unknown'].includes(analysis.classification);
  }
}
