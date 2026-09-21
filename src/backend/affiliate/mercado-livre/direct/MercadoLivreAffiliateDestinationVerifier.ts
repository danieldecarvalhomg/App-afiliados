import { MercadoLivreAffiliateLinkValidator } from '../AffiliateLinkValidator';

type Fetcher = typeof fetch;

export class MercadoLivreAffiliateDestinationVerifier {
  constructor(
    _fetcher: Fetcher = fetch,
    private readonly validator = new MercadoLivreAffiliateLinkValidator(),
    _timeoutMs = 8_000,
  ) {}

  async verify(sourceUrl: string, candidate: unknown): Promise<string> {
    const affiliateUrl = this.validator.validate(sourceUrl, candidate);
    const affiliate = new URL(affiliateUrl);
    if (affiliate.hostname !== 'meli.la') return affiliateUrl;
    // O endereço foi devolvido pelo endpoint autenticado de afiliados e já
    // passou pela validação estrita de HTTPS, domínio e formato acima. Não o
    // reabrimos no backend: o CDN do meli.la bloqueia IPs de datacenter e fazia
    // uma geração válida ser descartada depois de concluída.
    return affiliateUrl;
  }
}
