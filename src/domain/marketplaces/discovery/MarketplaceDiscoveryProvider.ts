import type { AffiliatePlatform } from '../../affiliate/types';
import type { DiscoveryPage, DiscoveryRequest, MarketplaceDeal } from './types';

export interface MarketplaceDiscoveryProvider {
  readonly marketplace: AffiliatePlatform;
  getDeals(request: DiscoveryRequest): Promise<DiscoveryPage>;
  searchDeals(request: DiscoveryRequest): Promise<DiscoveryPage>;
  getDeal(externalProductId: string, request: DiscoveryRequest): Promise<MarketplaceDeal | null>;
}
