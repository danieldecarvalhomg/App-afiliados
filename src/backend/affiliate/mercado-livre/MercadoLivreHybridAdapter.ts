import type { MercadoLivreBrowserCompanionAdapter } from './companion/MercadoLivreBrowserCompanionAdapter';
import { MercadoLivreCompanionError } from './companion/types';
import type { MercadoLivreRemoteBrowserService } from './remote/MercadoLivreRemoteBrowserService';

export interface MercadoLivreGenerationResult {
  affiliateUrl: string;
  itemId: string | null;
  trackingLabel: string | null;
  cached: boolean;
}

/**
 * O navegador remoto é o caminho principal. A extensão permanece como fallback
 * durante a migração e para instalações sem infraestrutura remota configurada.
 */
export class MercadoLivreHybridAdapter {
  constructor(
    private readonly remote: MercadoLivreRemoteBrowserService | null,
    private readonly companion: MercadoLivreBrowserCompanionAdapter | null,
  ) {}

  async generate(userId: string, sourceUrl: string, trackingLabel?: string | null, requestId?: string | null): Promise<MercadoLivreGenerationResult> {
    let remoteFailure: MercadoLivreCompanionError | null = null;
    if (this.remote?.configured()) {
      try {
        return await this.remote.generate(userId, sourceUrl, trackingLabel);
      } catch (error) {
        remoteFailure = error instanceof MercadoLivreCompanionError
          ? error
          : new MercadoLivreCompanionError('REMOTE_BROWSER_UNAVAILABLE' as any, 'Navegador remoto indisponível.', true);
      }
    }
    if (this.companion) return this.companion.generate(userId, sourceUrl, trackingLabel, requestId);
    throw remoteFailure ?? new MercadoLivreCompanionError('COMPANION_NOT_PAIRED', 'Nenhum motor de geração está disponível.');
  }
}

