import type { MarketplaceDiscoveryProvider } from '../../domain/marketplaces/discovery/MarketplaceDiscoveryProvider';
import type { DiscoveryPage, DiscoveryRequest, MarketplaceDeal } from '../../domain/marketplaces/discovery/types';
import { AmazonCreatorsApiClient } from '../affiliate/AmazonCreatorsApiClient';

const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && Number.isFinite(Number(value)) ? Number(value) : null;
const amount = (value: any) => number(value?.amount ?? value?.displayAmount ?? value);

export class AmazonDiscoveryProvider implements MarketplaceDiscoveryProvider {
  readonly marketplace = 'amazon' as const;
  constructor(private readonly client = new AmazonCreatorsApiClient()) {}
  getDeals(request: DiscoveryRequest) { return this.searchDeals({ ...request, keyword: request.keyword ?? 'ofertas' }); }
  async searchDeals(request: DiscoveryRequest): Promise<DiscoveryPage> {
    const page = Math.max(1, request.page ?? 1), limit = Math.min(10, Math.max(1, request.limit ?? 10));
    const payload = await this.client.searchItems(request.credentials, request.keyword?.trim() || 'ofertas', limit, page);
    const discoveredAt = new Date().toISOString();
    const deals = (payload?.searchResult?.items ?? []).map((item: any): MarketplaceDeal | null => this.map(item, discoveredAt)).filter(Boolean) as MarketplaceDeal[];
    return { deals, page, hasNextPage: Number(payload?.searchResult?.totalResultCount ?? deals.length) > page * limit };
  }
  async getDeal(externalProductId: string, request: DiscoveryRequest): Promise<MarketplaceDeal | null> {
    if (!/^[A-Z0-9]{10}$/iu.test(externalProductId)) return null;
    const item = (await this.client.getItems(request.credentials, [externalProductId.toUpperCase()]))[0];
    return item ? this.map(item, new Date().toISOString()) : null;
  }
  private map(item: any, discoveredAt: string): MarketplaceDeal | null {
    const asin = typeof item?.asin === 'string' ? item.asin : null;
    const title = item?.itemInfo?.title?.displayValue ?? item?.itemInfo?.title?.displayValueLocalized;
    const url = typeof item?.detailPageURL === 'string' ? item.detailPageURL : null;
    if (!asin || !title || !url) return null;
    const listing = item?.offersV2?.listings?.[0] ?? item?.offers?.listings?.[0];
    const price = amount(listing?.price), originalPrice = amount(listing?.savingBasis);
    const discountPercent = price != null && originalPrice != null && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : null;
    return { marketplace: 'amazon', externalProductId: asin, title: String(title), productUrl: url,
      imageUrl: item?.images?.primary?.large?.url ?? item?.images?.primary?.medium?.url ?? null,
      price, originalPrice, discountPercent, currency: 'BRL', commissionRate: null, commissionAmount: null,
      salesCount: null, rating: null, reviewsCount: null, coupon: null, freeShipping: null, category: null, discoveredAt };
  }
}
