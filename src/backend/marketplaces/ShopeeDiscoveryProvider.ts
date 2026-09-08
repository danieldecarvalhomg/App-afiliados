import { createHash } from 'node:crypto';
import type { MarketplaceDiscoveryProvider } from '../../domain/marketplaces/discovery/MarketplaceDiscoveryProvider';
import type { DiscoveryPage, DiscoveryRequest, MarketplaceDeal } from '../../domain/marketplaces/discovery/types';

type Fetcher = typeof fetch;
const number = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
};
const percent = (value: unknown): number | null => {
  const n = number(typeof value === 'string' ? value.replace('%','') : value);
  if (n == null) return null;
  return Math.round((n <= 1 ? n * 100 : n) * 10_000) / 10_000;
};
const money = (value: unknown): number | null => { const n = number(value); return n == null ? null : Math.round(n * 100) / 100; };

/** Provider real da Shopee Affiliate Open API. Nenhum campo ausente é inferido. */
export class ShopeeDiscoveryProvider implements MarketplaceDiscoveryProvider {
  readonly marketplace = 'shopee' as const;
  constructor(private readonly fetcher: Fetcher = fetch,
    private readonly endpoint = process.env.SHOPEE_AFFILIATE_API_URL ?? 'https://open-api.affiliate.shopee.com.br/graphql') {}
  async getDeals(request: DiscoveryRequest): Promise<DiscoveryPage> { return this.query(request); }
  async searchDeals(request: DiscoveryRequest): Promise<DiscoveryPage> { return this.query(request); }
  async getDeal(externalProductId: string, request: DiscoveryRequest): Promise<MarketplaceDeal | null> {
    if (!/^\d+$/u.test(externalProductId)) return null;
    const result = await this.query({ ...request, keyword: undefined, page: 1, limit: 1 }, externalProductId);
    return result.deals[0] ?? null;
  }
  private async query(request: DiscoveryRequest, itemId?: string): Promise<DiscoveryPage> {
    const page = Math.max(1, request.page ?? 1), limit = Math.min(40, Math.max(1, request.limit ?? 24));
    const args = [`listType: 0`, `sortType: 1`, `page: ${page}`, `limit: ${limit}`];
    if (request.keyword?.trim()) args.push(`keyword: ${JSON.stringify(request.keyword.trim())}`);
    if (itemId) args.push(`itemId: ${itemId}`);
    const query = `{ productOfferV2(${args.join(', ')}) { nodes { itemId productName productLink offerLink imageUrl price priceMin priceMax commissionRate commission shopId sales ratingStar productCatIds priceDiscountRate } pageInfo { page limit hasNextPage } } }`;
    const body = JSON.stringify({ query }); const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha256').update(`${request.credentials.appId}${timestamp}${body}${request.credentials.secret}`).digest('hex');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetcher(this.endpoint, { method: 'POST', body, signal: controller.signal, headers: {
        'content-type': 'application/json', authorization: `SHA256 Credential=${request.credentials.appId}, Timestamp=${timestamp}, Signature=${signature}`,
      } });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'SHOPEE_DISCOVERY_UNAUTHORIZED' : `SHOPEE_DISCOVERY_HTTP_${response.status}`);
      const payload = await response.json() as any;
      if (payload.errors?.length) throw new Error('SHOPEE_DISCOVERY_API_ERROR');
      const connection = payload.data?.productOfferV2; const discoveredAt = new Date().toISOString();
      const deals = (connection?.nodes ?? []).map((node: any): MarketplaceDeal | null => {
        const externalProductId = node.itemId == null ? null : String(node.itemId);
        const productUrl = typeof node.productLink === 'string' ? node.productLink : typeof node.offerLink === 'string' ? node.offerLink : null;
        if (!externalProductId || !node.productName || !productUrl) return null;
        const price = money(node.price ?? node.priceMin);
        // priceMin/priceMax delimitam a faixa atual entre variações do item;
        // priceMax não é evidência de preço anterior.
        const discount = number(node.priceDiscountRate);
        return { marketplace: 'shopee', externalProductId, externalShopId: node.shopId == null ? null : String(node.shopId), title: String(node.productName),
          imageUrl: typeof node.imageUrl === 'string' ? node.imageUrl : null, productUrl, price, originalPrice: null,
          estimatedOriginalPrice: null, discountPercent: discount, currency: 'BRL', commissionRate: percent(node.commissionRate), commissionAmount: money(node.commission),
          salesCount: number(node.sales), rating: number(node.ratingStar), reviewsCount: null, coupon: null,
          freeShipping: null, category: null, discoveredAt };
      }).filter(Boolean) as MarketplaceDeal[];
      return { deals, hasNextPage: Boolean(connection?.pageInfo?.hasNextPage), page: Number(connection?.pageInfo?.page ?? page) };
    } finally { clearTimeout(timer); }
  }
}
