import { NOT_IMPLEMENTED, type AppResult } from '../../errors';
import type { MarketplaceDeal } from './types';

/** Contrato do Radar 3D. Não produz mocks nem consulta marketplaces no 3C. */
export class MarketplaceDiscoveryService {
  getDeals(): Promise<AppResult<MarketplaceDeal[]>> { return Promise.resolve(NOT_IMPLEMENTED); }
  searchDeals(_query: string): Promise<AppResult<MarketplaceDeal[]>> { return Promise.resolve(NOT_IMPLEMENTED); }
  getDeal(_externalProductId: string): Promise<AppResult<MarketplaceDeal | null>> { return Promise.resolve(NOT_IMPLEMENTED); }
}
