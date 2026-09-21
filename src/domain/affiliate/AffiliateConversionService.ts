import { randomUUID } from 'node:crypto';
import type { AppResult } from '../errors';
import { fail, ok } from '../errors';
import type { AffiliateRepository } from './AffiliateRepository';
import type { AffiliateConversion, AffiliateConversionStatus } from './types';
import { resolvePlatform } from './PlatformResolver';
import type { AffiliateLinkService } from './AffiliateLinkService';
import { UrlResolutionError, type UrlResolverService } from '../../backend/affiliate/UrlResolverService';
import { isMercadoLivreConversionUrl, isMercadoLivreProductUrl } from '../../backend/affiliate/mercado-livre/AffiliateLinkValidator';
import { MercadoLivreLinkRecoveryService } from '../../backend/affiliate/mercado-livre/MercadoLivreLinkRecoveryService';
import { AdaptiveWorkerLoop } from '../workers/AdaptiveWorkerLoop';
import type { UsageQuotaService } from '../usage/UsageQuotaService';
import type { InternalAutomationPublisher } from '../automation/types';
import { shopeeTrackingSubId } from './ShopeeTracking';

const STALE_MS = 5 * 60_000; const BACKOFF_MS = [10_000, 60_000];
export class AffiliateConversionService {
  private readonly workerId = `affiliate-${randomUUID()}`; private draining = false;
  private readonly recovery: MercadoLivreLinkRecoveryService;
  constructor(private readonly repository: AffiliateRepository, private readonly resolver: UrlResolverService, private readonly links: AffiliateLinkService, recovery?: MercadoLivreLinkRecoveryService, private readonly quota?:UsageQuotaService, private readonly automations?:InternalAutomationPublisher) {
    this.recovery = recovery ?? new MercadoLivreLinkRecoveryService(resolver);
  }
  async drain(maxItems = 50): Promise<number> {
    if (this.draining) return 0; this.draining = true; let count = 0;
    try {
      await this.repository.seedWhatsAppProducts();
      while (count < maxItems) {
        const batch: AffiliateConversion[] = [];
        while (batch.length < Math.min(10, maxItems - count)) {
          const item = await this.repository.claimNext(this.workerId, new Date(Date.now() - STALE_MS).toISOString());
          if (!item) break;
          batch.push(item);
        }
        if (!batch.length) break;
        await Promise.allSettled(batch.map((item) => this.process(item)));
        count += batch.length;
      }
      return count;
    } finally { this.draining = false; }
  }
  kick(): void { void this.drain().catch((error) => console.error('[AfiliHub:Affiliate] Worker falhou.', error)); }
  async reprocess(userId: string, productId: string): Promise<AppResult<void>> {
    const product = await this.repository.getProduct(userId, productId);
    if (!product) return fail('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
    const regularRetry = ['resolution_failed', 'conversion_failed', 'affiliate_account_not_configured', 'awaiting_companion'].includes(product.affiliateStatus);
    const mercadoLivreRecovery = product.affiliateStatus === 'invalid_url'
      && (product.marketplace === 'mercado_livre' || resolvePlatform(product.sourceUrl ?? '') === 'mercado_livre');
    if (!regularRetry && !mercadoLivreRecovery)
      return fail('AFFILIATE_REPROCESS_NOT_ALLOWED', 'Este link não está elegível para nova tentativa.');
    const conversionId = await this.findConversionId(product);
    if (!conversionId || !await this.repository.resetConversion(userId, conversionId)) return fail('AFFILIATE_REPROCESS_CONFLICT', 'Conversão não encontrada ou já em processamento.');
    this.kick(); return ok(undefined);
  }
  private async findConversionId(product: { affiliateConversionId: string | null }): Promise<string | null> {
    return product.affiliateConversionId;
  }
  private async process(conversion: AffiliateConversion): Promise<void> {
    try {
      const originalIsMercadoLivreProduct = resolvePlatform(conversion.originalUrl) === 'mercado_livre'
        && isMercadoLivreProductUrl(conversion.originalUrl);
      const originalIsMercadoLivreShortLink = resolvePlatform(conversion.originalUrl) === 'mercado_livre'
        && isMercadoLivreConversionUrl(conversion.originalUrl)
        && !originalIsMercadoLivreProduct;
      // Links diretos do catálogo já contêm a identidade do produto. Resolvê-los
      // fora da sessão autenticada pode produzir /gz/account-verification e
      // substituir uma origem válida por uma página de login.
      let resolved = originalIsMercadoLivreProduct || originalIsMercadoLivreShortLink
        ? { originalUrl: conversion.originalUrl, resolvedUrl: conversion.originalUrl, resolvedAt: new Date().toISOString(), redirectCount: 0 }
        : await this.resolver.resolve(conversion.originalUrl);
      let platform = resolvePlatform(resolved.resolvedUrl);
      const unresolvedMercadoLivreShortLink = platform === 'mercado_livre'
        && !isMercadoLivreProductUrl(resolved.resolvedUrl)
        && originalIsMercadoLivreShortLink
        && resolved.resolvedUrl === conversion.originalUrl;
      if (platform === 'mercado_livre' && !isMercadoLivreProductUrl(resolved.resolvedUrl) && !unresolvedMercadoLivreShortLink) {
        const recovered = await this.recovery.recover(resolved.resolvedUrl, conversion.userId);
        if (recovered) {
          await this.safeEvent(conversion.userId, 'affiliate.link_recovered', {
            conversionId: conversion.id, originalUrl: conversion.originalUrl,
            profileUrl: resolved.resolvedUrl, productUrl: recovered.productUrl,
            candidateCount: recovered.candidates.length,
          });
          resolved = { ...resolved, resolvedUrl: recovered.productUrl };
          platform = 'mercado_livre';
        }
      }
      if (!await this.repository.updateClaim({ conversion, status: 'resolved', resolvedUrl: resolved.resolvedUrl,
        detectedPlatform: platform, resolvedAt: resolved.resolvedAt })) return;
      const declaredPlatform = await this.repository.getDeclaredMarketplace(conversion);
      if (declaredPlatform && declaredPlatform !== 'unknown' && declaredPlatform !== platform) {
        await this.safeEvent(conversion.userId, 'affiliate.platform_mismatch', {
          conversionId: conversion.id, sourceType: conversion.sourceType, declaredPlatform, detectedPlatform: platform,
        });
      }
      if (!['shopee', 'amazon', 'mercado_livre'].includes(platform)) {
        await this.repository.updateClaim({ conversion, status: 'unsupported_platform', resolvedUrl: resolved.resolvedUrl,
          detectedPlatform: platform, errorCode: 'UNSUPPORTED_PLATFORM' }); return;
      }
      await this.quota?.assertFeature?.(conversion.userId, platform as 'amazon'|'shopee'|'mercado_livre');
      const account = await this.repository.getConfiguredAccount(conversion.userId, platform);
      if (!account) {
        await this.repository.updateClaim({ conversion, status: 'affiliate_account_not_configured', resolvedUrl: resolved.resolvedUrl,
          detectedPlatform: platform, errorCode: 'AFFILIATE_ACCOUNT_NOT_CONFIGURED' }); return;
      }
      if (!await this.repository.updateClaim({ conversion, status: 'converting', resolvedUrl: resolved.resolvedUrl,
        detectedPlatform: platform, affiliateAccountId: account.id, provider: `${platform}_affiliate` })) return;
      const trackingLabel = conversion.sourceType === 'whatsapp' ? 'promofy_monitor'
        : conversion.sourceType === 'marketplace_radar' ? 'promofy_radar' : 'promofy_manual';
      // A franquia comercial mede apenas conversões do Mercado Livre.
      // Amazon e Shopee permanecem incluídas em todos os planos.
      if (platform === 'mercado_livre') await this.quota?.consume(conversion.userId,'affiliate_conversion');
      const result = await this.links.convert(platform, resolved.resolvedUrl, account.credentials,
        {
          userId: conversion.userId,
          affiliateAccountId: account.id,
          trackingLabel,
          requestId: conversion.id,
          // A API oficial da Shopee preserva até cinco subIds no short link.
          // O primeiro identifica a conversão AfiliHub sem expor usuário/PII e
          // permite reconciliar futuros relatórios oficiais ao Product/link.
          subIds: platform === "shopee" ? [shopeeTrackingSubId(conversion.id)] : undefined,
        });
      if (!result.success) {
        if (platform === 'mercado_livre' && ['COMPANION_OFFLINE', 'TEMPORARY_ERROR', 'JOB_ALREADY_CLAIMED',
          'AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'TWO_FACTOR_REQUIRED', 'USER_ACTION_REQUIRED'].includes(result.errorCode ?? '')) {
          await this.repository.updateClaim({ conversion, status: 'awaiting_companion', resolvedUrl: resolved.resolvedUrl,
            detectedPlatform: platform, affiliateAccountId: account.id, provider: result.provider,
            convertedUrl: null, errorCode: result.errorCode ?? 'COMPANION_OFFLINE' });
          return;
        }
        // Erros de entrada não são falhas transitórias da integração. Se a
        // página social não expuser nenhum produto (ou o Companion rejeitar
        // o candidato recuperado), classifique-o como inválido para não
        // consumir as três tentativas nem marcar a conexão como degradada.
        if (result.errorCode === 'LINK_VALIDATION_FAILED' || result.errorCode === 'INVALID_AFFILIATE_URL') {
          await this.repository.updateClaim({ conversion, status: 'invalid_url', resolvedUrl: resolved.resolvedUrl,
            detectedPlatform: platform, affiliateAccountId: account.id, provider: result.provider,
            convertedUrl: null, errorCode: result.errorCode });
          return;
        }
        if (result.transient && conversion.attemptCount < 3) {
          const delay = BACKOFF_MS[Math.min(conversion.attemptCount - 1, BACKOFF_MS.length - 1)];
          await this.repository.scheduleRetry(conversion, result.errorCode ?? 'CONVERSION_FAILED', new Date(Date.now() + delay).toISOString());
        } else await this.repository.updateClaim({ conversion, status: 'conversion_failed', resolvedUrl: resolved.resolvedUrl,
          detectedPlatform: platform, affiliateAccountId: account.id, provider: result.provider,
          convertedUrl: null, errorCode: result.errorCode ?? 'CONVERSION_FAILED' });
        return;
      }
      await this.repository.updateClaim({ conversion, status: 'converted', resolvedUrl: resolved.resolvedUrl,
        detectedPlatform: platform, affiliateAccountId: account.id, provider: result.provider,
        convertedUrl: result.convertedUrl, errorCode: null, convertedAt: new Date().toISOString() });
      await this.safeEvent(conversion.userId, 'affiliate.converted', { conversionId: conversion.id, platform });
      try { await this.automations?.publish(conversion.userId,'AFFILIATE_CONVERTED',`${conversion.id}:converted`,{conversionId:conversion.id,platform}); }
      catch { /* a conversão permanece válida; o job persistente pode ser republicado com a mesma chave */ }
    } catch (error) {
      const planCode = error instanceof Error ? error.message : '';
      if (planCode.startsWith('FEATURE_NOT_AVAILABLE_') || planCode === 'USAGE_LIMIT_AFFILIATE_CONVERSION') {
        await this.repository.updateClaim({ conversion, status:'conversion_failed', convertedUrl:null, errorCode:planCode });
        return;
      }
      const resolution = error instanceof UrlResolutionError ? error : null;
      const status: AffiliateConversionStatus = resolution?.code === 'INVALID_URL' || resolution?.code === 'SSRF_BLOCKED'
        ? 'invalid_url' : 'resolution_failed';
      if (resolution?.transient && conversion.attemptCount < 3) {
        const delay = BACKOFF_MS[Math.min(conversion.attemptCount - 1, BACKOFF_MS.length - 1)];
        await this.repository.scheduleRetry(conversion, resolution.code, new Date(Date.now() + delay).toISOString());
      } else await this.repository.updateClaim({ conversion, status, convertedUrl: null,
        errorCode: resolution?.code ?? 'RESOLUTION_FAILED' });
    }
  }
  private async safeEvent(userId: string, type: string, payload: Record<string, unknown>) {
    try { await this.repository.recordEvent(userId, type, payload); } catch { /* evento não interrompe conversão */ }
  }
}
export class AffiliateConversionWorker {
  private readonly loop: AdaptiveWorkerLoop;
  constructor(private readonly service: AffiliateConversionService, private readonly intervalMs = 5_000) {
    this.loop = new AdaptiveWorkerLoop(() => this.service.drain(), { minDelayMs: intervalMs, maxDelayMs: 60_000 });
  }
  start() { this.loop.start(); }
  stop() { this.loop.stop(); }
}
