import type { SupabaseClient } from '@supabase/supabase-js';
import type { AffiliateRepository, ConversionCompletion } from '../../domain/affiliate/AffiliateRepository';
import type { AffiliateAccountSummary, AffiliateConversion, AffiliateConversionStatus, AffiliatePlatform, AffiliateProviderCredentials, ConfigurableAffiliatePlatform, ProductSourceType } from '../../domain/affiliate/types';
import type { ManualProductInput, ProductRecord } from '../../domain/products/types';
import { calculateDiscount, extractExplicitCouponDescription } from '../../domain/monitoring/promotionValidation';
import { selectPrimaryProductLink } from '../../domain/affiliate/PrimaryProductLinkSelector';
import { decryptAffiliateCredentials } from './AffiliateCredentialsCrypto';
import { MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION } from './mercado-livre/companion/types';

type Row = Record<string, any>;
export function selectPromotionLinks(analysis: Row, links: string[]) {
  const normalized = analysis.normalized_result && typeof analysis.normalized_result === 'object'
    ? analysis.normalized_result as Row : {};
  const primaryProductLink = typeof normalized.primaryProductLink === 'string'
    && links.includes(normalized.primaryProductLink)
    ? normalized.primaryProductLink : null;
  const couponLink = Array.isArray(normalized.couponLinks)
    ? normalized.couponLinks.find((link: unknown): link is string =>
      typeof link === 'string' && links.includes(link) && link !== primaryProductLink) ?? null
    : null;
  return { primaryProductLink, couponLink };
}
export function publishableCouponUrl(status: AffiliateConversionStatus | undefined, convertedUrl: unknown): string | null {
  return status === 'converted' && typeof convertedUrl === 'string' && /^https?:\/\//i.test(convertedUrl)
    ? convertedUrl
    : null;
}
async function getPromotionCouponState(db: SupabaseClient, userId: string, sourceReferenceId: string): Promise<{
  sourceUrl: string | null;
  code: string | null;
  description: string | null;
}> {
  const { data, error } = await db.from('promotion_analyses')
    .select('normalized_result,source_links,coupon_code,coupon_description,captured_message_id')
    .eq('id', sourceReferenceId).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return { sourceUrl: null, code: null, description: null };
  const links = Array.isArray(data.source_links)
    ? data.source_links.filter((link: unknown): link is string => typeof link === 'string')
    : [];
  let description = typeof data.coupon_description === 'string' ? data.coupon_description : null;
  if (!data.coupon_code && !description && data.captured_message_id) {
    const { data: capture, error: captureError } = await db.from('captured_messages')
      .select('raw_content').eq('id', data.captured_message_id).eq('user_id', userId).maybeSingle();
    if (captureError) throw captureError;
    if (typeof capture?.raw_content === 'string') description = extractExplicitCouponDescription(capture.raw_content);
  }
  return {
    sourceUrl: selectPromotionLinks(data, links).couponLink,
    code: typeof data.coupon_code === 'string' ? data.coupon_code : null,
    description,
  };
}
export async function getCouponSourceUrl(db: SupabaseClient, userId: string, sourceReferenceId: string): Promise<string | null> {
  return (await getPromotionCouponState(db, userId, sourceReferenceId)).sourceUrl;
}
export async function reconcileProductCouponUrl(db: SupabaseClient, userId: string, row: Row, knownSourceUrl?: string | null): Promise<Row> {
  if (row.source_type !== 'whatsapp' || !row.source_reference_id) return row;
  const promotion = await getPromotionCouponState(db, userId, row.source_reference_id);
  const sourceUrl = knownSourceUrl === undefined
    ? promotion.sourceUrl
    : knownSourceUrl;
  let conversionRow: Row | null = null;
  if (sourceUrl) {
    const conversion = await db.from('affiliate_conversions')
      .select('status,converted_url')
      .eq('user_id', userId).eq('source_type', 'whatsapp')
      .eq('source_reference_id', row.source_reference_id)
      .eq('original_url', sourceUrl).maybeSingle();
    if (conversion.error) throw conversion.error;
    conversionRow = conversion.data;
  }
  const desired = publishableCouponUrl(conversionRow?.status, conversionRow?.converted_url);
  if (
    (row.coupon_url ?? null) === desired &&
    (row.coupon_code ?? null) === promotion.code &&
    (row.coupon_description ?? null) === promotion.description
  ) return row;
  const { data: updated, error: updateError } = await db.from('products')
    .update({
      coupon_url: desired,
      coupon_code: promotion.code,
      coupon_description: promotion.description,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id).eq('user_id', userId).select('*').single();
  if (updateError) throw updateError;
  return updated;
}
function conversion(row: Row): AffiliateConversion {
  return { id: row.id, userId: row.user_id, sourceType: row.source_type, sourceReferenceId: row.source_reference_id,
    affiliateAccountId: row.affiliate_account_id, originalUrl: row.original_url, resolvedUrl: row.resolved_url,
    detectedPlatform: row.detected_platform, convertedUrl: row.converted_url, status: row.status,
    errorCode: row.error_code, provider: row.provider, workerId: row.processing_worker_id,
    attemptCount: Number(row.attempt_count ?? 0) };
}
export function mapProduct(row: Row): ProductRecord {
  return { id: row.id, userId: row.user_id, sourceType: row.source_type, sourceReferenceId: row.source_reference_id,
    title: row.title, category: row.category ?? null, imageUrl: row.image ?? null,
    price: row.price == null ? null : Number(row.price), originalPrice: row.original_price == null ? null : Number(row.original_price),
    discountPercent: row.discount_percent == null ? null : Number(row.discount_percent), currency: row.currency ?? null,
    couponCode: row.coupon_code ?? null, couponDescription: row.coupon_description ?? null, couponLink: row.coupon_url ?? null,
    freeShipping: row.free_shipping ?? null, marketplace: row.marketplace ?? 'unknown', sourceUrl: row.source_url ?? null,
    affiliateUrl: row.affiliate_url ?? null, affiliateStatus: row.affiliate_status ?? 'pending_url',
    affiliateConversionId: row.affiliate_conversion_id ?? null, observations: row.observations ?? null,
    mediaStatus: row.media_status ?? (row.image ? 'available' : 'unavailable'), primaryMediaAssetId: row.primary_media_asset_id ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
export class SupabaseAffiliateRepository implements AffiliateRepository {
  constructor(private readonly db: SupabaseClient) {}
  async listAccountSummaries(userId: string): Promise<AffiliateAccountSummary[]> {
    const [{ data, error }, { data: companions, error: companionError }] = await Promise.all([
      this.db.from('affiliate_accounts').select('id,platform,status,provider,last_error_code,encrypted_credentials,validation_status,validation_error_code,updated_at').eq('user_id', userId),
      this.db.from('browser_companion_instances').select('id,name,status,extension_version,adapter_version,mercado_livre_status,last_seen_at,last_success_at,last_error_code,token_expires_at,revoked_at')
        .eq('user_id',userId).is('revoked_at',null).gt('token_expires_at',new Date().toISOString()).order('last_seen_at',{ascending:false,nullsFirst:false}),
    ]);
    if (error) throw error;
    if (companionError && companionError.code !== '42P01') throw companionError;
    const companionRows = (companions ?? []) as Row[];
    const mlCompanion = companionRows.find((item) => item.status === 'ONLINE' && Number(item.adapter_version) >= MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? companionRows.find((item) => item.status !== 'OUTDATED' && Number(item.adapter_version) >= MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? companionRows[0];
    return (data ?? []).map((row: Row) => {
      if (row.platform === 'mercado_livre') {
        let credentials: AffiliateProviderCredentials | null = null;
        try { credentials = row.encrypted_credentials ? decryptAffiliateCredentials(row.encrypted_credentials) : null; }
        catch { credentials = null; }
        const sessionConfigured = Boolean(credentials?.sessionCookie && credentials?.trackingTag && row.validation_status === 'valid');
        // O Companion serve apenas para a primeira sincronização da sessão.
        // Ele não configura uma conta de conversão por si só.
        const configured = sessionConfigured;
        const catalogApiConfigured = Boolean(credentials?.appId && credentials?.secret && credentials?.accessToken);
        const provider = 'mercado_livre_unofficial_v1';
        const configurationStatus = sessionConfigured ? 'valid'
          : row.validation_status === 'invalid' ? 'invalid'
            : row.validation_status === 'error' ? 'error' : 'pending_validation';
        return { id:row.id,platform:row.platform,configured,configurationStatus,provider,lastErrorCode:row.validation_error_code??row.last_error_code??null,
          sessionConfigured, catalogApiConfigured, catalogApiStatus: catalogApiConfigured ? row.validation_status ?? 'pending_validation' : 'not_configured',
          browserCompanion:mlCompanion?{instanceId:mlCompanion.id,name:mlCompanion.name,status:mlCompanion.status,extensionVersion:mlCompanion.extension_version,mercadoLivreStatus:mlCompanion.mercado_livre_status,lastSeenAt:mlCompanion.last_seen_at,lastSuccessAt:mlCompanion.last_success_at,adapterVersion:Number(mlCompanion.adapter_version??1)}:undefined };
      }
      const configurationStatus = row.validation_status ?? (row.status === 'error' ? 'error' : row.status === 'configured' && row.encrypted_credentials ? 'pending_validation' : 'not_configured'); const configured = configurationStatus === 'valid'; return ({ id: row.id, platform: row.platform, configured,
        configurationStatus, provider: row.provider, lastErrorCode: row.validation_error_code ?? row.last_error_code ?? null });
    });
  }
  async upsertAccount(userId: string, platform: ConfigurableAffiliatePlatform, provider: string, encryptedCredentials: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('affiliate_accounts').upsert({ user_id: userId, platform, status: 'configured', validation_status: 'pending_validation', validated_at: null, validation_error_code: null,
      provider, encrypted_credentials: encryptedCredentials, last_error_code: null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,platform' }); if (error) throw error;
  }
  async setValidationStatus(userId: string, platform: ConfigurableAffiliatePlatform, status: 'valid' | 'invalid' | 'error', errorCode?: string): Promise<void> {
    const { error } = await this.db.from('affiliate_accounts').update({ validation_status: status, validation_error_code: errorCode ?? null, validated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('user_id', userId).eq('platform',platform); if (error) throw error;
  }
  async getAccountCredentials(userId: string, platform: ConfigurableAffiliatePlatform): Promise<AffiliateProviderCredentials | null> {
    const { data, error } = await this.db.from('affiliate_accounts').select('encrypted_credentials')
      .eq('user_id', userId).eq('platform', platform).maybeSingle();
    if (error) throw error;
    if (!data?.encrypted_credentials) return null;
    return decryptAffiliateCredentials(data.encrypted_credentials);
  }
  async getConfiguredAccount(userId: string, platform: AffiliatePlatform) {
    if (!['shopee','amazon','mercado_livre'].includes(platform)) return null;
    if (platform === 'mercado_livre') {
      const {data:account,error}=await this.db.from('affiliate_accounts').select('id,encrypted_credentials').eq('user_id',userId).eq('platform','mercado_livre').eq('status','configured').eq('validation_status','valid').maybeSingle();
      if(error)throw error;
      if (!account) return null;
      if (account.encrypted_credentials) {
        const credentials = decryptAffiliateCredentials(account.encrypted_credentials);
        if (credentials.sessionCookie && credentials.trackingTag) return { id:account.id, credentials };
      }
      return null;
    }
    const { data, error } = await this.db.from('affiliate_accounts').select('id,encrypted_credentials,status')
      .eq('user_id', userId).eq('platform', platform).eq('status', 'configured').eq('validation_status','valid').maybeSingle();
    if (error) throw error; if (!data?.encrypted_credentials) return null;
    return { id: data.id, credentials: decryptAffiliateCredentials(data.encrypted_credentials) };
  }
  async getDeclaredMarketplace(item: AffiliateConversion): Promise<AffiliatePlatform | 'unknown' | null> {
    let query = this.db.from('products').select('marketplace').eq('user_id', item.userId);
    query = item.sourceType === 'manual' ? query.eq('id', item.sourceReferenceId)
      : query.eq('source_type', item.sourceType).eq('source_reference_id', item.sourceReferenceId);
    const { data, error } = await query.maybeSingle(); if (error) throw error;
    return data?.marketplace ?? null;
  }
  async claimNext(workerId: string, staleBefore: string): Promise<AffiliateConversion | null> {
    const { data, error } = await this.db.rpc('claim_next_affiliate_conversion', { p_worker_id: workerId, p_stale_before: staleBefore });
    if (error) throw error; const row = Array.isArray(data) ? data[0] : data; return row ? conversion(row) : null;
  }
  async updateClaim(input: ConversionCompletion): Promise<boolean> {
    const terminal = !['resolving','resolved','converting'].includes(input.status);
    const patch: Row = { status: input.status, updated_at: new Date().toISOString() };
    if ('resolvedUrl' in input) patch.resolved_url = input.resolvedUrl;
    if ('detectedPlatform' in input) patch.detected_platform = input.detectedPlatform;
    if ('convertedUrl' in input) patch.converted_url = input.convertedUrl;
    if ('affiliateAccountId' in input) patch.affiliate_account_id = input.affiliateAccountId;
    if ('provider' in input) patch.provider = input.provider;
    if ('errorCode' in input) patch.error_code = input.errorCode;
    if ('resolvedAt' in input) patch.resolved_at = input.resolvedAt;
    if ('convertedAt' in input) patch.converted_at = input.convertedAt;
    if (terminal) { patch.processing_started_at = null; patch.processing_worker_id = null; }
    const { data, error } = await this.db.from('affiliate_conversions').update(patch).eq('id', input.conversion.id)
      .eq('user_id', input.conversion.userId).eq('processing_worker_id', input.conversion.workerId).select('id').maybeSingle();
    if (error) throw error; if (!data) return false;
    await this.updateProductAffiliate(input.conversion, input.status, input.convertedUrl ?? null, data.id);
    return true;
  }
  async scheduleRetry(item: AffiliateConversion, errorCode: string, retryAt: string): Promise<void> {
    const { error } = await this.db.from('affiliate_conversions').update({ status: 'pending', converted_url: null,
      error_code: errorCode, next_attempt_at: retryAt, processing_started_at: null, processing_worker_id: null, updated_at: new Date().toISOString() })
      .eq('id', item.id).eq('user_id', item.userId).eq('processing_worker_id', item.workerId); if (error) throw error;
    await this.updateProductAffiliate(item, 'pending', null, item.id);
  }
  async resetConversion(userId: string, conversionId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('reset_affiliate_conversion', { p_user_id: userId, p_conversion_id: conversionId });
    if (error) throw error;
    if (data === true) return true;
    // Compatibilidade imediata com bancos que ainda não receberam a migration
    // que incluiu awaiting_companion na função SQL.
    const now = new Date().toISOString();
    const { data: reset, error: resetError } = await this.db.from('affiliate_conversions').update({
      status: 'pending', resolved_url: null, detected_platform: null, converted_url: null,
      error_code: null, processing_started_at: null, processing_worker_id: null,
      attempt_count: 0, next_attempt_at: new Date(0).toISOString(), resolved_at: null, converted_at: null, updated_at: now,
    }).eq('id', conversionId).eq('user_id', userId).eq('status', 'awaiting_companion').select('id').maybeSingle();
    if (resetError) throw resetError;
    if (!reset) return false;
    const { error: productError } = await this.db.from('products').update({ affiliate_status: 'pending', affiliate_url: null, updated_at: now })
      .eq('user_id', userId).eq('affiliate_conversion_id', conversionId);
    if (productError) throw productError;
    return true;
  }
  async getProduct(userId: string, productId: string): Promise<ProductRecord | null> {
    const { data, error } = await this.db.from('products').select('*').eq('id', productId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data || await this.isProductDeleted(userId, productId)) return null;
    return mapProduct(await reconcileProductCouponUrl(this.db, userId, data));
  }
  async completeManualConversion(userId: string, productId: string, convertedUrl: string, detectedPlatform: AffiliatePlatform): Promise<ProductRecord | null> {
    const { data: product, error: productError } = await this.db.from('products').select('*')
      .eq('id', productId).eq('user_id', userId).maybeSingle();
    if (productError) throw productError;
    if (!product || await this.isProductDeleted(userId, productId)) return null;

    let conversionId = product.affiliate_conversion_id as string | null;
    if (!conversionId && product.source_url) {
      const { data: conversion, error: conversionLookupError } = await this.db.from('affiliate_conversions')
        .select('id').eq('user_id', userId).eq('source_type', product.source_type)
        .eq('source_reference_id', product.source_reference_id ?? productId)
        .eq('original_url', product.source_url).maybeSingle();
      if (conversionLookupError) throw conversionLookupError;
      conversionId = conversion?.id ?? null;
    }
    if (!conversionId) return null;
    const now = new Date().toISOString();
    const { error: conversionError } = await this.db.from('affiliate_conversions').update({
      status: 'converted', converted_url: convertedUrl, resolved_url: product.source_url,
      detected_platform: detectedPlatform, provider: 'manual_mobile', error_code: null,
      resolved_at: now, converted_at: now, processing_started_at: null,
      processing_worker_id: null, updated_at: now,
    }).eq('id', conversionId).eq('user_id', userId);
    if (conversionError) throw conversionError;
    const { data: updated, error: updateError } = await this.db.from('products').update({
      affiliate_status: 'converted', affiliate_url: convertedUrl,
      affiliate_conversion_id: conversionId, updated_at: now,
    }).eq('id', productId).eq('user_id', userId).select('*').single();
    if (updateError) throw updateError;
    return mapProduct(updated);
  }
  async listProducts(userId: string, sourceType?: ProductSourceType): Promise<ProductRecord[]> {
    let query = this.db.from('products').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (sourceType) query = query.eq('source_type', sourceType);
    const { data, error } = await query; if (error) throw error;
    const deletedIds = await this.deletedProductIds(userId);
    const rows = (data ?? []).filter((row) => !deletedIds.has(row.id));
    if (!rows.some((row) => row.source_type === 'whatsapp') || !await this.reviewRequiredForUser(userId)) {
      return rows.map(mapProduct);
    }
    const analysisIds = rows.filter((row) => row.source_type === 'whatsapp').map((row) => row.source_reference_id).filter(Boolean);
    if (analysisIds.length === 0) return rows.filter((row) => row.source_type !== 'whatsapp').map(mapProduct);
    const { data: analyses, error: analysisError } = await this.db.from('promotion_analyses').select('id,captured_message_id')
      .eq('user_id', userId).in('id', analysisIds);
    if (analysisError) throw analysisError;
    const captureIds = (analyses ?? []).map((row) => row.captured_message_id).filter(Boolean);
    const { data: captures, error: captureError } = captureIds.length
      ? await this.db.from('captured_messages').select('id,review_status').eq('user_id', userId).in('id', captureIds)
      : { data: [], error: null };
    if (captureError) throw captureError;
    const approvedCaptureIds = new Set((captures ?? []).filter((row) => row.review_status === 'approved').map((row) => row.id));
    const approvedAnalysisIds = new Set((analyses ?? []).filter((row) => approvedCaptureIds.has(row.captured_message_id)).map((row) => row.id));
    return rows.filter((row) => row.source_type !== 'whatsapp' || approvedAnalysisIds.has(row.source_reference_id)).map(mapProduct);
  }
  async deleteProduct(userId: string, productId: string): Promise<boolean> {
    const { data: owned, error: findError } = await this.db.from('products').select('id')
      .eq('id', productId).eq('user_id', userId).maybeSingle();
    if (findError) throw findError;
    if (!owned || await this.isProductDeleted(userId, productId)) return false;
    const { error: mediaError } = await this.db.from('product_media_assets').update({
      analysis_status: 'failed',
      processing_started_at: null,
      processing_worker_id: null,
      last_error_code: 'PRODUCT_DELETED',
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('product_id', productId).in('analysis_status', ['pending', 'analyzing']);
    if (mediaError) throw mediaError;
    await this.recordEvent(userId, 'product.deleted', { product_id: productId, deletion_mode: 'catalog_archive' });
    return true;
  }
  async createManualProduct(userId: string, input: ManualProductInput): Promise<ProductRecord> {
    const price = input.price ?? null, original = input.originalPrice ?? null;
    const { data, error } = await this.db.from('products').insert({ user_id: userId, source_type: 'manual', source_reference_id: null,
      title: input.title, category: input.category ?? 'Geral', image: input.imageUrl ?? null, price, original_price: original,
      discount_percent: calculateDiscount(original, price), currency: price != null || original != null ? 'BRL' : null,
      coupon_code: input.couponCode ?? null, coupon_description: input.couponDescription ?? null, coupon_url: input.couponLink ?? null, free_shipping: input.freeShipping ?? null,
      marketplace: input.marketplace ?? 'unknown', source_url: input.sourceUrl ?? null, raw_url: input.sourceUrl ?? null,
      affiliate_url: null, affiliate_status: input.sourceUrl ? 'pending' : 'pending_url', observations: input.observations ?? null,
      status: 'pausado', rating: 0, reviews_count: 0, hot_score: 0 }).select('*').single();
    if (error) throw error; return mapProduct(data);
  }
  async createWhatsAppProductForCapture(userId: string, captureId: string): Promise<ProductRecord | null> {
    const { data: analysis, error: analysisError } = await this.db.from('promotion_analyses').select('*')
      .eq('user_id', userId).eq('captured_message_id', captureId).maybeSingle();
    if (analysisError) throw analysisError;
    if (!analysis?.product_name) return null;
    const links = Array.isArray(analysis.source_links)
      ? analysis.source_links.filter((link: unknown): link is string => typeof link === 'string' && /^https?:\/\//i.test(link))
      : [];
    const { data: capture, error: captureError } = await this.db.from('captured_messages').select('raw_content,review_status')
      .eq('id', captureId).eq('user_id', userId).maybeSingle();
    if (captureError) throw captureError;
    if (!capture || !await this.captureCanCreateProduct(userId, capture.review_status)) return null;
    const { data: existing, error: existingError } = await this.db.from('products').select('*')
      .eq('user_id', userId).eq('source_type', 'whatsapp').eq('source_reference_id', analysis.id).maybeSingle();
    if (existingError) throw existingError;
    if (existing && await this.isProductDeleted(userId, existing.id)) return null;
    let product = existing;
    const { primaryProductLink: aiPrimaryLink, couponLink } = selectPromotionLinks(analysis, links);
    const primaryLink = aiPrimaryLink ?? selectPrimaryProductLink(links, capture?.raw_content ?? null);
    if (!product) {
      const { data, error } = await this.db.from('products').insert({
        user_id: userId, source_type: 'whatsapp', source_reference_id: analysis.id,
        title: analysis.product_name, price: analysis.price, original_price: analysis.original_price,
        discount_percent: analysis.discount_percent, currency: analysis.currency,
        coupon_code: analysis.coupon_code, coupon_description: analysis.coupon_description,
        // O link bruto continua preservado na captura/análise. O Product só
        // publica o link do cupom depois que a conversão afiliada concluir.
        coupon_url: null,
        free_shipping: analysis.free_shipping, marketplace: analysis.marketplace,
        source_url: primaryLink, raw_url: primaryLink, affiliate_url: null,
        affiliate_status: primaryLink ? 'pending' : 'pending_url', status: 'pausado',
        rating: 0, reviews_count: 0, hot_score: 0,
      }).select('*').single();
      if (error) {
        if (error.code !== '23505') throw error;
        const { data: raced, error: racedError } = await this.db.from('products').select('*')
          .eq('user_id', userId).eq('source_type', 'whatsapp').eq('source_reference_id', analysis.id).single();
        if (racedError) throw racedError;
        product = raced;
      } else product = data;
    }
    for (const link of links) await this.createConversion(userId, 'whatsapp', analysis.id, link);
    if (product) product = await reconcileProductCouponUrl(this.db, userId, product, couponLink);
    return product ? mapProduct(product) : null;
  }
  async createConversion(userId: string, sourceType: ProductSourceType, sourceReferenceId: string, originalUrl: string): Promise<void> {
    const { data: existing } = await this.db.from('affiliate_conversions').select('id').eq('user_id', userId)
      .eq('source_type', sourceType).eq('source_reference_id', sourceReferenceId).eq('original_url', originalUrl).maybeSingle();
    let id = existing?.id;
    if (!id) {
      const { data, error } = await this.db.from('affiliate_conversions').insert({ user_id: userId, source_type: sourceType,
        source_reference_id: sourceReferenceId, original_url: originalUrl, converted_url: null, status: 'pending' }).select('id').single();
      if (error) throw error; id = data.id;
    }
    if (sourceType === 'manual' || sourceType === 'marketplace_radar') await this.db.from('products').update({ affiliate_conversion_id: id, affiliate_status: 'pending' })
      .eq('id', sourceReferenceId).eq('user_id', userId);
  }
  async seedWhatsAppProducts(): Promise<number> {
    const { data: analyses, error } = await this.db.from('promotion_analyses').select('*').eq('is_promotion', true);
    if (error) throw error; let created = 0;
    for (const row of analyses ?? []) {
      if (!row.product_name) continue;
      const { data: reviewedCapture, error: reviewError } = await this.db.from('captured_messages').select('review_status')
        .eq('id', row.captured_message_id).eq('user_id', row.user_id).maybeSingle();
      if (reviewError) throw reviewError;
      if (!reviewedCapture || !await this.captureCanCreateProduct(row.user_id, reviewedCapture.review_status)) continue;
      const { data: existing } = await this.db.from('products').select('id,source_url,coupon_url').eq('user_id', row.user_id)
        .eq('source_type', 'whatsapp').eq('source_reference_id', row.id).maybeSingle();
      if (existing && await this.isProductDeleted(row.user_id, existing.id)) continue;
      let product: Row | null = existing;
      const links = Array.isArray(row.source_links) ? row.source_links.filter((link: unknown) => typeof link === 'string') as string[] : [];
      const { data: capture, error: captureError } = await this.db.from('captured_messages').select('raw_content')
        .eq('id', row.captured_message_id).eq('user_id', row.user_id).maybeSingle();
      if (captureError) throw captureError;
      const { primaryProductLink: aiPrimaryLink, couponLink } = selectPromotionLinks(row, links);
      const primaryLink = aiPrimaryLink ?? selectPrimaryProductLink(links, capture?.raw_content ?? null);
      if (!product) {
        const { data, error: insertError } = await this.db.from('products').insert({ user_id: row.user_id, source_type: 'whatsapp',
          source_reference_id: row.id, title: row.product_name, price: row.price, original_price: row.original_price,
          discount_percent: row.discount_percent, currency: row.currency, coupon_code: row.coupon_code,
          coupon_description: row.coupon_description, coupon_url: null,
          free_shipping: row.free_shipping, marketplace: row.marketplace,
          source_url: primaryLink, raw_url: primaryLink, affiliate_url: null,
          affiliate_status: primaryLink ? 'pending' : 'pending_url', status: 'pausado', rating: 0, reviews_count: 0, hot_score: 0,
        }).select('id,source_url,coupon_url').single();
        if (insertError) { if (insertError.code !== '23505') throw insertError; continue; }
        product = data; created += 1;
      }
      for (const link of links) await this.createConversion(row.user_id, 'whatsapp', row.id, link);
      if (product) product = await reconcileProductCouponUrl(this.db, row.user_id, product, couponLink);
      if (product?.source_url) {
        const { data: primary } = await this.db.from('affiliate_conversions').select('id,status,converted_url')
          .eq('user_id', row.user_id).eq('source_type', 'whatsapp').eq('source_reference_id', row.id)
          .eq('original_url', product.source_url).maybeSingle();
        if (primary) await this.db.from('products').update({ affiliate_conversion_id: primary.id,
          affiliate_status: primary.status, affiliate_url: primary.status === 'converted' ? primary.converted_url : null }).eq('id', product.id);
      }
    }
    return created;
  }
  async recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('system_events').insert({ user_id: userId, event_type: eventType, payload }); if (error) throw error;
  }
  private async captureCanCreateProduct(userId: string, reviewStatus: unknown): Promise<boolean> {
    if (reviewStatus === 'approved') return true;
    return !await this.reviewRequiredForUser(userId);
  }
  private async deletedProductIds(userId: string): Promise<Set<string>> {
    const { data, error } = await this.db.from('system_events').select('payload')
      .eq('user_id', userId).eq('event_type', 'product.deleted');
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.payload?.product_id).filter((id): id is string => typeof id === 'string'));
  }
  private async isProductDeleted(userId: string, productId: string): Promise<boolean> {
    const { data, error } = await this.db.from('system_events').select('id')
      .eq('user_id', userId).eq('event_type', 'product.deleted').contains('payload', { product_id: productId })
      .limit(1).maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }
  private async reviewRequiredForUser(userId: string): Promise<boolean> {
    const { data: profile, error: profileError } = await this.db.from('profiles').select('settings').eq('id', userId).maybeSingle();
    if (!profileError) {
      const settings = profile?.settings && typeof profile.settings === 'object' ? profile.settings as Record<string, unknown> : {};
      return settings.monitoringReviewRequired !== false;
    }
    const missingSettings = profileError.code === '42703' || profileError.message?.includes('profiles.settings');
    if (!missingSettings) throw profileError;
    const { data: monitor, error: monitorError } = await this.db.from('group_monitors').select('review_required')
      .eq('user_id', userId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (monitorError) throw monitorError;
    // Sem uma preferência explícita, falha fechada e exige aprovação.
    return monitor?.review_required !== false;
  }
  private async updateProductAffiliate(item: AffiliateConversion, status: AffiliateConversionStatus, convertedUrl: string | null, conversionId: string) {
    const couponSourceUrl = item.sourceType === 'whatsapp' && item.sourceReferenceId
      ? await getCouponSourceUrl(this.db, item.userId, item.sourceReferenceId)
      : null;
    if (couponSourceUrl === item.originalUrl) {
      let couponQuery = this.db.from('products').update({
        coupon_url: publishableCouponUrl(status, convertedUrl),
        updated_at: new Date().toISOString(),
      }).eq('user_id', item.userId);
      couponQuery = couponQuery.eq('source_type', item.sourceType).eq('source_reference_id', item.sourceReferenceId);
      const { error } = await couponQuery;
      if (error) throw error;
      return;
    }
    let query = this.db.from('products').update({ affiliate_status: status, affiliate_url: status === 'converted' ? convertedUrl : null,
      affiliate_conversion_id: conversionId, updated_at: new Date().toISOString() }).eq('user_id', item.userId).eq('source_url', item.originalUrl);
    query = item.sourceType === 'manual' || item.sourceType === 'marketplace_radar'
      ? query.eq('id', item.sourceReferenceId)
      : query.eq('source_type', item.sourceType).eq('source_reference_id', item.sourceReferenceId);
    const { error } = await query; if (error) throw error;
  }

}
