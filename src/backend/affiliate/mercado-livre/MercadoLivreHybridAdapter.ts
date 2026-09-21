import { MercadoLivreCompanionError } from './companion/types';
import type { AffiliateProviderCredentials } from '../../../domain/affiliate/types';
import type { MercadoLivreDirectAdapter } from './direct/MercadoLivreDirectAdapter';
import { isMercadoLivreProductUrl } from './AffiliateLinkValidator';
import type { MercadoLivreLinkRecoveryService } from './MercadoLivreLinkRecoveryService';
import type { MercadoLivreGenerationResult } from './generationTypes';
export type { MercadoLivreGenerationResult } from './generationTypes';

/**
 * O motor server-to-server é o único caminho de conversão.
 *
 * O Companion continua existindo para a sincronização inicial da sessão, mas
 * nunca deve receber jobs de geração. Assim, depois da primeira conexão, a
 * conversão do celular, do Radar e do worker não depende de um Chrome aberto.
 */
export class MercadoLivreHybridAdapter {
  constructor(
    private readonly direct: MercadoLivreDirectAdapter | null,
    private readonly recovery?: MercadoLivreLinkRecoveryService,
  ) {}

  async generate(userId: string, affiliateAccountId: string, sourceUrl: string, credentials: AffiliateProviderCredentials, trackingLabel?: string | null, _requestId?: string | null): Promise<MercadoLivreGenerationResult> {
    if (!this.direct || !this.direct.configured(credentials)) {
      throw new MercadoLivreCompanionError('DIRECT_SESSION_REQUIRED', 'Faça a conexão inicial do Mercado Livre para ativar a conversão no backend.');
    }
    let conversionUrl = sourceUrl;
    if (!isMercadoLivreProductUrl(conversionUrl)) {
      const recovered = await this.recovery?.recover(conversionUrl, userId);
      if (!recovered) {
        throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'Não foi possível identificar o produto deste link curto.');
      }
      conversionUrl = recovered.productUrl;
    }
    return this.direct.generate(userId, affiliateAccountId, conversionUrl, credentials, trackingLabel);
  }
}
