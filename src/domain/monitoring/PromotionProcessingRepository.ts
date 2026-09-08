import type { CaptureProcessingStatus, ProcessingCapture, PromotionAnalysisResult } from './types';

export interface AnalysisCompletion {
  capture: ProcessingCapture;
  status: 'promotion_detected' | 'ignored' | 'needs_review';
  analysis: PromotionAnalysisResult;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  processingMs: number;
}

export interface PromotionProcessingRepository {
  claimNext(workerId: string, staleBefore: string): Promise<ProcessingCapture | null>;
  complete(input: AnalysisCompletion): Promise<boolean>;
  fail(capture: ProcessingCapture, errorCode: string, retryAt: string | null): Promise<void>;
  getCaptureStatus(userId: string, captureId: string): Promise<CaptureProcessingStatus | null>;
  resetForReprocess(userId: string, captureId: string): Promise<boolean>;
  recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void>;
}
