export type WhatsAppMessageType = 'text' | 'image' | 'video' | 'document' | 'audio' | 'sticker' | 'unknown';
export type CaptureProcessingStatus = 'raw' | 'processing' | 'promotion_detected' | 'ignored' | 'failed' | 'needs_review';
export type CaptureReviewStatus = 'pending' | 'approved' | 'rejected';
export type PromotionMarketplace = 'shopee' | 'amazon' | 'mercado_livre' | 'magalu' | 'aliexpress' | 'other' | 'unknown';

export interface WhatsAppMediaMetadata {
  mimeType?: string;
  fileName?: string;
  caption?: string;
  size?: number;
  available?: boolean;
}

/** Evento de domínio; não expõe nenhum objeto do Baileys. */
export interface IncomingWhatsAppMessage {
  connectionId: string;
  externalMessageId: string;
  externalGroupId: string;
  senderExternalId?: string;
  fromMe: boolean;
  type: WhatsAppMessageType;
  text?: string;
  links: string[];
  media?: WhatsAppMediaMetadata;
  /** Referência técnica backend-only; nunca é persistida em media_metadata nem exposta pela API. */
  mediaRecoveryReference?: import('../whatsapp/mediaReferences').NormalizedMediaReference;
  sentAt: string;
}

export interface GroupMonitor {
  id: string;
  userId: string;
  groupId: string;
  enabled: boolean;
  reviewRequired: boolean;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  groupName: string;
  externalGroupId: string;
  connectionId: string;
  connectionLabel: string;
}

export interface CapturedMessageSource {
  id: string;
  connectionId: string;
  connectionLabel: string;
  groupId: string;
  groupName: string;
  monitorId: string;
  observedAt: string;
}

export interface CapturedMessage {
  id: string;
  externalMessageId: string | null;
  externalGroupId: string;
  senderExternalId: string | null;
  messageType: WhatsAppMessageType;
  rawContent: string;
  links: string[];
  mediaMetadata: WhatsAppMediaMetadata | null;
  messageFingerprint: string;
  sentAt: string;
  receivedAt: string;
  processingStatus: CaptureProcessingStatus;
  processingStartedAt: string | null;
  attemptCount: number;
  lastErrorCode: string | null;
  lastErrorAt: string | null;
  reviewStatus: CaptureReviewStatus;
  reviewedAt: string | null;
  analysis: PromotionAnalysis | null;
  sources: CapturedMessageSource[];
}

export interface PromotionCoupon { code: string | null; description: string | null; }
export interface PromotionAnalysisResult {
  isPromotion: boolean | null;
  confidence: number;
  productName: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: 'BRL' | null;
  coupon: PromotionCoupon | null;
  freeShipping: boolean | null;
  marketplace: PromotionMarketplace;
  links: string[];
  primaryProductLink: string | null;
  couponLinks: string[];
  reason?: 'insufficient_text_content' | 'ambiguous_content';
}
export interface PromotionAnalysis extends PromotionAnalysisResult {
  id: string;
  analysisVersion: 'promotion-v1';
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  processingMs: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessingCapture {
  id: string;
  userId: string;
  workerId: string;
  rawContent: string;
  links: string[];
  messageType: WhatsAppMessageType;
  mediaMetadata: WhatsAppMediaMetadata | null;
  attemptCount: number;
}

export interface CaptureFilters {
  connectionId?: string;
  groupId?: string;
  monitorId?: string;
  messageType?: WhatsAppMessageType;
  cursor?: string;
  limit?: number;
}

export interface CapturePage { items: CapturedMessage[]; nextCursor: string | null; }
export interface ActiveMonitorOrigin { monitor: GroupMonitor; }
export interface PersistCaptureInput {
  userId: string;
  message: IncomingWhatsAppMessage;
  groupId: string;
  monitorId: string;
  fingerprint: string;
  receivedAt: string;
}
export interface PersistCaptureResult { capturedMessageId: string; duplicate: boolean; sourceCreated: boolean; }
export type ProcessIncomingResult =
  | { outcome: 'ignored'; reason: 'from_me' | 'not_monitored' | 'not_group' }
  | ({ outcome: 'captured' | 'duplicate' } & PersistCaptureResult);
