import type { AffiliatePlatform, AffiliateProviderInput, AffiliateProviderResult } from './types';

export interface AffiliateLinkProvider {
  readonly platform: AffiliatePlatform;
  readonly providerName: string;
  convert(input: AffiliateProviderInput): Promise<AffiliateProviderResult>;
}
