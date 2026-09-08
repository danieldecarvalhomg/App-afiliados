import { createHash } from 'node:crypto';
import type { AffiliateLinkProvider } from '../../domain/affiliate/AffiliateLinkProvider';
import type { AffiliateProviderInput, AffiliateProviderResult } from '../../domain/affiliate/types';

type Fetcher = typeof fetch;
export class ShopeeAffiliateProvider implements AffiliateLinkProvider {
  readonly platform = 'shopee' as const;
  readonly providerName = 'shopee_open_api';
  constructor(private readonly fetcher: Fetcher = fetch,
    private readonly endpoint = process.env.SHOPEE_AFFILIATE_API_URL ?? 'https://open-api.affiliate.shopee.com.br/graphql') {}
  async convert(input: AffiliateProviderInput): Promise<AffiliateProviderResult> {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const subIds = input.subIds?.slice(0, 5).filter(Boolean) ?? [];
      const query = `mutation { generateShortLink(input: { originUrl: ${JSON.stringify(input.url)}, subIds: ${JSON.stringify(subIds)} }) { shortLink } }`;
      const body = JSON.stringify({ query }); const timestamp = Math.floor(Date.now() / 1000);
      const signature = createHash('sha256').update(`${input.credentials.appId}${timestamp}${body}${input.credentials.secret}`).digest('hex');
      const response = await this.fetcher(this.endpoint, { method: 'POST', signal: controller.signal, body,
        headers: { 'content-type': 'application/json', authorization: `SHA256 Credential=${input.credentials.appId}, Timestamp=${timestamp}, Signature=${signature}` } });
      if (!response.ok) return { success: false, convertedUrl: null, provider: this.providerName,
        errorCode: response.status === 429 ? 'SHOPEE_RATE_LIMITED' : 'SHOPEE_HTTP_ERROR', transient: response.status === 429 || response.status >= 500 };
      const payload = await response.json() as { data?: { generateShortLink?: { shortLink?: string } }; errors?: unknown[] };
      const convertedUrl = payload.data?.generateShortLink?.shortLink ?? null;
      if (!convertedUrl || !/^https?:\/\//iu.test(convertedUrl)) return { success: false, convertedUrl: null, provider: this.providerName,
        errorCode: payload.errors?.length ? 'SHOPEE_API_ERROR' : 'SHOPEE_INVALID_RESPONSE' };
      return { success: true, convertedUrl, provider: this.providerName };
    } catch (error) {
      return { success: false, convertedUrl: null, provider: this.providerName,
        errorCode: error instanceof Error && error.name === 'AbortError' ? 'SHOPEE_TIMEOUT' : 'SHOPEE_NETWORK_ERROR', transient: true };
    } finally { clearTimeout(timer); }
  }
}
