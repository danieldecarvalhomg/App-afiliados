import type { MarketplaceDiscoveryProvider } from '../../domain/marketplaces/discovery/MarketplaceDiscoveryProvider';
import type { DiscoveryPage, DiscoveryRequest, MarketplaceDeal } from '../../domain/marketplaces/discovery/types';
import type { AffiliateProviderCredentials } from '../../domain/affiliate/types';

type Fetcher = typeof fetch;
const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export interface MercadoLivreRemoteDiscovery {
  discoverDeals(userId: string, limit?: number, forceRefresh?: boolean): Promise<MarketplaceDeal[]>;
}

export class MercadoLivreDiscoveryProvider implements MarketplaceDiscoveryProvider {
  readonly marketplace = 'mercado_livre' as const;
  private sharedRemoteCatalog: { expiresAt: number; deals: MarketplaceDeal[] } | null = null;
  private sharedRemoteRefresh: Promise<MarketplaceDeal[]> | null = null;
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly endpoint = 'https://api.mercadolibre.com',
    private readonly remoteDiscovery?: MercadoLivreRemoteDiscovery,
  ) {}
  async validate(credentials: AffiliateProviderCredentials): Promise<void> {
    const response = await this.authorizedFetch(`${this.endpoint}/users/me`, credentials);
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'MERCADO_LIVRE_UNAUTHORIZED' : `MERCADO_LIVRE_HTTP_${response.status}`);
  }
  getDeals(request: DiscoveryRequest) { return this.searchDeals({ ...request, keyword: request.keyword ?? 'ofertas' }); }
  async searchDeals(request: DiscoveryRequest): Promise<DiscoveryPage> {
    const page = Math.max(1, request.page ?? 1), limit = Math.min(40, Math.max(1, request.limit ?? 24)), offset = (page - 1) * limit;
    const query = new URLSearchParams({ q: request.keyword?.trim() || 'ofertas', limit: String(limit), offset: String(offset) });
    if (request.category?.trim()) query.set('category', request.category.trim());
    const response = await this.authorizedFetch(`${this.endpoint}/sites/MLB/search?${query}`, request.credentials);
    if (!response.ok) {
      if (request.userId && this.remoteDiscovery && (response.status === 401 || response.status === 403)) {
        const deals = await this.getSharedRemoteDeals(request.userId, limit);
        return { deals, page: 1, hasNextPage: false };
      }
      throw new Error(response.status === 401 || response.status === 403 ? 'MERCADO_LIVRE_UNAUTHORIZED' : `MERCADO_LIVRE_DISCOVERY_HTTP_${response.status}`);
    }
    const payload = await response.json() as any, discoveredAt = new Date().toISOString();
    const deals = (payload?.results ?? []).map((item: any): MarketplaceDeal | null => this.map(item, discoveredAt)).filter(Boolean) as MarketplaceDeal[];
    return { deals, page, hasNextPage: offset + deals.length < Number(payload?.paging?.total ?? deals.length) };
  }

  /**
   * A Central de Afiliados exibe um catálogo, mas exige uma sessão autenticada
   * para ser lida. O catálogo não contém o link afiliado final, então uma única
   * leitura pode ser compartilhada com segurança. A conversão continua fora
   * deste cache e usa a sessão individual de cada conta.
   */
  private async getSharedRemoteDeals(userId: string, limit: number): Promise<MarketplaceDeal[]> {
    const now = Date.now();
    if (this.sharedRemoteCatalog && this.sharedRemoteCatalog.expiresAt > now) {
      return this.sharedRemoteCatalog.deals.slice(0, limit);
    }
    if (!this.sharedRemoteRefresh) {
      const cacheMs = Math.max(60_000, Number(process.env.MERCADO_LIVRE_SHARED_RADAR_CACHE_MS ?? 5 * 60_000));
      this.sharedRemoteRefresh = this.remoteDiscovery!.discoverDeals(userId, 40, false)
        .then((deals) => {
          this.sharedRemoteCatalog = { deals: [...deals], expiresAt: Date.now() + cacheMs };
          return this.sharedRemoteCatalog.deals;
        })
        .finally(() => { this.sharedRemoteRefresh = null; });
    }
    return (await this.sharedRemoteRefresh).slice(0, limit);
  }
  async getDeal(externalProductId: string, request: DiscoveryRequest): Promise<MarketplaceDeal | null> {
    if (!/^MLB\d+$/iu.test(externalProductId)) return null;
    const response = await this.authorizedFetch(`${this.endpoint}/items/${encodeURIComponent(externalProductId)}`, request.credentials);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'MERCADO_LIVRE_UNAUTHORIZED' : `MERCADO_LIVRE_DISCOVERY_HTTP_${response.status}`);
    return this.map(await response.json(), new Date().toISOString());
  }
  private map(item: any, discoveredAt: string): MarketplaceDeal | null {
    const id = typeof item?.id === 'string' ? item.id : null, url = item?.permalink;
    if (!id || !item?.title || typeof url !== 'string') return null;
    const price = number(item.price), originalPrice = number(item.original_price);
    const pictures = Array.isArray(item.pictures) ? item.pictures.map((picture: any) => picture?.secure_url ?? picture?.url).filter(Boolean) : [];
    return { marketplace: 'mercado_livre', externalProductId: id, externalShopId: item.seller?.id == null && item.seller_id == null ? null : String(item.seller?.id ?? item.seller_id),
      title: String(item.title), productUrl: url, imageUrl: item.thumbnail?.replace?.('http://','https://') ?? pictures[0] ?? null, imageUrls: pictures,
      price, originalPrice, discountPercent: price != null && originalPrice != null && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null,
      currency: 'BRL', commissionRate: null, commissionAmount: null, salesCount: number(item.sold_quantity), rating: null, reviewsCount: null,
      coupon: null, freeShipping: typeof item.shipping?.free_shipping === 'boolean' ? item.shipping.free_shipping : null, category: item.category_id ?? null, discoveredAt };
  }

  private async authorizedFetch(url: string, credentials: AffiliateProviderCredentials): Promise<Response> {
    let response = await this.fetcher(url, { headers: { authorization: `Bearer ${credentials.accessToken ?? ''}` } });
    if (response.status !== 401 || !credentials.refreshToken) return response;
    const refreshed = await this.fetcher(`${this.endpoint}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', client_id: credentials.appId,
        client_secret: credentials.secret, refresh_token: credentials.refreshToken,
      }),
    });
    if (!refreshed.ok) return response;
    const payload = await refreshed.json() as { access_token?: string; refresh_token?: string };
    if (!payload.access_token) return response;
    credentials.accessToken = payload.access_token;
    if (payload.refresh_token) credentials.refreshToken = payload.refresh_token;
    response = await this.fetcher(url, { headers: { authorization: `Bearer ${credentials.accessToken}` } });
    return response;
  }
}
