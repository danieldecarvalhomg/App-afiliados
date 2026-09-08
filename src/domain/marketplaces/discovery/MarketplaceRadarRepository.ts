import type { AffiliateAccountWithCredentials } from '../../affiliate/AffiliateRepository';
import type { ProductRecord } from '../../products/types';
import type { MarketplaceDeal, RadarFilters, RadarPage } from './types';
import type { ConfigurableAffiliatePlatform } from '../../affiliate/types';
import type { AffiliateProviderCredentials } from '../../affiliate/types';

export interface RefreshLock { acquired: boolean; errorCode: string | null; }
export interface MarketplaceRadarRepository {
  getAccount(userId: string, marketplace: ConfigurableAffiliatePlatform): Promise<AffiliateAccountWithCredentials | null>;
  getValidationStatus(userId: string, marketplace: ConfigurableAffiliatePlatform): Promise<'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error'>;
  updateCredentials?(userId: string, marketplace: ConfigurableAffiliatePlatform, credentials: AffiliateProviderCredentials): Promise<void>;
  acquireRefresh(userId: string, marketplace: ConfigurableAffiliatePlatform, trigger: 'manual' | 'scheduler'): Promise<RefreshLock>;
  finishRefresh(userId: string, marketplace: ConfigurableAffiliatePlatform, outcome: { errorCode?: string; errorMessage?: string; metrics: Record<string, number> }): Promise<void>;
  listDueAccounts(): Promise<Array<{ userId: string; marketplace: ConfigurableAffiliatePlatform }>>;
  upsertDeals(userId: string, accountId: string, deals: MarketplaceDeal[]): Promise<{ inserted: number; updated: number; unchanged: number }>;
  markMissingDeals(userId: string, marketplace: ConfigurableAffiliatePlatform, seenExternalIds: string[]): Promise<number>;
  listDeals(userId: string, filters: RadarFilters): Promise<RadarPage>;
  getDeal(userId: string, dealId: string): Promise<MarketplaceDeal | null>;
  prepareProduct(userId: string, deal: MarketplaceDeal): Promise<{ product: ProductRecord; created: boolean }>;
  createConversion(userId: string, sourceReferenceId: string, originalUrl: string): Promise<void>;
  recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
}
