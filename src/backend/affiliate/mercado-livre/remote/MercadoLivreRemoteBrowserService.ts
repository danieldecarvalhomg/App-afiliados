import { chromium, type Browser, type Page } from 'playwright-core';
import { createHash } from 'node:crypto';
import { extractMercadoLivreItemId, MercadoLivreAffiliateLinkValidator, normalizeMercadoLivreProductUrl } from '../AffiliateLinkValidator';
import { extractMercadoLivreProductUrls } from '../MercadoLivreLinkRecoveryService';
import { MercadoLivreCompanionError } from '../companion/types';
import { MercadoLivreRemoteSessionRepository } from './MercadoLivreRemoteSessionRepository';
import type { MarketplaceDeal } from '../../../../domain/marketplaces/discovery/types';
import {
  createRemoteBrowserProviders,
  decodeRemoteProfile,
  decodeRemoteProfiles,
  encodeRemoteProfiles,
  type RemoteBrowserProvider,
  type RemoteBrowserProviderId,
} from './RemoteBrowserProvider';

const AFFILIATE_API = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates';

interface ActiveLogin { browser: Browser; page: Page; sessionId: string; provider: RemoteBrowserProvider; }
interface OpenedRemoteSession { id: string; connectUrl: string; liveUrl: string | null; provider: RemoteBrowserProvider; }
interface RecoveredSession extends ActiveLogin { expiresAt: number; timer: ReturnType<typeof setTimeout>; }
type GenerationResult = { affiliateUrl:string; itemId:string|null; trackingLabel:string|null; cached:boolean; durationMs:number };
type GenerationInput = { sourceUrl:string; trackingLabel:string|null };
interface AffiliateHubCard {
  title: string; productUrl: string; imageUrl: string | null; currentPriceText: string;
  originalPriceText: string; discountText: string; commissionText: string;
  ratingText: string; salesText: string; bodyText: string;
}

type AffiliateTag = { tag?: unknown; id?: unknown; name?: unknown; in_use?: unknown };

function tagList(payload: unknown): AffiliateTag[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as { tags?: unknown; data?: unknown };
  if (Array.isArray(value.tags)) return value.tags;
  return Array.isArray(value.data) ? value.data : [];
}

function tagValue(item: AffiliateTag | undefined): string | null {
  for (const value of [item?.tag, item?.id, item?.name]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function hubMoney(value: string): number | null {
  const match = value.match(/R\$\s*([\d.]+)(?:\s*,\s*(\d{1,2}))?/u);
  if (!match) return null;
  const integer = Number(match[1].replace(/\./gu, ''));
  if (!Number.isFinite(integer)) return null;
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) / 100 : 0;
  return Math.round((integer + cents) * 100) / 100;
}

function hubPercent(value: string): number | null {
  const match = value.match(/(\d+(?:[.,]\d+)?)\s*%/u);
  return match ? Number(match[1].replace(',', '.')) : null;
}

function hubSales(value: string): number | null {
  const match = value.match(/\+?\s*(\d+(?:[.,]\d+)?)\s*(mil|[mM])?\s+(?:produtos\s+)?vendidos/iu);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const multiplier = match[2]?.toLowerCase() === 'mil' ? 1_000 : match[2]?.toLowerCase() === 'm' ? 1_000_000 : 1;
  return Number.isFinite(amount) ? Math.round(amount * multiplier) : null;
}

function hubItemId(productUrl: string): string | null {
  try {
    const parsed = new URL(productUrl);
    const explicit = parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id');
    const value = explicit ?? `${parsed.pathname}${parsed.search}`.match(/MLBU?[-_]?\d{6,}/iu)?.[0] ?? null;
    return value ? value.replace(/[-_]/gu, '').toUpperCase() : null;
  } catch { return null; }
}

export function mapMercadoLivreAffiliateHubCard(card: AffiliateHubCard, discoveredAt: string): MarketplaceDeal | null {
  const externalProductId = hubItemId(card.productUrl);
  if (!externalProductId || !card.title.trim()) return null;
  let productUrl: string;
  try {
    const parsed = new URL(normalizeMercadoLivreProductUrl(card.productUrl));
    const listingId = parsed.searchParams.get('wid') ?? parsed.searchParams.get('item_id');
    parsed.search = '';
    if (listingId && /^MLB\d{6,}$/iu.test(listingId)) parsed.searchParams.set('wid', listingId.toUpperCase());
    productUrl = parsed.toString();
  } catch { return null; }
  const price = hubMoney(card.currentPriceText);
  const originalPrice = hubMoney(card.originalPriceText);
  const discountPercent = hubPercent(card.discountText)
    ?? (price != null && originalPrice != null && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null);
  const ratingMatch = card.ratingText.match(/(\d(?:[.,]\d)?)/u);
  return {
    marketplace: 'mercado_livre', externalProductId, title: card.title.trim(), productUrl,
    imageUrl: card.imageUrl, imageUrls: card.imageUrl ? [card.imageUrl] : [], price, originalPrice,
    discountPercent, currency: 'BRL', commissionRate: hubPercent(card.commissionText), commissionAmount: null,
    salesCount: hubSales(card.salesText), rating: ratingMatch ? Number(ratingMatch[1].replace(',', '.')) : null,
    reviewsCount: null, coupon: /cupom/iu.test(card.bodyText) ? 'Disponível' : null,
    freeShipping: /frete\s+gr[aá]tis/iu.test(card.bodyText), category: null, discoveredAt,
  };
}

export function selectMercadoLivreTrackingTag(payload: unknown, requestedLabel?: string | null): string | null {
  const tags = tagList(payload);
  const requested = requestedLabel?.trim() ?? '';
  const requestedTag = requested
    ? tags.find((item) => [item.tag, item.id, item.name].some((value) => value === requested))
    : undefined;
  return tagValue(requestedTag)
    ?? tagValue(tags.find((item) => item.in_use === true))
    ?? tagValue(tags.find((item) => tagValue(item) !== null))
    ?? (requested || null);
}

export function extractMercadoLivreGeneratedUrl(payload: unknown): string | null {
  return extractMercadoLivreGeneratedUrls(payload)[0] ?? null;
}

export function extractMercadoLivreGeneratedUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as { urls?: unknown; results?: unknown; data?: unknown; short_url?: unknown; long_url?: unknown };
  const candidates = Array.isArray(value.urls) ? value.urls
    : Array.isArray(value.results) ? value.results
      : Array.isArray(value.data) ? value.data
        : [value];
  const urls: string[] = [];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    const item = candidate as { short_url?: unknown; long_url?: unknown };
    if (typeof item.short_url === 'string' && item.short_url) urls.push(item.short_url);
    else if (typeof item.long_url === 'string' && item.long_url) urls.push(item.long_url);
  }
  return urls;
}

export function mercadoLivreGenerationPriority(trackingLabel?: string | null): 'interactive' | 'background' {
  return trackingLabel === 'promofy_manual' ? 'interactive' : 'background';
}

function mercadoLivreOptimizationsEnabled():boolean{
  return process.env.ML_REMOTE_OPTIMIZATIONS_ENABLED!=='false';
}

export function mercadoLivreGenerationQueueDelay(trackingLabel?: string | null): number {
  if(!mercadoLivreOptimizationsEnabled())return 0;
  if (mercadoLivreGenerationPriority(trackingLabel) === 'interactive') return 0;
  return Math.max(0, Number(process.env.ML_REMOTE_BACKGROUND_BATCH_MS ?? 250));
}

function remoteError(value: unknown): MercadoLivreCompanionError {
  if (value instanceof MercadoLivreCompanionError) return value;
  const code = value instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(value.message) ? value.message : 'REMOTE_BROWSER_UNAVAILABLE';
  return new MercadoLivreCompanionError(code as any, 'O navegador remoto do Mercado Livre está indisponível.', true);
}

export class MercadoLivreRemoteBrowserService {
  private readonly logins = new Map<string, ActiveLogin>();
  private readonly recoveredSessions = new Map<string, RecoveredSession>();
  private readonly warmSessions = new Map<string, RecoveredSession>();
  private readonly discoveryCache = new Map<string, { expiresAt: number; deals: MarketplaceDeal[] }>();
  private readonly affiliateLinkCache = new Map<string, { expiresAt:number; result:GenerationResult }>();
  private readonly inFlightGenerations = new Map<string, Promise<GenerationResult>>();
  private readonly validator = new MercadoLivreAffiliateLinkValidator();
  private readonly generationQueue = new Map<string, Array<{
    userId:string; sourceUrl:string; trackingLabel:string|null;
    resolve:(value:GenerationResult)=>void;
    reject:(reason:unknown)=>void;
  }>>();
  private readonly generationTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private batchFallbacks:number[]=[];
  private batchDisabledUntil=0;

  constructor(
    private readonly repository: MercadoLivreRemoteSessionRepository,
    private readonly providers: RemoteBrowserProvider[] = createRemoteBrowserProviders(),
  ) {}

  configured(): boolean { return this.providers.some((provider) => provider.configured()); }

  async status(userId: string) {
    const session = await this.repository.get(userId);
    const storedProvider = session ? decodeRemoteProfile(session.contextId).provider : null;
    const preferredProvider = this.providers.find((provider) => provider.configured())?.id ?? null;
    return {
      configured: this.configured(),
      provider: storedProvider,
      preferredProvider,
      availableProviders: this.providers.filter((provider) => provider.configured()).map((provider) => provider.id),
      status: session?.status ?? (this.configured() ? 'NEEDS_LOGIN' : 'NOT_CONFIGURED'),
      lastCheckedAt: session?.lastCheckedAt ?? null,
      lastSuccessAt: session?.lastSuccessAt ?? null,
      lastErrorCode: session?.lastErrorCode ?? null,
      loginInProgress: Boolean(session?.activeSessionId && this.logins.has(userId)),
    };
  }

  async beginLogin(userId: string): Promise<{ liveUrl: string; expiresAt: string }> {
    this.ensureConfigured();
    const provider = this.preferredProvider();
    const current = await this.repository.get(userId);
    const registry = current ? decodeRemoteProfiles(current.contextId) : null;
    const profileId = registry?.profiles[provider.id]
      ?? await provider.createProfile(userId);
    const contextId = encodeRemoteProfiles({
      primary: provider.id,
      profiles: { ...(registry?.profiles ?? {}), [provider.id]: profileId },
    });
    if (!current || current.contextId !== contextId) await this.repository.create(userId, contextId);
    await this.closeLogin(userId);
    const session = await provider.createSession(profileId, { interactive: true, persistChanges: true });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    this.logins.set(userId, { browser, page, sessionId: session.id, provider });
    await this.repository.update(userId, { status: 'CONNECTING', activeSessionId: session.id, errorCode:null });
    if (!session.liveUrl) throw new Error('REMOTE_LIVE_URL_UNAVAILABLE');
    return { liveUrl: session.liveUrl, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
  }

  async verifyLogin(userId: string) {
    const active = this.logins.get(userId);
    if (!active) throw new MercadoLivreCompanionError('REMOTE_LOGIN_SESSION_EXPIRED' as any, 'Inicie uma nova conexão remota.');
    try {
      await active.page.bringToFront();
      const state = await this.inspect(active.page);
      if (state !== 'READY') {
        await this.repository.update(userId, { status: 'NEEDS_LOGIN', errorCode: state });
        return { ready: false, status: state };
      }
      await this.repository.update(userId, { status: 'READY', activeSessionId: null, errorCode: null, success: true });
      await this.release(active.provider, active.sessionId);
      await active.browser.close().catch(() => undefined);
      this.logins.delete(userId);
      return { ready: true, status: 'READY' };
    } catch (error) {
      await this.repository.update(userId, { status: 'ERROR', errorCode: remoteError(error).code });
      throw remoteError(error);
    }
  }

  async generate(userId: string, sourceUrl: string, trackingLabel?: string | null): Promise<GenerationResult> {
    this.ensureConfigured();
    const normalizedUrl = normalizeMercadoLivreProductUrl(sourceUrl);
    if(!mercadoLivreOptimizationsEnabled())return this.enqueueGeneration(userId,normalizedUrl,trackingLabel?.trim()||null);
    const label = trackingLabel?.trim() ?? '';
    const sourceHash=createHash('sha256').update(normalizedUrl).digest('hex').slice(0,24);
    // Incluímos a URL no identificador para não perder seleção de variação,
    // mesmo quando duas páginas compartilham o mesmo MLB.
    const itemKey = `${extractMercadoLivreItemId(normalizedUrl)??'URL'}:${sourceHash}`;
    const cacheKey = `${userId}:${itemKey}:${label}`;
    const memory = this.affiliateLinkCache.get(cacheKey);
    if (memory && memory.expiresAt > Date.now()) return { ...memory.result, cached:true, durationMs:0 };
    this.affiliateLinkCache.delete(cacheKey);
    const running = this.inFlightGenerations.get(cacheKey);
    if (running) return running;
    const task = this.generateCached(userId, normalizedUrl, itemKey, label);
    this.inFlightGenerations.set(cacheKey, task);
    try { return await task; }
    finally { if (this.inFlightGenerations.get(cacheKey) === task) this.inFlightGenerations.delete(cacheKey); }
  }

  private async generateCached(userId:string, normalizedUrl:string, itemKey:string, label:string):Promise<GenerationResult>{
    const cacheKey = `${userId}:${itemKey}:${label}`;
    const persistent = await this.repository.findCachedAffiliateLink(userId, itemKey, label).catch(() => null);
    if (persistent) {
      try {
        const result:GenerationResult = { affiliateUrl:this.validator.validate(normalizedUrl,persistent), itemId:extractMercadoLivreItemId(normalizedUrl), trackingLabel:label || null, cached:true, durationMs:0 };
        this.affiliateLinkCache.set(cacheKey,{ result,expiresAt:Date.now()+this.cacheTtlMs() });
        return result;
      } catch { /* cache antigo ou inválido: gerar novamente */ }
    }
    const result = await this.enqueueGeneration(userId, normalizedUrl, label || null);
    this.affiliateLinkCache.set(cacheKey,{ result,expiresAt:Date.now()+this.cacheTtlMs() });
    void this.repository.saveCachedAffiliateLink({ userId,itemKey,trackingLabel:label,sourceUrl:normalizedUrl,affiliateUrl:result.affiliateUrl,expiresAt:new Date(Date.now()+this.cacheTtlMs()).toISOString() }).catch((error)=>console.warn('[AfiliHub] Cache persistente ML indisponível:',error));
    return result;
  }

  private enqueueGeneration(userId:string, normalizedUrl:string, trackingLabel:string|null):Promise<GenerationResult>{
    const recovered = this.takeRecoveredSession(userId, normalizedUrl);
    if (recovered) return this.generateBatch(userId, [{ sourceUrl:normalizedUrl, trackingLabel }], recovered).then((items)=>items[0]);
    const key = userId;
    return new Promise((resolve, reject) => {
      const queue = this.generationQueue.get(key) ?? [];
      queue.push({ userId, sourceUrl:normalizedUrl, trackingLabel, resolve, reject });
      this.generationQueue.set(key, queue);
      const delay = mercadoLivreGenerationQueueDelay(trackingLabel);
      const maximum = this.maxBatchSize();
      if (this.generationTimers.has(key) && delay === 0) {
        clearTimeout(this.generationTimers.get(key));
        this.generationTimers.delete(key);
      }
      if (!this.generationTimers.has(key) || queue.length >= maximum) {
        const timer=setTimeout(() => void this.flushGenerationQueue(key),queue.length>=maximum?0:delay);
        timer.unref?.();
        this.generationTimers.set(key,timer);
      }
    });
  }

  private async flushGenerationQueue(key:string):Promise<void>{
    const queue=this.generationQueue.get(key)??[];
    this.generationQueue.delete(key);this.generationTimers.delete(key);
    if(!queue.length)return;
    const maximum=this.maxBatchSize();
    for(let offset=0;offset<queue.length;offset+=maximum){
      const chunk=queue.slice(offset,offset+maximum);
      try{const results=await this.generateBatch(chunk[0].userId,chunk.map((item)=>({sourceUrl:item.sourceUrl,trackingLabel:item.trackingLabel})));chunk.forEach((item,index)=>item.resolve(results[index]));}
      catch(error){chunk.forEach((item)=>item.reject(error));}
    }
  }

  private async generateBatch(userId: string, inputs:GenerationInput[], recovered?:RecoveredSession):Promise<GenerationResult[]> {
    const stored = await this.repository.get(userId);
    if (stored?.lastErrorCode === 'REMOTE_BROWSER_HTTP_402' || stored?.lastErrorCode === 'REMOTE_BROWSER_BILLING_REQUIRED')
      throw new MercadoLivreCompanionError('REMOTE_BROWSER_BILLING_REQUIRED' as any, 'Adicione créditos ao navegador remoto para continuar.', false);
    if (!stored || stored.status !== 'READY') throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any, 'Conecte a sessão remota do Mercado Livre.');
    const normalizedUrls = inputs.map((input)=>normalizeMercadoLivreProductUrl(input.sourceUrl));
    let browser: Browser | null = null;
    let sessionId: string | null = null;
    let sessionProvider: RemoteBrowserProvider | null = null;
    let page: Page | null = null;
    let keepWarm = false;
    const started = Date.now();
    try {
      const reusable = recovered ?? this.takeWarmSession(userId);
      if (reusable) {
        browser = reusable.browser;
        sessionId = reusable.sessionId;
        sessionProvider = reusable.provider;
        page = reusable.page;
      } else {
        const remote = await this.createSession(stored.contextId, false);
        sessionId = remote.id;
        sessionProvider = remote.provider;
        browser = await chromium.connectOverCDP(remote.connectUrl);
        const context = browser.contexts()[0];
        page = context.pages()[0] ?? await context.newPage();
      }
      await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (await this.inspect(page) !== 'READY') throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any, 'A sessão remota expirou.');
      const tagsResult = await page.evaluate(async (api) => {
        const tagsResponse = await fetch(`${api}/getTags`, { credentials: 'include', headers: { accept: 'application/json' } });
        const payload = await tagsResponse.json().catch(() => null);
        return { ok: tagsResponse.ok, status: tagsResponse.status, payload };
      }, AFFILIATE_API);
      if (!tagsResult.ok) {
        const code = tagsResult.status === 401 || tagsResult.status === 403 ? 'AUTH_REQUIRED' : 'GENERATION_FAILED';
        throw new MercadoLivreCompanionError(code as any, 'Falha ao carregar as etiquetas do Mercado Livre.');
      }
      const generatedUrls = new Array<string>(inputs.length);
      const selectedTags = new Array<string|null>(inputs.length);
      const groups = new Map<string,number[]>();
      inputs.forEach((input,index)=>{
        const key=input.trackingLabel?.trim()??'';
        groups.set(key,[...(groups.get(key)??[]),index]);
      });
      for(const [requestedLabel,indexes] of groups){
        const tag=selectMercadoLivreTrackingTag(tagsResult.payload,requestedLabel||null);
        const urls=indexes.map((index)=>normalizedUrls[index]);
        const links=await this.createAffiliateLinks(page,urls,tag);
        indexes.forEach((originalIndex,index)=>{ generatedUrls[originalIndex]=links[index];selectedTags[originalIndex]=tag; });
      }
      await this.repository.update(userId, { status: 'READY', errorCode: null, success: true });
      const results=normalizedUrls.map((normalizedUrl,index)=>({ affiliateUrl:this.validator.validate(normalizedUrl,generatedUrls[index]), itemId:extractMercadoLivreItemId(normalizedUrl), trackingLabel:selectedTags[index] ?? inputs[index].trackingLabel ?? null, cached:false, durationMs:Date.now()-started }));
      const background=inputs.some((input)=>mercadoLivreGenerationPriority(input.trackingLabel)==='background');
      if(page&&browser&&sessionId&&sessionProvider&&background&&this.warmSessionMs()>0){
        this.storeWarmSession(userId,{browser,page,sessionId,provider:sessionProvider});
        keepWarm=true;browser=null;page=null;sessionId=null;sessionProvider=null;
      }
      return results;
    } catch (error) {
      const failure = remoteError(error);
      const needsLogin = failure.code === 'AUTH_REQUIRED' || failure.code === 'REMOTE_LOGIN_REQUIRED';
      const billingRequired = failure.code === 'REMOTE_BROWSER_HTTP_402' || failure.code === 'REMOTE_BROWSER_BILLING_REQUIRED';
      // Uma falha de geração não invalida a sessão autenticada. Mantemos o motor
      // pronto para novas tentativas e só exigimos login quando a autenticação falha.
      await this.repository.update(userId, { status: billingRequired ? 'ERROR' : needsLogin ? 'NEEDS_LOGIN' : 'READY', errorCode: billingRequired ? 'REMOTE_BROWSER_BILLING_REQUIRED' : failure.code }).catch(() => undefined);
      throw failure;
    } finally {
      if (!keepWarm && sessionId && sessionProvider) await this.release(sessionProvider, sessionId).catch(() => undefined);
      if (!keepWarm && browser) await browser.close().catch(() => undefined);
    }
  }

  /**
   * Lê as ofertas recomendadas pela própria Central de Afiliados. Esta fonte
   * é usada quando a API pública de busca devolve 403 por política da conta.
   */
  async discoverDeals(userId: string, limit = 40, forceRefresh = false): Promise<MarketplaceDeal[]> {
    this.ensureConfigured();
    const maximum = Math.min(40, Math.max(1, limit));
    const cached = this.discoveryCache.get(userId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.deals.slice(0, maximum);
    const stored = await this.repository.get(userId);
    if (stored?.lastErrorCode === 'REMOTE_BROWSER_HTTP_402' || stored?.lastErrorCode === 'REMOTE_BROWSER_BILLING_REQUIRED')
      throw new MercadoLivreCompanionError('REMOTE_BROWSER_BILLING_REQUIRED' as any, 'Adicione créditos ao navegador remoto para continuar.', false);
    if (!stored || stored.status !== 'READY') {
      throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any, 'Conecte a sessão remota do Mercado Livre.');
    }
    let browser: Browser | null = null;
    let sessionId: string | null = null;
    let sessionProvider: RemoteBrowserProvider | null = null;
    try {
      const remote = await this.createSession(stored.contextId, false);
      sessionId = remote.id;
      sessionProvider = remote.provider;
      browser = await chromium.connectOverCDP(remote.connectUrl);
      const context = browser.contexts()[0];
      const page = context.pages()[0] ?? await context.newPage();
      await page.goto('https://www.mercadolivre.com.br/afiliados/hub', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (await this.inspect(page) !== 'READY') throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any, 'A sessão remota expirou.');
      await page.locator('a.poly-component__title').first().waitFor({ state: 'visible', timeout: 20_000 });
      const cards = await page.locator('a.poly-component__title').evaluateAll((anchors, maximum): AffiliateHubCard[] => anchors.slice(0, Number(maximum)).map((node) => {
        const anchor = node as HTMLAnchorElement;
        const card = anchor.closest('li') ?? anchor.closest('[class*="poly-card"]') ?? anchor.parentElement?.parentElement?.parentElement;
        const bodyText = (card?.textContent ?? '').replace(/\s+/gu, ' ').trim();
        const image = card?.querySelector('img.poly-component__picture, img[alt]') as HTMLImageElement | null;
        const labelledRating = card?.querySelector('[aria-label*="Classifica"], [aria-label*="estrelas"]')?.getAttribute('aria-label') ?? '';
        const currentAmount = card?.querySelector('.poly-price__current .andes-money-amount, .andes-money-amount:not(.andes-money-amount--previous)');
        const currentFraction = currentAmount?.querySelector('.andes-money-amount__fraction')?.textContent?.trim() ?? '';
        const currentCents = currentAmount?.querySelector('.andes-money-amount__cents')?.textContent?.trim() ?? '';
        const previousAmount = card?.querySelector('.andes-money-amount--previous, s .andes-money-amount');
        const previousFraction = previousAmount?.querySelector('.andes-money-amount__fraction')?.textContent?.trim() ?? '';
        const previousCents = previousAmount?.querySelector('.andes-money-amount__cents')?.textContent?.trim() ?? '';
        return {
          title: (anchor.textContent ?? '').trim(), productUrl: anchor.href,
          imageUrl: image?.currentSrc || image?.src || null,
          currentPriceText: currentFraction ? `R$ ${currentFraction}${currentCents ? `,${currentCents}` : ''}` : '',
          originalPriceText: previousFraction ? `R$ ${previousFraction}${previousCents ? `,${previousCents}` : ''}` : '',
          discountText: (card?.querySelector('.andes-money-amount__discount, [class*="discount"]')?.textContent ?? '').trim(),
          commissionText: bodyText.match(/GANHOS(?:\s+EXTRAS)?\s*\d+(?:[.,]\d+)?\s*%/iu)?.[0] ?? '',
          ratingText: labelledRating || (bodyText.match(/\d(?:[.,]\d)?\s*\|/u)?.[0] ?? ''),
          salesText: bodyText.match(/\+?\s*\d+(?:[.,]\d+)?\s*(?:mil|[mM])?\s+(?:produtos\s+)?vendidos/iu)?.[0] ?? '',
          bodyText,
        };
      }), maximum);
      const discoveredAt = new Date().toISOString();
      const deals = cards.map((card) => mapMercadoLivreAffiliateHubCard(card, discoveredAt)).filter(Boolean) as MarketplaceDeal[];
      const cacheMs = Math.max(60_000, Number(process.env.MERCADO_LIVRE_RADAR_CACHE_MS ?? 5 * 60_000));
      this.discoveryCache.set(userId, { deals, expiresAt: Date.now() + cacheMs });
      await this.repository.update(userId, { status: 'READY', errorCode: null, success: true });
      return deals;
    } catch (error) {
      console.error('[AfiliHub] Falha ao ler ofertas do Mercado Livre no navegador remoto:', error);
      const failure = remoteError(error);
      const needsLogin = failure.code === 'AUTH_REQUIRED' || failure.code === 'REMOTE_LOGIN_REQUIRED';
      const billingRequired = failure.code === 'REMOTE_BROWSER_HTTP_402' || failure.code === 'REMOTE_BROWSER_BILLING_REQUIRED';
      await this.repository.update(userId, { status: billingRequired ? 'ERROR' : needsLogin ? 'NEEDS_LOGIN' : 'READY', errorCode: billingRequired ? 'REMOTE_BROWSER_BILLING_REQUIRED' : failure.code }).catch(() => undefined);
      throw failure;
    } finally {
      if (sessionId && sessionProvider) await this.release(sessionProvider, sessionId).catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
    }
  }

  /**
   * Resolve links curtos meli.la e páginas /social renderizadas por JavaScript
   * até o produto real.
   * A navegação ocorre no servidor e nunca retorna um link que não contenha
   * uma identificação MLB validada.
   */
  async recoverProductUrl(userId: string, sourceUrl: string): Promise<string | null> {
    this.ensureConfigured();
    let parsed: URL;
    try { parsed = new URL(sourceUrl); } catch { return null; }
    const socialProfile = /(^|\.)mercadolivre\.com\.br$/iu.test(parsed.hostname)
      && /^\/social(?:\/|$)/iu.test(parsed.pathname);
    const shortLink = parsed.hostname.toLowerCase() === 'meli.la';
    if (parsed.protocol !== 'https:' || (!socialProfile && !shortLink)) return null;
    const stored = await this.repository.get(userId);
    if (stored?.lastErrorCode === 'REMOTE_BROWSER_HTTP_402' || stored?.lastErrorCode === 'REMOTE_BROWSER_BILLING_REQUIRED') return null;
    if (!stored) return null;
    let browser: Browser | null = null;
    let sessionId: string | null = null;
    let sessionProvider: RemoteBrowserProvider | null = null;
    try {
      const remote = await this.createSession(stored.contextId, false);
      sessionId = remote.id;
      sessionProvider = remote.provider;
      browser = await chromium.connectOverCDP(remote.connectUrl);
      const context = browser.contexts()[0];
      let page = context.pages()[0] ?? await context.newPage();
      await page.goto(parsed.toString(), { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(1_500);

      let productUrl: string | null = null;
      try { productUrl = normalizeMercadoLivreProductUrl(page.url()); } catch { /* página intermediária */ }

      const visibleLinks = await page.locator('a[href]').evaluateAll((anchors) => anchors.map((anchor) => ({
        href: (anchor as HTMLAnchorElement).href,
        text: (anchor.textContent ?? '').trim(),
      })));
      const ordered = [
        ...visibleLinks.filter((item) => /ir\s+para\s+(?:o\s+)?produto/iu.test(item.text)),
        ...visibleLinks,
      ];
      if (!productUrl) {
        for (const item of ordered) {
          if (!item.href) continue;
          try { productUrl = normalizeMercadoLivreProductUrl(item.href); break; } catch { /* próximo candidato */ }
        }
      }

      if (!productUrl) {
        const htmlCandidates = extractMercadoLivreProductUrls(await page.content());
        if (htmlCandidates.length) productUrl = htmlCandidates[0];
      }

      const action = !productUrl
        ? page.getByText(/ir\s+para\s+(?:o\s+)?produto/iu, { exact: false }).first()
        : null;
      if (action && await action.count()) {
        const popupPromise = context.waitForEvent('page', { timeout: 5_000 }).catch(() => null);
        await action.click({ timeout: 8_000 });
        const popup = await popupPromise;
        if (popup) page = popup;
        await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(1_000);
        try { productUrl = normalizeMercadoLivreProductUrl(page.url()); } catch { productUrl = null; }
      }
      if (!productUrl) return null;

      // A próxima etapa do mesmo worker chama generate() imediatamente. A
      // sessão continua aberta e é transferida por chave de usuário+produto,
      // evitando uma segunda sessão cobrada no provedor remoto.
      this.storeRecoveredSession(userId, productUrl, { browser, page, sessionId, provider: sessionProvider });
      browser = null;
      sessionId = null;
      return productUrl;
    } finally {
      if (sessionId && sessionProvider) await this.release(sessionProvider, sessionId).catch(() => undefined);
      if (browser) await browser.close().catch(() => undefined);
    }
  }

  private async createAffiliateLinks(page:Page,productUrls:string[],selectedTag:string|null):Promise<string[]>{
    const request=async(urls:string[])=>page.evaluate(async ({ api, productUrls:values, selectedTag:tag }) => {
      const response = await fetch(`${api}/createLink`, {
        method:'POST',credentials:'include',
        headers:{accept:'application/json','content-type':'application/json'},
        body:JSON.stringify({urls:values,tag}),
      });
      const payload=await response.json().catch(()=>null);
      return {ok:response.ok,status:response.status,payload};
    },{api:AFFILIATE_API,productUrls:urls,selectedTag});
    const generated=await request(productUrls);
    const urls=generated.ok?extractMercadoLivreGeneratedUrls(generated.payload):[];
    if(generated.ok&&urls.length===productUrls.length)return urls;
    if(generated.status===401||generated.status===403)
      throw new MercadoLivreCompanionError('AUTH_REQUIRED' as any,'A sessão do Mercado Livre expirou.');
    if(productUrls.length===1)
      throw new MercadoLivreCompanionError('GENERATION_FAILED' as any,'Falha ao gerar link no navegador remoto.');
    this.recordBatchFallback();
    // Falha parcial no endpoint em lote não derruba os demais itens. O retry
    // usa a mesma sessão e mantém exatamente a experiência anterior.
    const recovered:string[]=[];
    for(const productUrl of productUrls){
      const single=await request([productUrl]);
      const value=single.ok?extractMercadoLivreGeneratedUrls(single.payload)[0]:null;
      if(!value)throw new MercadoLivreCompanionError(single.status===401||single.status===403?'AUTH_REQUIRED' as any:'GENERATION_FAILED' as any,'Falha ao gerar um dos links no navegador remoto.');
      recovered.push(value);
    }
    return recovered;
  }

  private cacheTtlMs():number{
    return Math.max(60_000,Number(process.env.ML_AFFILIATE_LINK_CACHE_TTL_MS??7*24*60*60_000));
  }

  private maxBatchSize():number{
    if(!mercadoLivreOptimizationsEnabled()||this.batchDisabledUntil>Date.now())return 1;
    return Math.max(1,Number(process.env.ML_REMOTE_MAX_BATCH_SIZE??20));
  }

  private recordBatchFallback():void{
    const now=Date.now();
    this.batchFallbacks=this.batchFallbacks.filter((time)=>time>now-5*60_000);
    this.batchFallbacks.push(now);
    if(this.batchFallbacks.length>=3){
      this.batchDisabledUntil=now+5*60_000;
      this.batchFallbacks=[];
      console.warn('[AfiliHub] Lote ML pausado por 5 minutos após falhas repetidas; fallback individual ativado.');
    }
  }

  private warmSessionMs():number{
    return mercadoLivreOptimizationsEnabled()?Math.max(0,Number(process.env.ML_REMOTE_WARM_SESSION_MS??30_000)):0;
  }

  private storeWarmSession(userId:string,active:ActiveLogin):void{
    void this.closeWarmSession(userId);
    const ttl=this.warmSessionMs();
    const timer=setTimeout(()=>void this.closeWarmSession(userId),ttl);
    timer.unref?.();
    this.warmSessions.set(userId,{...active,expiresAt:Date.now()+ttl,timer});
  }

  private takeWarmSession(userId:string):RecoveredSession|null{
    const active=this.warmSessions.get(userId);
    if(!active)return null;
    this.warmSessions.delete(userId);clearTimeout(active.timer);
    if(active.expiresAt<=Date.now()){
      void this.release(active.provider,active.sessionId).catch(()=>undefined);
      void active.browser.close().catch(()=>undefined);
      return null;
    }
    return active;
  }

  private async closeWarmSession(userId:string):Promise<void>{
    const active=this.warmSessions.get(userId);if(!active)return;
    this.warmSessions.delete(userId);clearTimeout(active.timer);
    await this.release(active.provider,active.sessionId).catch(()=>undefined);
    await active.browser.close().catch(()=>undefined);
  }

  private async inspect(page: Page): Promise<string> {
    return page.evaluate(async (api) => {
      try {
        const response = await fetch(`${api}/getTags`, { credentials: 'include', headers: { accept: 'application/json' } });
        if (response.ok) return 'READY';
        if (response.status === 401 || response.status === 403) return 'AUTH_REQUIRED';
        return 'PORTAL_UNAVAILABLE';
      } catch { return 'PORTAL_UNAVAILABLE'; }
    }, AFFILIATE_API);
  }

  private recoveredSessionKey(userId: string, productUrl: string): string {
    return `${userId}:${extractMercadoLivreItemId(productUrl) ?? productUrl}`;
  }

  private storeRecoveredSession(userId: string, productUrl: string, active: ActiveLogin): void {
    const key = this.recoveredSessionKey(userId, productUrl);
    void this.closeRecoveredSession(key);
    const expiresAt = Date.now() + 60_000;
    const timer = setTimeout(() => void this.closeRecoveredSession(key), 60_000);
    timer.unref?.();
    this.recoveredSessions.set(key, { ...active, expiresAt, timer });
  }

  private takeRecoveredSession(userId: string, productUrl: string): RecoveredSession | null {
    const key = this.recoveredSessionKey(userId, productUrl);
    const active = this.recoveredSessions.get(key);
    if (!active) return null;
    this.recoveredSessions.delete(key);
    clearTimeout(active.timer);
    if (active.expiresAt <= Date.now()) {
      void this.release(active.provider, active.sessionId).catch(() => undefined);
      void active.browser.close().catch(() => undefined);
      return null;
    }
    return active;
  }

  private async closeRecoveredSession(key: string): Promise<void> {
    const active = this.recoveredSessions.get(key);
    if (!active) return;
    this.recoveredSessions.delete(key);
    clearTimeout(active.timer);
    await this.release(active.provider, active.sessionId).catch(() => undefined);
    await active.browser.close().catch(() => undefined);
  }

  private async createSession(contextId: string, interactive: boolean): Promise<OpenedRemoteSession> {
    const registry = decodeRemoteProfiles(contextId);
    const ids = [registry.primary, ...Object.keys(registry.profiles).filter((id) => id !== registry.primary)] as RemoteBrowserProviderId[];
    let lastError: unknown = null;
    for (const id of ids) {
      const profileId = registry.profiles[id];
      if (!profileId) continue;
      let provider: RemoteBrowserProvider;
      try { provider = this.providerById(id); } catch (error) { lastError = error; continue; }
      try {
        const session = await provider.createSession(profileId, { interactive, persistChanges: true });
        return { ...session, provider };
      } catch (error) {
        lastError = error;
        if (interactive) break;
      }
    }
    throw lastError ?? new Error('REMOTE_BROWSER_UNAVAILABLE');
  }

  private async release(provider: RemoteBrowserProvider, sessionId: string): Promise<void> {
    await provider.stopSession(sessionId);
  }

  private async closeLogin(userId: string): Promise<void> {
    const active = this.logins.get(userId);
    if (!active) return;
    await this.release(active.provider, active.sessionId).catch(() => undefined);
    await active.browser.close().catch(() => undefined);
    this.logins.delete(userId);
  }

  private ensureConfigured(): void {
    if (!this.configured()) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED' as any, 'Configure o navegador remoto no servidor.');
  }

  private preferredProvider(): RemoteBrowserProvider {
    const provider = this.providers.find((candidate) => candidate.configured());
    if (!provider) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED' as any, 'Configure o navegador remoto no servidor.');
    return provider;
  }

  private providerById(id: RemoteBrowserProviderId): RemoteBrowserProvider {
    const provider = this.providers.find((candidate) => candidate.id === id && candidate.configured());
    if (!provider) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED' as any, `O provedor remoto ${id} não está configurado.`);
    return provider;
  }

}
