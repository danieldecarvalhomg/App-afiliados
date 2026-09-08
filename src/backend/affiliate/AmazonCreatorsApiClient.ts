import type { AffiliateProviderCredentials } from '../../domain/affiliate/types';

type Fetcher = typeof fetch;

export class AmazonCreatorsApiClient {
  constructor(private readonly fetcher: Fetcher = fetch,
    private readonly tokenEndpoint = 'https://api.amazon.com/auth/o2/token',
    private readonly apiEndpoint = 'https://creatorsapi.amazon') {}

  async validate(credentials: AffiliateProviderCredentials): Promise<void> {
    await this.searchItems(credentials, 'ofertas', 1, 1);
  }

  async getItems(credentials: AffiliateProviderCredentials, itemIds: string[]): Promise<any[]> {
    const payload = await this.request(credentials, '/catalog/v1/getItems', {
      itemIds, itemIdType: 'ASIN', marketplace: 'www.amazon.com.br', partnerTag: credentials.partnerTag,
      resources: ['images.primary.large', 'itemInfo.title', 'offersV2.listings.price', 'offersV2.listings.savingBasis'],
    });
    return payload?.itemsResult?.items ?? [];
  }

  async searchItems(credentials: AffiliateProviderCredentials, keywords: string, itemCount = 10, itemPage = 1): Promise<any> {
    return this.request(credentials, '/catalog/v1/searchItems', {
      keywords, itemCount: Math.min(10, Math.max(1, itemCount)), itemPage: Math.max(1, itemPage),
      marketplace: 'www.amazon.com.br', partnerTag: credentials.partnerTag, searchIndex: 'All',
      resources: ['images.primary.large', 'itemInfo.title', 'offersV2.listings.price', 'offersV2.listings.savingBasis'],
    });
  }

  private async request(credentials: AffiliateProviderCredentials, path: string, body: Record<string, unknown>): Promise<any> {
    if (!credentials.partnerTag) throw new Error('AMAZON_INVALID_CREDENTIALS');
    const tokenResponse = await this.fetcher(this.tokenEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      grant_type: 'client_credentials', client_id: credentials.appId, client_secret: credentials.secret, scope: 'creatorsapi::default',
    }) });
    if (!tokenResponse.ok) throw new Error(tokenResponse.status === 401 || tokenResponse.status === 403 ? 'AMAZON_UNAUTHORIZED' : `AMAZON_TOKEN_HTTP_${tokenResponse.status}`);
    const token = await tokenResponse.json() as { access_token?: string };
    if (!token.access_token) throw new Error('AMAZON_INVALID_CREDENTIALS');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await this.fetcher(`${this.apiEndpoint}${path}`, { method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json', 'x-marketplace': 'www.amazon.com.br' }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'AMAZON_UNAUTHORIZED' : `AMAZON_API_HTTP_${response.status}`);
      const payload = await response.json() as any;
      if (payload?.errors?.length && !payload?.itemsResult && !payload?.searchResult) throw new Error('AMAZON_API_ERROR');
      return payload;
    } finally { clearTimeout(timer); }
  }
}
