import { fail, ok, type AppResult } from '../../errors';
import type { AffiliateConversionService } from '../../affiliate/AffiliateConversionService';
import type { ConfigurableAffiliatePlatform } from '../../affiliate/types';
import type { MarketplaceDiscoveryProvider } from './MarketplaceDiscoveryProvider';
import type { MarketplaceRadarRepository } from './MarketplaceRadarRepository';
import type { MarketplaceDeal, RadarFilters, RadarPage } from './types';
import type { ProductRecord } from '../../products/types';
import { DealScoreService } from './DealScoreService';
import type { ProductMediaService } from '../../media/ProductMediaService';
import { createHash } from 'node:crypto';
import type { UsageQuotaService } from '../../usage/UsageQuotaService';

const marketplaceNames: Record<ConfigurableAffiliatePlatform, string> = { shopee: 'Shopee', amazon: 'Amazon', mercado_livre: 'Mercado Livre' };
function selectedMarketplace(value: unknown): ConfigurableAffiliatePlatform {
  return value === 'amazon' || value === 'mercado_livre' ? value : 'shopee';
}

export class MarketplaceRadarService {
  private readonly scores = new DealScoreService();
  private readonly catalogVersions = new Map<string, string>();
  constructor(private readonly repository: MarketplaceRadarRepository, private readonly providers: MarketplaceDiscoveryProvider[], private readonly conversions: AffiliateConversionService, private readonly media?: ProductMediaService, private readonly quota?:UsageQuotaService) {}
  async refresh(userId: string, marketplace: ConfigurableAffiliatePlatform = 'shopee', trigger: 'manual' | 'scheduler' = 'manual'): Promise<AppResult<{ received: number; inserted: number; updated: number; unchanged: number }>> {
    const name = marketplaceNames[marketplace];
    try {
      await this.quota?.assertFeature?.(userId,'radar');
      await this.quota?.assertFeature?.(userId,marketplace);
    } catch { return fail('FEATURE_NOT_AVAILABLE', `${name} não está disponível no plano atual.`); }
    const account = await this.repository.getAccount(userId, marketplace); if (!account) return fail('RADAR_PROVIDER_NOT_CONFIGURED', `${name} não configurada.`);
    const lock = await this.repository.acquireRefresh(userId, marketplace, trigger); if (!lock.acquired) return fail(lock.errorCode ?? 'RADAR_REFRESH_IN_PROGRESS', lock.errorCode === 'RADAR_REFRESH_COOLDOWN' ? 'Aguarde antes de atualizar novamente.' : 'Uma atualização já está em andamento.');
    const started = Date.now();
    try {
      await this.quota?.consume(userId,'radar_refresh');
      const provider = this.providers.find((item) => item.marketplace === marketplace); if (!provider) return fail('RADAR_PROVIDER_NOT_CONFIGURED', `Provider ${name} indisponível.`);
      const previousAccessToken = account.credentials.accessToken;
      const previousRefreshToken = account.credentials.refreshToken;
      const page = await provider.getDeals({ userId, credentials: account.credentials, limit: marketplace === 'amazon' ? 10 : 40, forceRefresh: trigger === 'manual' });
      if (account.credentials.accessToken !== previousAccessToken || account.credentials.refreshToken !== previousRefreshToken) {
        await this.repository.updateCredentials?.(userId, marketplace, account.credentials);
      }
      const versionKey = `${userId}:${marketplace}`;
      const version = createHash('sha256').update(JSON.stringify(page.deals.map((deal) => ({
        id: deal.externalProductId, title: deal.title, url: deal.productUrl, price: deal.price,
        originalPrice: deal.originalPrice, discount: deal.discountPercent, commission: deal.commissionRate,
        sales: deal.salesCount, coupon: deal.coupon, shipping: deal.freeShipping, images: deal.imageUrls,
      })).sort((a,b) => a.id.localeCompare(b.id)))).digest('hex');
      const unchangedCatalog = this.catalogVersions.get(versionKey) === version;
      const persisted = unchangedCatalog
        ? { inserted: 0, updated: 0, unchanged: page.deals.length }
        : await this.repository.upsertDeals(userId, account.id, page.deals);
      const stale = unchangedCatalog ? 0 : await this.repository.markMissingDeals(userId, marketplace, page.deals.map((deal) => deal.externalProductId));
      this.catalogVersions.set(versionKey, version);
      const metrics = { duration_ms: Date.now() - started, items_received: page.deals.length, items_inserted: persisted.inserted, items_updated: persisted.updated, items_unchanged: persisted.unchanged, items_stale: stale };
      await this.repository.finishRefresh(userId, marketplace, { metrics }); await this.repository.recordEvent(userId, 'radar.refresh.completed', { provider: marketplace, ...metrics });
      return ok({ received: page.deals.length, inserted: persisted.inserted, updated: persisted.updated, unchanged: persisted.unchanged });
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      const code = raw.startsWith('SHOPEE_') || raw.startsWith('AMAZON_') || raw.startsWith('MERCADO_LIVRE_') ? raw : 'RADAR_REFRESH_FAILED';
      await this.repository.finishRefresh(userId, marketplace, { errorCode: code, errorMessage: 'Não foi possível atualizar o Radar.', metrics: { duration_ms: Date.now() - started } });
      await this.repository.recordEvent(userId, 'radar.refresh.failed', { provider: marketplace, errorCode: code }); return fail(code, 'Não foi possível atualizar o Radar.');
    }
  }
  async list(userId: string, filters: RadarFilters): Promise<AppResult<RadarPage>> {
    try {
      const marketplace = selectedMarketplace(filters.marketplace);
      const affiliateStatus = await this.repository.getValidationStatus(userId, marketplace);
      if (affiliateStatus !== 'valid') return ok({ items: [], nextCursor: null, affiliateStatus });
      const normalized = { ...filters, marketplace };
      const page = await this.repository.listDeals(userId, normalized);
      const items = page.items.map((deal) => { const scored = this.scores.score(deal); return { ...deal, dealScore: scored.score, dealScoreVersion: scored.version, scoreReasons: scored.reasons }; });
      return ok({ ...page, items, affiliateStatus });
    } catch { return fail('RADAR_LIST_FAILED', 'Não foi possível carregar o Radar.'); }
  }
  async get(userId: string, id: string): Promise<AppResult<MarketplaceDeal>> {
    const deal = await this.repository.getDeal(userId, id); if (!deal) return fail('RADAR_DEAL_NOT_FOUND', 'Oferta não encontrada.');
    const marketplace = selectedMarketplace(deal.marketplace);
    if (!await this.repository.getAccount(userId, marketplace)) return fail('AFFILIATE_ACCOUNT_NOT_VALID', `Conecte e valide sua conta ${marketplaceNames[marketplace]} para acessar o Radar.`);
    return ok(deal);
  }
  async prepare(userId: string, id: string): Promise<AppResult<{ product: ProductRecord; created: boolean }>> {
    const deal = await this.repository.getDeal(userId, id); if (!deal) return fail('RADAR_DEAL_NOT_FOUND', 'Oferta não encontrada.');
    const marketplace = selectedMarketplace(deal.marketplace);
    if (!await this.repository.getAccount(userId, marketplace)) return fail('AFFILIATE_ACCOUNT_NOT_VALID', `Conecte e valide sua conta ${marketplaceNames[marketplace]} para preparar esta promoção.`);
    const prepared = await this.repository.prepareProduct(userId, deal);
    if (prepared.created) { await this.repository.createConversion(userId, prepared.product.id, deal.productUrl); this.conversions.kick(); await this.repository.recordEvent(userId, 'radar.deal.prepared', { dealId: id, productId: prepared.product.id, marketplace }); }
    await this.media?.addMarketplaceImages(userId, prepared.product.id, id, [deal.imageUrl, ...(deal.imageUrls ?? [])]);
    return ok(prepared);
  }
}

export class MarketplaceDiscoveryScheduler {
  private timer: NodeJS.Timeout | null = null; private running = false;
  constructor(private readonly service: MarketplaceRadarService, private readonly repository: MarketplaceRadarRepository,
    private readonly timeZone = process.env.MARKETPLACE_RADAR_TIME_ZONE ?? 'America/Sao_Paulo',
    private readonly dailyHour = Math.min(23, Math.max(0, Number(process.env.MARKETPLACE_RADAR_DAILY_HOUR ?? 12)))) {}
  start() { if (this.timer) return; this.scheduleNext(); }
  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
  async run() { if (this.running) return; this.running = true; try { for (const account of await this.repository.listDueAccounts()) await this.service.refresh(account.userId, account.marketplace, 'scheduler'); } finally { this.running = false; } }
  private scheduleNext() {
    const delay = Math.max(1_000, nextRadarRunAt(new Date(), this.timeZone, this.dailyHour).getTime() - Date.now());
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run().finally(() => this.scheduleNext());
    }, delay);
    this.timer.unref?.();
  }
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };
function zonedParts(date: Date, timeZone: string): ZonedParts {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date).reduce<Record<string, number>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
    return result;
  }, {});
  return values as ZonedParts;
}
function zonedDateTimeToUtc(parts: ZonedParts, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let candidate = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += target - represented;
  }
  return new Date(candidate);
}
export function nextRadarRunAt(now: Date, timeZone = 'America/Sao_Paulo', dailyHour = 12): Date {
  const local = zonedParts(now, timeZone);
  const isPastToday = local.hour > dailyHour || (local.hour === dailyHour && (local.minute > 0 || local.second > 0));
  const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day + (isPastToday ? 1 : 0)));
  return zonedDateTimeToUtc({
    year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1, day: localDate.getUTCDate(),
    hour: dailyHour, minute: 0, second: 0,
  }, timeZone);
}
