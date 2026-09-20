import type { MercadoLivreBrowserCompanionAdapter } from './companion/MercadoLivreBrowserCompanionAdapter';
import { MercadoLivreCompanionError } from './companion/types';
import type { AffiliateProviderCredentials } from '../../../domain/affiliate/types';
import type { MercadoLivreDirectAdapter } from './direct/MercadoLivreDirectAdapter';
import type { MercadoLivreGenerationResult } from './generationTypes';
import type { MercadoLivreRemoteBrowserService } from './remote/MercadoLivreRemoteBrowserService';
export type { MercadoLivreGenerationResult } from './generationTypes';

/**
 * O motor server-to-server é o caminho principal. Navegador remoto e extensão
 * permanecem como contingência durante a migração.
 */
export class MercadoLivreHybridAdapter {
  constructor(
    private readonly direct: MercadoLivreDirectAdapter | null,
    private readonly remote: MercadoLivreRemoteBrowserService | null,
    private readonly companion: MercadoLivreBrowserCompanionAdapter | null,
  ) {}

  async generate(userId: string, affiliateAccountId: string, sourceUrl: string, credentials: AffiliateProviderCredentials, trackingLabel?: string | null, requestId?: string | null): Promise<MercadoLivreGenerationResult> {
    let directFailure: MercadoLivreCompanionError | null = null;
    if (this.direct?.configured(credentials)) {
      try {
        return await this.direct.generate(userId, affiliateAccountId, sourceUrl, credentials, trackingLabel);
      } catch (error) {
        directFailure = error instanceof MercadoLivreCompanionError
          ? error : new MercadoLivreCompanionError('DIRECT_ENGINE_UNAVAILABLE', 'Motor próprio indisponível.', true);
        if (['LINK_VALIDATION_FAILED', 'INVALID_AFFILIATE_URL'].includes(directFailure.code)) throw directFailure;
        if (process.env.MERCADO_LIVRE_LEGACY_FALLBACK !== 'true') throw directFailure;
      }
    }
    let remoteFailure: MercadoLivreCompanionError | null = null;
    if (this.remote?.configured()) {
      try {
        const result = await this.remote.generate(userId, sourceUrl, trackingLabel);
        return { ...result, provider: 'mercado_livre_remote_browser_v1' };
      } catch (error) {
        remoteFailure = error instanceof MercadoLivreCompanionError
          ? error
          : new MercadoLivreCompanionError('REMOTE_BROWSER_UNAVAILABLE' as any, 'Navegador remoto indisponível.', true);
      }
    }
    if (this.companion) {
      const result = await this.companion.generate(userId, sourceUrl, trackingLabel, requestId);
      return { ...result, provider: 'mercado_livre_browser_companion_v1' };
    }
    throw directFailure ?? remoteFailure ?? new MercadoLivreCompanionError('COMPANION_NOT_PAIRED', 'Nenhum motor de geração está disponível.');
  }
}
