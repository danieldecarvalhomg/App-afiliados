export const PROMOFY_COMPANION_EXTENSION_VERSION = '1.2.3';
export const MERCADO_LIVRE_COMPANION_ADAPTER_VERSION = 5;
export const MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION = 5;

export type BrowserCompanionInstanceStatus = 'ONLINE' | 'OFFLINE' | 'OUTDATED' | 'REVOKED' | 'ERROR';
export type MercadoLivreCompanionSessionStatus =
  | 'READY' | 'NEEDS_LOGIN' | 'NEEDS_USER_ACTION'
  | 'PORTAL_UNAVAILABLE' | 'PORTAL_CHANGED' | 'UNKNOWN';
export type MercadoLivreCompanionJobStatus =
  | 'PENDING' | 'CLAIMED' | 'PROCESSING' | 'SUCCESS'
  | 'FAILED' | 'EXPIRED' | 'NEEDS_USER_ACTION' | 'CANCELLED';
export type MercadoLivreCompanionErrorCode =
  | 'COMPANION_NOT_PAIRED' | 'COMPANION_OFFLINE' | 'COMPANION_OUTDATED'
  | 'JOB_EXPIRED' | 'JOB_ALREADY_CLAIMED' | 'AUTH_REQUIRED'
  | 'CAPTCHA_REQUIRED' | 'TWO_FACTOR_REQUIRED' | 'USER_ACTION_REQUIRED'
  | 'PORTAL_UNAVAILABLE' | 'PORTAL_CHANGED' | 'GENERATOR_NOT_FOUND'
  | 'INPUT_NOT_FOUND' | 'GENERATION_TIMEOUT' | 'GENERATION_FAILED'
  | 'INVALID_AFFILIATE_URL' | 'LINK_VALIDATION_FAILED' | 'RATE_LIMITED'
  | 'TEMPORARY_ERROR' | 'CIRCUIT_OPEN' | 'UNKNOWN_ERROR'
  | 'REMOTE_BROWSER_NOT_CONFIGURED' | 'REMOTE_BROWSER_UNAVAILABLE'
  | 'REMOTE_LOGIN_REQUIRED' | 'REMOTE_LOGIN_SESSION_EXPIRED'
  | 'REMOTE_BROWSER_HTTP_402' | 'REMOTE_BROWSER_BILLING_REQUIRED'
  | 'DIRECT_SESSION_REQUIRED' | 'DIRECT_SESSION_INVALID' | 'DIRECT_ENGINE_UNAVAILABLE';

export interface MercadoLivreCompanionInstance {
  id: string;
  userId: string;
  name: string;
  status: BrowserCompanionInstanceStatus;
  extensionVersion: string;
  adapterVersion: number;
  mercadoLivreStatus: MercadoLivreCompanionSessionStatus;
  lastSeenAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
  tokenExpiresAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface MercadoLivreCompanionJob {
  id: string;
  userId: string;
  affiliateAccountId: string;
  affiliateConversionId: string | null;
  operationKey: string;
  sourceUrl: string;
  normalizedUrl: string;
  trackingLabel: string | null;
  status: MercadoLivreCompanionJobStatus;
  claimedBy: string | null;
  claimedAt: string | null;
  completedAt: string | null;
  expiresAt: string;
  resultUrl: string | null;
  itemId: string | null;
  errorCode: MercadoLivreCompanionErrorCode | null;
  adapterVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface MercadoLivreCompanionGeneratedLink {
  marketplace: 'mercado_livre';
  sourceUrl: string;
  affiliateUrl: string;
  itemId: string | null;
  trackingLabel: string | null;
  status: 'SUCCESS';
  cached: boolean;
}

export class MercadoLivreCompanionError extends Error {
  constructor(
    public readonly code: MercadoLivreCompanionErrorCode,
    message: string,
    public readonly transient = false,
  ) {
    super(message);
  }
}

export const USER_ACTION_ERRORS = new Set<MercadoLivreCompanionErrorCode>([
  'AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'TWO_FACTOR_REQUIRED', 'USER_ACTION_REQUIRED',
]);

export const TRANSIENT_COMPANION_ERRORS = new Set<MercadoLivreCompanionErrorCode>([
  'COMPANION_OFFLINE', 'JOB_ALREADY_CLAIMED', 'GENERATION_TIMEOUT',
  'TEMPORARY_ERROR', 'PORTAL_UNAVAILABLE',
]);

export const SANITIZED_COMPANION_ERRORS = new Set<MercadoLivreCompanionErrorCode>([
  'COMPANION_OFFLINE', 'COMPANION_OUTDATED', 'JOB_EXPIRED', 'JOB_ALREADY_CLAIMED',
  'AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'TWO_FACTOR_REQUIRED', 'USER_ACTION_REQUIRED',
  'PORTAL_UNAVAILABLE', 'PORTAL_CHANGED', 'GENERATOR_NOT_FOUND', 'INPUT_NOT_FOUND',
  'GENERATION_TIMEOUT', 'GENERATION_FAILED', 'INVALID_AFFILIATE_URL',
  'LINK_VALIDATION_FAILED', 'RATE_LIMITED', 'TEMPORARY_ERROR', 'UNKNOWN_ERROR',
  'REMOTE_BROWSER_NOT_CONFIGURED', 'REMOTE_BROWSER_UNAVAILABLE',
  'REMOTE_LOGIN_REQUIRED', 'REMOTE_LOGIN_SESSION_EXPIRED',
  'REMOTE_BROWSER_HTTP_402', 'REMOTE_BROWSER_BILLING_REQUIRED',
  'DIRECT_SESSION_REQUIRED', 'DIRECT_SESSION_INVALID', 'DIRECT_ENGINE_UNAVAILABLE',
]);
