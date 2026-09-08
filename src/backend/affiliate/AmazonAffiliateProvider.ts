import type { AffiliateLinkProvider } from '../../domain/affiliate/AffiliateLinkProvider';
import type { AffiliateProviderInput, AffiliateProviderResult } from '../../domain/affiliate/types';
import { AmazonCreatorsApiClient } from './AmazonCreatorsApiClient';

export function extractAmazonAsin(raw: string): string | null {
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:[/?]|$)/iu);
    return match?.[1]?.toUpperCase() ?? null;
  } catch { return null; }
}

export class AmazonAffiliateProvider implements AffiliateLinkProvider {
  readonly platform = 'amazon' as const;
  readonly providerName = 'amazon_creators_api';
  constructor(private readonly client = new AmazonCreatorsApiClient()) {}
  async convert(input: AffiliateProviderInput): Promise<AffiliateProviderResult> {
    const asin = extractAmazonAsin(input.url);
    if (!asin) return { success: false, convertedUrl: null, provider: this.providerName, errorCode: 'AMAZON_ASIN_NOT_FOUND' };
    try {
      const item = (await this.client.getItems(input.credentials, [asin]))[0];
      const convertedUrl = typeof item?.detailPageURL === 'string' ? item.detailPageURL : null;
      return convertedUrl ? { success: true, convertedUrl, provider: this.providerName }
        : { success: false, convertedUrl: null, provider: this.providerName, errorCode: 'AMAZON_ITEM_NOT_FOUND' };
    } catch (error) {
      const code = error instanceof Error ? error.message : 'AMAZON_API_ERROR';
      return { success: false, convertedUrl: null, provider: this.providerName, errorCode: code, transient: /HTTP_429|HTTP_5|TIMEOUT|NETWORK/i.test(code) };
    }
  }
}
