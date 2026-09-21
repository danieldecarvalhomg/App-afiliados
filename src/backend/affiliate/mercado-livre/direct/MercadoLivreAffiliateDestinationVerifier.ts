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
    // Uma origem meli.la já é um identificador curto aceito pelo Portal. Não
    // tente abri-la para descobrir o produto: o CDN pode bloquear requisições
    // server-to-server mesmo quando o link funciona no celular.
    if (new URL(sourceUrl).hostname.toLowerCase() === 'meli.la') return affiliateUrl;
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
      // URLs /up/MLBU... identificam um produto de catálogo. O link curto pode
      // terminar em um anúncio MLB concreto escolhido pelo próprio Mercado Livre.
      // Mantemos a comparação estrita para anúncios e entre IDs de catálogo.
      const universalToListing = sourceItem?.startsWith('MLBU') && destinationItem?.startsWith('MLB')
        && !destinationItem.startsWith('MLBU');
      if (!sourceItem || !destinationItem || (sourceItem !== destinationItem && !universalToListing)) {
        throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O link gerado não aponta para o produto original.');
      }
      return affiliateUrl;
    }
    throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O link gerado possui redirecionamentos demais.');
  }
}
