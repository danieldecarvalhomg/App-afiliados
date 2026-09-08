import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptAffiliateCredentials, encryptAffiliateCredentials } from '../affiliate/AffiliateCredentialsCrypto';
import type { AffiliateAccountWithCredentials } from '../../domain/affiliate/AffiliateRepository';
import { calculateDiscount } from '../../domain/monitoring/promotionValidation';
import { DealScoreService } from '../../domain/marketplaces/discovery/DealScoreService';
import type { MarketplaceRadarRepository, RefreshLock } from '../../domain/marketplaces/discovery/MarketplaceRadarRepository';
import type { MarketplaceDeal, RadarFilters, RadarPage } from '../../domain/marketplaces/discovery/types';
import { mapProduct } from '../affiliate/SupabaseAffiliateRepository';
import type { ProductRecord } from '../../domain/products/types';
import type { ConfigurableAffiliatePlatform } from '../../domain/affiliate/types';
import type { AffiliateProviderCredentials } from '../../domain/affiliate/types';

type Row = Record<string, any>;
const asNumber = (value: unknown) => value == null ? null : Number(value);
function deal(row: Row): MarketplaceDeal { return { id: row.id, userId: row.user_id, affiliateAccountId: row.affiliate_account_id, marketplace: row.marketplace,
  externalProductId: row.external_product_id, externalShopId: row.external_shop_id, title: row.title, imageUrl: row.image_url, imageUrls: Array.isArray(row.image_urls) ? row.image_urls : [], productUrl: row.product_url,
  price: asNumber(row.price), originalPrice: asNumber(row.original_price), estimatedOriginalPrice: asNumber(row.estimated_original_price), discountPercent: asNumber(row.discount_percent), currency: row.currency,
  commissionRate: asNumber(row.commission_rate), commissionAmount: asNumber(row.commission_amount), salesCount: asNumber(row.sales_count), rating: asNumber(row.rating), reviewsCount: asNumber(row.reviews_count), coupon: row.coupon, freeShipping: row.free_shipping, category: row.category,
  dealScore: row.deal_score, dealScoreVersion: row.deal_score_version, scoreReasons: row.score_reasons ?? [], firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, lastUpdatedAt: row.last_updated_at, status: row.status, discoveredAt: row.last_seen_at }; }
export class SupabaseMarketplaceRadarRepository implements MarketplaceRadarRepository {
  private readonly scores = new DealScoreService();
  constructor(private readonly db: SupabaseClient) {}
  async getAccount(userId: string, marketplace: ConfigurableAffiliatePlatform): Promise<AffiliateAccountWithCredentials | null> {
    if (marketplace === 'mercado_livre') {
      const { data, error } = await this.db.from('affiliate_accounts').select('id,encrypted_credentials').eq('user_id',userId).eq('platform','mercado_livre').eq('status','configured').eq('validation_status','valid').maybeSingle();
      if (error) throw error;
      if (!data?.encrypted_credentials) return null;
      const credentials = decryptAffiliateCredentials(data.encrypted_credentials);
      return credentials.accessToken ? { id:data.id, credentials } : null;
    }
    const { data, error } = await this.db.from('affiliate_accounts').select('id,encrypted_credentials').eq('user_id', userId).eq('platform',marketplace).eq('status','configured').eq('validation_status','valid').maybeSingle();
    if (error) throw error; return data?.encrypted_credentials ? { id: data.id, credentials: decryptAffiliateCredentials(data.encrypted_credentials) } : null;
  }
  async getValidationStatus(userId: string, marketplace: ConfigurableAffiliatePlatform) {
    if (marketplace === 'mercado_livre') {
      const { data, error } = await this.db.from('affiliate_accounts').select('validation_status,encrypted_credentials').eq('user_id',userId).eq('platform','mercado_livre').maybeSingle();
      if (error) throw error;
      if (!data?.encrypted_credentials) return 'not_configured';
      return (data.validation_status ?? 'pending_validation') as 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error';
    }
    const { data, error } = await this.db.from('affiliate_accounts').select('validation_status').eq('user_id',userId).eq('platform',marketplace).maybeSingle();
    if (error) throw error; return (data?.validation_status ?? 'not_configured') as 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error';
  }
  async updateCredentials(userId: string, marketplace: ConfigurableAffiliatePlatform, credentials: AffiliateProviderCredentials): Promise<void> {
    const { error } = await this.db.from('affiliate_accounts').update({
      encrypted_credentials: encryptAffiliateCredentials(credentials), updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('platform', marketplace);
    if (error) throw error;
  }
  async acquireRefresh(userId: string, marketplace: ConfigurableAffiliatePlatform, trigger: 'manual' | 'scheduler'): Promise<RefreshLock> {
    const intervalSeconds = Math.max(30, Number(process.env.MARKETPLACE_RADAR_INTERVAL_SECONDS ?? 86_400));
    const cooldownSeconds = Math.max(10, Number(process.env.MARKETPLACE_RADAR_MANUAL_COOLDOWN_SECONDS ?? 15));
    const { data, error } = await this.db.rpc('acquire_marketplace_discovery_run', { p_user_id: userId, p_marketplace: marketplace, p_trigger: trigger, p_cooldown_seconds: cooldownSeconds, p_interval_seconds: intervalSeconds });
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data; return { acquired: Boolean(row?.acquired), errorCode: row?.error_code ?? null };
  }
  async finishRefresh(userId: string, marketplace: ConfigurableAffiliatePlatform, outcome: { errorCode?: string; errorMessage?: string; metrics: Record<string, number> }): Promise<void> {
    const status = outcome.errorCode ? 'failed' : 'completed'; const { error } = await this.db.from('marketplace_discovery_runs').update({ status, completed_at: new Date().toISOString(), last_error_code: outcome.errorCode ?? null, last_error_message: outcome.errorMessage ?? null, metrics: outcome.metrics, updated_at: new Date().toISOString() }).eq('user_id',userId).eq('marketplace',marketplace); if (error) throw error;
  }
  async listDueAccounts(): Promise<Array<{ userId: string; marketplace: ConfigurableAffiliatePlatform }>> {
    const { data, error } = await this.db.from('affiliate_accounts').select('user_id,platform,encrypted_credentials').in('platform',['shopee','amazon','mercado_livre']).eq('status','configured').eq('validation_status','valid');
    if (error) throw error;
    return (data ?? []).filter((row:Row)=>row.encrypted_credentials!==null).map((row: Row) => ({ userId: row.user_id, marketplace: row.platform as ConfigurableAffiliatePlatform }));
  }
  async upsertDeals(userId: string, accountId: string, deals: MarketplaceDeal[]): Promise<{ inserted: number; updated: number; unchanged: number }> {
    if (!deals.length) return { inserted: 0, updated: 0, unchanged: 0 };
    const externalIds = [...new Set(deals.map((item) => item.externalProductId))];
    const marketplaces = [...new Set(deals.map((item) => item.marketplace))];
    const { data: existingRows, error: lookupError } = await this.db.from('marketplace_deals').select('*')
      .eq('user_id', userId).in('marketplace', marketplaces).in('external_product_id', externalIds);
    if (lookupError) throw lookupError;
    const existing = new Map((existingRows ?? []).map((row: Row) => [`${row.marketplace}:${row.external_product_id}`, row]));
    const comparableKeys = ['external_shop_id','title','image_url','image_urls','product_url','price','original_price','estimated_original_price','discount_percent','currency','commission_rate','commission_amount','sales_count','rating','reviews_count','coupon','free_shipping','category','deal_score','deal_score_version','score_reasons','status'];
    const comparable = (value: unknown) => value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
    const now = new Date().toISOString();
    let inserted = 0, updated = 0, unchanged = 0;
    const rows: Row[] = [];
    const snapshots: Row[] = [];
    for (const input of deals) {
      const previous = existing.get(`${input.marketplace}:${input.externalProductId}`);
      const scored = this.scores.score(input);
      const patch: Row = { user_id:userId, affiliate_account_id:accountId, marketplace:input.marketplace, external_product_id:input.externalProductId, external_shop_id:input.externalShopId ?? null, title:input.title, image_url:input.imageUrl ?? null, image_urls:input.imageUrls ?? [], product_url:input.productUrl, price:input.price ?? null, original_price:input.originalPrice ?? null, estimated_original_price:input.estimatedOriginalPrice ?? null, discount_percent:input.discountPercent ?? null, currency:input.currency ?? 'BRL', commission_rate:input.commissionRate ?? null, commission_amount:input.commissionAmount ?? null, sales_count:input.salesCount ?? null, rating:input.rating ?? null, reviews_count:input.reviewsCount ?? null, coupon:input.coupon ?? null, free_shipping:input.freeShipping ?? null, category:input.category ?? null, deal_score:scored.score, deal_score_version:scored.version, score_reasons:scored.reasons, last_seen_at:now, status:'active', missing_cycles:0, updated_at:now };
      if (!previous) {
        inserted += 1;
        rows.push({ ...patch, first_seen_at: now, last_updated_at: now });
        continue;
      }
      const changed = comparableKeys.some((key) => comparable(previous[key]) !== comparable(patch[key]));
      patch.first_seen_at = previous.first_seen_at;
      patch.last_updated_at = changed ? now : previous.last_updated_at;
      rows.push(patch);
      if (changed) {
        updated += 1;
        snapshots.push({ deal_id:previous.id, user_id:userId, price:patch.price, original_price:patch.original_price, discount_percent:patch.discount_percent, commission_rate:patch.commission_rate, commission_amount:patch.commission_amount, status:'active' });
      } else unchanged += 1;
    }
    const { error: upsertError } = await this.db.from('marketplace_deals').upsert(rows, { onConflict: 'user_id,marketplace,external_product_id' });
    if (upsertError) throw upsertError;
    if (snapshots.length) {
      const { error: snapshotError } = await this.db.from('marketplace_deal_snapshots').insert(snapshots);
      if (snapshotError) throw snapshotError;
    }
    return { inserted, updated, unchanged };
  }
  async markMissingDeals(userId: string, marketplace: ConfigurableAffiliatePlatform, seen: string[]): Promise<number> {
    const {data,error}=await this.db.rpc('mark_missing_marketplace_deals',{p_user_id:userId,p_marketplace:marketplace,p_seen:seen});
    if(error)throw error;return Number(data??0);
  }
  async listDeals(userId: string, filters: RadarFilters): Promise<RadarPage> {
    const limit = Math.min(40,Math.max(1,filters.limit ?? 24)); const offset = /^\d+$/.test(filters.cursor ?? '') ? Number(filters.cursor) : 0;
    let query = this.db.from('marketplace_deals').select('*').eq('user_id',userId).eq('status','active').range(offset,offset+limit);
    if (filters.marketplace) query=query.eq('marketplace',filters.marketplace); if (filters.category) query=query.eq('category',filters.category); if (filters.minPrice != null) query=query.gte('price',filters.minPrice); if (filters.maxPrice != null) query=query.lte('price',filters.maxPrice); if (filters.minDiscount != null) query=query.gte('discount_percent',filters.minDiscount); if (filters.minCommission != null) query=query.gte('commission_rate',filters.minCommission); if (filters.freeShipping) query=query.eq('free_shipping',true); if (filters.coupon) query=query.not('coupon','is',null);
    const sortMap: Record<string,[string,boolean]>={score:['deal_score',false],discount:['discount_percent',false],commission:['commission_rate',false],sales:['sales_count',false],price:['price',true],recent:['last_seen_at',false]}; const [column,ascending]=sortMap[filters.sort ?? 'score']; query=query.order(column,{ascending}).order('id',{ascending});
    const { data,error }=await query; if(error) throw error; const rows=data??[]; const page=rows.slice(0,limit).map(deal); return { items:page,nextCursor:rows.length>limit ? String(offset+limit):null };
  }
  async getDeal(userId:string,id:string):Promise<MarketplaceDeal|null>{const {data,error}=await this.db.from('marketplace_deals').select('*').eq('id',id).eq('user_id',userId).maybeSingle();if(error)throw error;return data?deal(data):null;}
  async prepareProduct(userId:string,input:MarketplaceDeal):Promise<{product:ProductRecord;created:boolean}>{if(!input.id)throw new Error('RADAR_DEAL_ID_REQUIRED');const dealId=input.id;const {data:existing,error:findError}=await this.db.from('products').select('*').eq('user_id',userId).eq('source_type','marketplace_radar').eq('source_reference_id',dealId).maybeSingle();if(findError)throw findError;if(existing)return{product:mapProduct(existing),created:false};const {data,error}=await this.db.from('products').insert({user_id:userId,source_type:'marketplace_radar',source_reference_id:dealId,title:input.title,category:input.category ?? 'Geral',image:input.imageUrl ?? null,price:input.price ?? null,original_price:input.originalPrice ?? null,discount_percent:input.discountPercent ?? calculateDiscount(input.originalPrice ?? null,input.price ?? null),currency:input.currency ?? 'BRL',coupon_code:input.coupon ?? null,free_shipping:input.freeShipping ?? null,marketplace:input.marketplace,source_url:input.productUrl,raw_url:input.productUrl,affiliate_url:null,affiliate_status:'pending',status:'pausado',rating:input.rating ?? 0,reviews_count:input.reviewsCount ?? 0,hot_score:input.dealScore ?? 0}).select('*').single();if(error){if(error.code==='23505'){const {data:again}=await this.db.from('products').select('*').eq('user_id',userId).eq('source_type','marketplace_radar').eq('source_reference_id',dealId).single();return{product:mapProduct(again),created:false};}throw error;}return{product:mapProduct(data),created:true};}
  async createConversion(userId:string,sourceReferenceId:string,originalUrl:string):Promise<void>{const {data:existing,error:existingError}=await this.db.from('affiliate_conversions').select('id').eq('user_id',userId).eq('source_type','marketplace_radar').eq('source_reference_id',sourceReferenceId).eq('original_url',originalUrl).maybeSingle();if(existingError)throw existingError;let id=existing?.id;if(!id){const {data,error}=await this.db.from('affiliate_conversions').insert({user_id:userId,source_type:'marketplace_radar',source_reference_id:sourceReferenceId,original_url:originalUrl,status:'pending'}).select('id').single();if(error)throw error;id=data.id;}const {error}=await this.db.from('products').update({affiliate_conversion_id:id,affiliate_status:'pending'}).eq('id',sourceReferenceId).eq('user_id',userId);if(error)throw error;}
  async recordEvent(userId:string,eventType:string,payload:Record<string,unknown>):Promise<void>{const {error}=await this.db.from('system_events').insert({user_id:userId,event_type:eventType,payload});if(error)throw error;}
}
