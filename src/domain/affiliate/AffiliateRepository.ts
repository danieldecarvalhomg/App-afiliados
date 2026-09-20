import type { AffiliateAccountSummary, AffiliateConversion, AffiliateConversionStatus, AffiliatePlatform, AffiliateProviderCredentials, ConfigurableAffiliatePlatform, ProductSourceType } from './types';
import type { ManualProductInput, ProductRecord } from '../products/types';

export interface AffiliateAccountWithCredentials { id: string; credentials: AffiliateProviderCredentials; }
export interface ConversionCompletion {
  conversion: AffiliateConversion;
  status: AffiliateConversionStatus;
  resolvedUrl?: string | null;
  detectedPlatform?: AffiliatePlatform | null;
  convertedUrl?: string | null;
  affiliateAccountId?: string | null;
  provider?: string | null;
  errorCode?: string | null;
  resolvedAt?: string | null;
  convertedAt?: string | null;
}
export interface AffiliateRepository {
  listAccountSummaries(userId: string): Promise<AffiliateAccountSummary[]>;
  upsertAccount(userId: string, platform: ConfigurableAffiliatePlatform, provider: string, encryptedCredentials: Record<string, unknown>): Promise<void>;
  setValidationStatus(userId: string, platform: ConfigurableAffiliatePlatform, status: 'valid' | 'invalid' | 'error', errorCode?: string): Promise<void>;
  getAccountCredentials(userId: string, platform: ConfigurableAffiliatePlatform): Promise<AffiliateProviderCredentials | null>;
  getConfiguredAccount(userId: string, platform: AffiliatePlatform): Promise<AffiliateAccountWithCredentials | null>;
  getDeclaredMarketplace(conversion: AffiliateConversion): Promise<AffiliatePlatform | 'unknown' | null>;
  claimNext(workerId: string, staleBefore: string): Promise<AffiliateConversion | null>;
  updateClaim(input: ConversionCompletion): Promise<boolean>;
  scheduleRetry(conversion: AffiliateConversion, errorCode: string, retryAt: string): Promise<void>;
  resetConversion(userId: string, conversionId: string): Promise<boolean>;
  getProduct(userId: string, productId: string): Promise<ProductRecord | null>;
  completeManualConversion(userId: string, productId: string, convertedUrl: string, detectedPlatform: AffiliatePlatform): Promise<ProductRecord | null>;
  listProducts(userId: string, sourceType?: ProductSourceType): Promise<ProductRecord[]>;
  deleteProduct(userId: string, productId: string): Promise<boolean>;
  createManualProduct(userId: string, input: ManualProductInput): Promise<ProductRecord>;
  createWhatsAppProductForCapture(userId: string, captureId: string): Promise<ProductRecord | null>;
  createConversion(userId: string, sourceType: ProductSourceType, sourceReferenceId: string, originalUrl: string): Promise<void>;
  seedWhatsAppProducts(): Promise<number>;
  recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
}
