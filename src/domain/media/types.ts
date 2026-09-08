export type ProductMediaSourceType = 'marketplace' | 'whatsapp' | 'manual';
export type ProductMediaStatus = 'pending' | 'analyzing' | 'available' | 'selected' | 'unavailable' | 'failed' | 'needs_review';
export type ProductMediaClassification = 'clean_product_photo' | 'marketplace_product_image' | 'lifestyle_product_photo' | 'promotional_creative' | 'screenshot' | 'packaging' | 'unknown';
export type ProductMediaAnalysisStatus = 'pending' | 'analyzing' | 'completed' | 'failed';
export type ProductMediaSelectionStatus = 'candidate' | 'rejected' | 'auto_selected' | 'manual_selected';

export interface ProductMediaAsset {
  id: string; userId: string; productId: string; sourceType: ProductMediaSourceType;
  sourceReferenceId: string | null; sourceUrl: string | null; storagePath: string | null;
  mimeType: string | null; fileSize: number | null; width: number | null; height: number | null;
  contentHash: string | null; classification: ProductMediaClassification | null;
  hasTextOverlay: boolean; hasDetectedBranding: boolean; hasQrCode: boolean; hasWatermark: boolean;
  possibleConflictingCommercialText: boolean; productMatchConfidence: number | null;
  qualityScore: number | null; analysisStatus: ProductMediaAnalysisStatus;
  selectionStatus: ProductMediaSelectionStatus; isPrimary: boolean; attemptCount: number;
  displayUrl: string | null; createdAt: string; updatedAt: string;
}

export interface ProductMediaCandidateInput {
  userId: string; productId: string; sourceType: ProductMediaSourceType;
  sourceReferenceId?: string | null; sourceUrl?: string | null;
  bytes?: Uint8Array; suppliedMimeType?: string | null;
}

export interface ProductMediaAnalysis {
  classification: ProductMediaClassification; hasTextOverlay: boolean;
  hasDetectedBranding: boolean; hasQrCode: boolean; hasWatermark: boolean;
  possibleConflictingCommercialText: boolean; productMatchConfidence: number;
  productVisible: boolean; sharpnessScore: number;
}

export interface ProductMediaPreferences {
  preferNoText: boolean; preferWhiteBackground: boolean; preferLifestyleForClothing: boolean;
  avoidPackaging: boolean; naturalLanguage: string | null;
}

export interface ProductPresentationContext {
  productId: string; primaryImage: ProductMediaAsset | null;
  alternativeImages: ProductMediaAsset[]; mediaStatus: ProductMediaStatus;
}
