import { extractMercadoLivreItemId, MercadoLivreAffiliateLinkValidator } from '../AffiliateLinkValidator';
import { MercadoLivreCompanionError } from '../companion/types';

type Fetcher = typeof fetch;

function allowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === 'meli.la' || host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br');
}

export class MercadoLivreAffiliateDestinationVerifier {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly validator = new MercadoLivreAffiliateLinkValidator(),
    private readonly timeoutMs = 8_000,
  ) {}

  async verify(sourceUrl: string, candidate: unknown): Promise<string> {
    const affiliateUrl = this.validator.validate(sourceUrl, candidate);
    const affiliate = new URL(affiliateUrl);
    if (affiliate.hostname !== 'meli.la') return affiliateUrl;
    let current = affiliate;
    for (let redirect = 0; redirect < 6; redirect += 1) {
      if (current.protocol !== 'https:' || !allowedHost(current.hostname)) throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O link saiu dos domínios permitidos.');
      let response: Response;
      try {
        response = await this.fetcher(current, {
          method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs),
          headers: { accept: 'text/html,application/xhtml+xml' },
        });
      } catch {
        throw new MercadoLivreCompanionError('TEMPORARY_ERROR', 'Não foi possível validar o destino do link curto.', true);
      }
      const location = response.headers.get('location');
      if (location && response.status >= 300 && response.status < 400) {
        current = new URL(location, current);
        continue;
      }
      const sourceItem = extractMercadoLivreItemId(sourceUrl);
      const destinationItem = extractMercadoLivreItemId(current.toString()) ?? extractMercadoLivreItemId(response.url);
      if (!sourceItem || !destinationItem || sourceItem !== destinationItem) {
        throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O link gerado não aponta para o produto original.');
      }
      return affiliateUrl;
    }
    throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O link gerado possui redirecionamentos demais.');
  }
}
