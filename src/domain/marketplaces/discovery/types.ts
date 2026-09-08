import type { AffiliatePlatform, AffiliateProviderCredentials } from '../../affiliate/types';

export type DealStatus = 'active' | 'stale' | 'unavailable';
export type RadarSort = 'score' | 'discount' | 'commission' | 'sales' | 'price' | 'recent';
export interface MarketplaceDeal {
  id?: string; userId?: string; affiliateAccountId?: string | null; marketplace: AffiliatePlatform;
  externalProductId: string; externalShopId?: string | null; title: string; imageUrl?: string | null; imageUrls?: string[]; productUrl: string;
  price?: number | null; originalPrice?: number | null; estimatedOriginalPrice?: number | null; discountPercent?: number | null;
  currency?: 'BRL' | null; commissionRate?: number | null; commissionAmount?: number | null; salesCount?: number | null;
  rating?: number | null; reviewsCount?: number | null; coupon?: string | null; freeShipping?: boolean | null; category?: string | null;
  dealScore?: number; dealScoreVersion?: 'v1'; scoreReasons?: string[]; firstSeenAt?: string; lastSeenAt?: string;
  lastUpdatedAt?: string; status?: DealStatus; discoveredAt: string;
}
export interface DiscoveryRequest { userId?: string; credentials: AffiliateProviderCredentials; keyword?: string; category?: string; page?: number; limit?: number; forceRefresh?: boolean; }
export interface DiscoveryPage { deals: MarketplaceDeal[]; hasNextPage: boolean; page: number; }
export interface RadarFilters { marketplace?: AffiliatePlatform; category?: string; minPrice?: number; maxPrice?: number; minDiscount?: number; minCommission?: number; freeShipping?: boolean; coupon?: boolean; sort?: RadarSort; cursor?: string; limit?: number; }
export interface RadarPage { items: MarketplaceDeal[]; nextCursor: string | null; affiliateStatus?: 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error'; }
