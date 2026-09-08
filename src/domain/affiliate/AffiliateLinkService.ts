import type { AffiliateLinkProvider } from './AffiliateLinkProvider';
import type { AffiliatePlatform, AffiliateProviderCredentials, AffiliateProviderResult } from './types';

export class AffiliateLinkService {
  private readonly providers: Map<AffiliatePlatform, AffiliateLinkProvider>;
  constructor(providers: AffiliateLinkProvider[]) { this.providers = new Map(providers.map((provider) => [provider.platform, provider])); }
  async convert(platform: AffiliatePlatform, url: string, credentials: AffiliateProviderCredentials,
    context: { userId?: string; affiliateAccountId?: string; trackingLabel?: string; requestId?: string; subIds?: string[] } = {}): Promise<AffiliateProviderResult> {
    const provider = this.providers.get(platform);
    if (!provider) return { success: false, convertedUrl: null, provider: 'none', errorCode: 'UNSUPPORTED_PLATFORM' };
    const result = await provider.convert({ url, credentials, ...context });
    if (!result.success || !result.convertedUrl) return { ...result, success: false, convertedUrl: null };
    try {
      const original = new URL(url); const converted = new URL(result.convertedUrl);
      if (!['http:','https:'].includes(converted.protocol) || converted.toString() === original.toString()) {
        return { success: false, convertedUrl: null, provider: result.provider, errorCode: 'INVALID_CONVERTED_URL' };
      }
    } catch { return { success: false, convertedUrl: null, provider: result.provider, errorCode: 'INVALID_CONVERTED_URL' }; }
    return result;
  }
}
