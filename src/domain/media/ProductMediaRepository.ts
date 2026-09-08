import type { ProductMediaAnalysis, ProductMediaAsset, ProductMediaCandidateInput, ProductMediaPreferences, ProductMediaStatus } from './types';

export interface ClaimedProductMedia { asset: ProductMediaAsset; product: { id: string; userId: string; title: string; category: string | null }; workerId: string; }
export interface StoredImage { storagePath: string; mimeType: string; fileSize: number; width: number; height: number; contentHash: string; analysisBytes?: Uint8Array; }

export interface ProductMediaRepository {
  getOwnedProduct(userId: string, productId: string): Promise<{ id: string; title: string; category: string | null; mediaStatus: ProductMediaStatus } | null>;
  createCandidate(input: ProductMediaCandidateInput): Promise<ProductMediaAsset>;
  claimNext(workerId: string, staleBefore: string): Promise<ClaimedProductMedia | null>;
  attachStoredFile(claim: ClaimedProductMedia, stored: StoredImage): Promise<ProductMediaAsset>;
  completeAnalysis(claim: ClaimedProductMedia, analysis: ProductMediaAnalysis, qualityScore: number, needsReview: boolean): Promise<void>;
  fail(claim: ClaimedProductMedia, errorCode: string, retryAt: string | null): Promise<void>;
  listAssets(userId: string, productId: string): Promise<ProductMediaAsset[]>;
  selectPrimary(userId: string, productId: string, assetId: string, selection: 'auto_selected' | 'manual_selected'): Promise<boolean>;
  markUnavailable(userId: string, productId: string): Promise<void>;
  getPreferences(userId: string): Promise<ProductMediaPreferences>;
  recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
  discoverPendingWhatsApp(): Promise<Array<ProductMediaCandidateInput & { connectionId: string; externalGroupId: string; externalMessageId: string }>>;
}

export interface ProductMediaStorage {
  fetchTrustedSource(url: string): Promise<{ bytes: Uint8Array; suppliedMimeType: string | null }>;
  store(userId: string, productId: string, assetId: string, bytes: Uint8Array, suppliedMimeType?: string | null): Promise<StoredImage>;
  read(storagePath: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  sign(storagePath: string): Promise<string | null>;
}

export interface WhatsAppMediaProvider {
  download(input: { userId?:string;sourceReferenceId?:string|null;connectionId: string; externalGroupId: string; externalMessageId: string }): Promise<{ bytes: Uint8Array; mimeType: string | null } | { pending: true } | null>;
}
