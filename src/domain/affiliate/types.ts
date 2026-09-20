export type ProductSourceType = 'whatsapp' | 'marketplace_radar' | 'manual';
export type AffiliatePlatform =
  | 'shopee' | 'amazon' | 'mercado_livre' | 'magalu' | 'aliexpress'
  | 'other' | 'unsupported';
export type ConfigurableAffiliatePlatform = 'shopee' | 'amazon' | 'mercado_livre';
export type MercadoLivreAffiliateHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
export type BrowserCompanionInstanceStatus = 'ONLINE' | 'OFFLINE' | 'OUTDATED' | 'REVOKED' | 'ERROR';
export type MercadoLivreBrowserSessionStatus = 'READY' | 'NEEDS_LOGIN' | 'NEEDS_USER_ACTION' | 'PORTAL_UNAVAILABLE' | 'PORTAL_CHANGED' | 'UNKNOWN';

export type AffiliateConversionStatus =
  | 'pending' | 'resolving' | 'resolved' | 'converting' | 'awaiting_companion' | 'converted'
  | 'invalid_url' | 'resolution_failed' | 'conversion_failed'
  | 'unsupported_platform' | 'affiliate_account_not_configured';

export interface AffiliateAccountSummary {
  id: string;
  platform: 'shopee' | 'amazon' | 'mercado_livre';
  configured: boolean;
  configurationStatus: 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error';
  provider: string;
  lastErrorCode: string | null;
  sessionConfigured?: boolean;
  catalogApiConfigured?: boolean;
  catalogApiStatus?: 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error';
  browserCompanion?: {
    instanceId: string;
    name: string;
    status: BrowserCompanionInstanceStatus;
    extensionVersion: string;
    mercadoLivreStatus: MercadoLivreBrowserSessionStatus;
    lastSeenAt: string | null;
    lastSuccessAt: string | null;
    adapterVersion: number;
  };
}

export interface AffiliateProviderCredentials {
  appId: string;
  secret: string;
  partnerTag?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionCookie?: string;
  trackingTag?: string;
  sessionSyncedAt?: string;
}
export interface AffiliateProviderInput {
  url: string;
  credentials: AffiliateProviderCredentials;
  subIds?: string[];
  userId?: string;
  affiliateAccountId?: string;
  trackingLabel?: string;
  requestId?: string;
}
export interface AffiliateProviderResult {
  success: boolean;
  convertedUrl: string | null;
  provider: string;
  errorCode?: string;
  transient?: boolean;
  itemId?: string | null;
  trackingLabel?: string | null;
}

export interface AffiliateConversion {
  id: string;
  userId: string;
  sourceType: ProductSourceType;
  sourceReferenceId: string | null;
  affiliateAccountId: string | null;
  originalUrl: string;
  resolvedUrl: string | null;
  detectedPlatform: AffiliatePlatform | null;
  convertedUrl: string | null;
  status: AffiliateConversionStatus;
  errorCode: string | null;
  provider: string | null;
  workerId: string;
  attemptCount: number;
}
