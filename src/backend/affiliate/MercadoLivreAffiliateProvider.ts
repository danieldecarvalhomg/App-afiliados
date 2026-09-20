import type { AffiliateLinkProvider } from '../../domain/affiliate/AffiliateLinkProvider';
import type { AffiliateProviderInput, AffiliateProviderResult } from '../../domain/affiliate/types';
import type { MercadoLivreGenerationAdapter } from './mercado-livre/generationTypes';
import { MercadoLivreCompanionError } from './mercado-livre/companion/types';

export class MercadoLivreAffiliateProvider implements AffiliateLinkProvider {
  readonly platform = 'mercado_livre' as const;
  readonly providerName = 'mercado_livre_unofficial_v1';
  constructor(private readonly adapter: MercadoLivreGenerationAdapter) {}
  async convert(input: AffiliateProviderInput): Promise<AffiliateProviderResult> {
    if (!input.userId || !input.affiliateAccountId) return { success: false, convertedUrl: null, provider: this.providerName, errorCode: 'AUTH_REQUIRED' };
    try {
      const result = await this.adapter.generate(input.userId, input.affiliateAccountId, input.url, input.credentials, input.trackingLabel, input.requestId ?? null);
      return { success: true, convertedUrl: result.affiliateUrl, provider: result.provider, itemId: result.itemId, trackingLabel: result.trackingLabel };
    } catch (error) {
      const companionError = error instanceof MercadoLivreCompanionError ? error : new MercadoLivreCompanionError('UNKNOWN_ERROR','Falha ao gerar link.');
      return { success: false, convertedUrl: null, provider: this.providerName, errorCode: companionError.code, transient: companionError.transient };
    }
  }
}
