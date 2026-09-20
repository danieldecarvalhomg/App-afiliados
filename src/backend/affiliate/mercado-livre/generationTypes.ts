import type { AffiliateProviderCredentials } from '../../../domain/affiliate/types';

export interface MercadoLivreGenerationResult {
  affiliateUrl: string;
  itemId: string | null;
  trackingLabel: string | null;
  cached: boolean;
  provider: string;
}

export interface MercadoLivreGenerationAdapter {
  generate(
    userId: string,
    affiliateAccountId: string,
    sourceUrl: string,
    credentials: AffiliateProviderCredentials,
    trackingLabel?: string | null,
    requestId?: string | null,
  ): Promise<MercadoLivreGenerationResult>;
}
