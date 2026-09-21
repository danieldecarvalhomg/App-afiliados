import type { AffiliateProviderCredentials } from '../../../../domain/affiliate/types';
import { extractMercadoLivreGeneratedUrls, selectMercadoLivreTrackingTag } from '../AffiliateApiPayload';
import { MercadoLivreCompanionError } from '../companion/types';

type Fetcher = typeof fetch;

function apiError(status: number, payload: unknown): MercadoLivreCompanionError {
  const value = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const raw = `${value.code ?? ''} ${value.error ?? ''} ${value.message ?? ''}`.toUpperCase();
  if (status === 401 || /UNAUTHORIZED|AUTH|LOGIN|SESSION/u.test(raw)) {
    return new MercadoLivreCompanionError('AUTH_REQUIRED', 'A sessão do Mercado Livre expirou.', false, status);
  }
  if (status === 429 || /RATE.?LIMIT|TOO MANY/u.test(raw)) {
    return new MercadoLivreCompanionError('RATE_LIMITED', 'O Mercado Livre limitou temporariamente as conversões.', true, status);
  }
  if (/CAPTCHA|ROBOT|HUMAN/u.test(raw)) return new MercadoLivreCompanionError('CAPTCHA_REQUIRED', 'O Mercado Livre solicitou confirmação humana.', false, status);
  if (/TWO.?FACTOR|2FA|VERIFICATION.?CODE/u.test(raw)) return new MercadoLivreCompanionError('TWO_FACTOR_REQUIRED', 'O Mercado Livre solicitou confirmação em duas etapas.', false, status);
  const transient = status === 403 || status >= 500;
  return new MercadoLivreCompanionError(transient ? 'TEMPORARY_ERROR' : 'GENERATION_FAILED',
    'O Mercado Livre não concluiu a geração.', transient, status);
}

export class MercadoLivreDirectClient {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly endpoint = process.env.MERCADO_LIVRE_AFFILIATE_API_URL
      ?? 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates',
    private readonly timeoutMs = Math.max(2_000, Number(process.env.MERCADO_LIVRE_DIRECT_TIMEOUT_MS ?? 15_000)),
  ) {}

  configured(credentials: AffiliateProviderCredentials): boolean {
    return Boolean(credentials.sessionCookie?.trim() && credentials.trackingTag?.trim());
  }

  async validate(credentials: AffiliateProviderCredentials): Promise<void> {
    const payload = await this.request('/getTags', { method: 'GET' }, credentials);
    const selected = selectMercadoLivreTrackingTag(payload, credentials.trackingTag);
    if (!selected || selected !== credentials.trackingTag?.trim()) {
      throw new MercadoLivreCompanionError('DIRECT_SESSION_INVALID', 'A etiqueta configurada não está disponível nesta conta.');
    }
  }

  async createAffiliateLinks(credentials: AffiliateProviderCredentials, productUrls: string[], requestedLabel?: string | null): Promise<{ urls: string[]; trackingTag: string }> {
    if (!productUrls.length || productUrls.length > 150) {
      throw new MercadoLivreCompanionError('LINK_VALIDATION_FAILED', 'O lote deve conter entre 1 e 150 links.');
    }
    const tagsPayload = await this.request('/getTags', { method: 'GET' }, credentials);
    // A etiqueta sincronizada pertence à conta e é a fonte de atribuição.
    // Rótulos internos como "promofy_manual" não podem substituí-la.
    const preferredTag = credentials.trackingTag?.trim() || requestedLabel?.trim() || null;
    const trackingTag = selectMercadoLivreTrackingTag(tagsPayload, preferredTag);
    if (!trackingTag) throw new MercadoLivreCompanionError('DIRECT_SESSION_INVALID', 'Nenhuma etiqueta de afiliado está disponível.');
    const generated = await this.create(credentials, productUrls, trackingTag);
    if (generated.length === productUrls.length) return { urls: generated, trackingTag };
    if (productUrls.length === 1) throw new MercadoLivreCompanionError('GENERATION_FAILED', 'O Mercado Livre retornou uma resposta incompleta.', true);
    const urls: string[] = [];
    for (const productUrl of productUrls) {
      const single = await this.create(credentials, [productUrl], trackingTag);
      if (!single[0]) throw new MercadoLivreCompanionError('GENERATION_FAILED', 'O Mercado Livre não gerou um dos links.', true);
      urls.push(single[0]);
    }
    return { urls, trackingTag };
  }

  private async create(credentials: AffiliateProviderCredentials, productUrls: string[], tag: string): Promise<string[]> {
    const payload = await this.request('/createLink', {
      method: 'POST',
      body: JSON.stringify({ urls: productUrls, tag }),
    }, credentials);
    return extractMercadoLivreGeneratedUrls(payload);
  }

  private async request(path: string, init: RequestInit, credentials: AffiliateProviderCredentials): Promise<unknown> {
    const cookie = credentials.sessionCookie?.trim() ?? '';
    if (!cookie || /[\r\n]/u.test(cookie) || cookie.length > 32_768) {
      throw new MercadoLivreCompanionError('DIRECT_SESSION_REQUIRED', 'Conecte uma sessão válida do Mercado Livre.');
    }
    try {
      const response = await this.fetcher(`${this.endpoint}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: {
          accept: 'application/json',
          'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'cache-control': 'no-cache',
          'content-type': 'application/json',
          cookie,
          origin: 'https://www.mercadolivre.com.br',
          pragma: 'no-cache',
          referer: 'https://www.mercadolivre.com.br/afiliados/hub',
          'sec-ch-ua': '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
          'x-custom-origin': 'https://www.mercadolivre.com.br',
          ...init.headers,
        },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw apiError(response.status, payload);
      if (payload && typeof payload === 'object' && 'data' in payload) return (payload as { data?: unknown }).data;
      return payload;
    } catch (error) {
      if (error instanceof MercadoLivreCompanionError) throw error;
      const timeout = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
      throw new MercadoLivreCompanionError('TEMPORARY_ERROR', timeout ? 'A conversão excedeu o tempo limite.' : 'Não foi possível acessar o Mercado Livre.', true);
    }
  }
}
