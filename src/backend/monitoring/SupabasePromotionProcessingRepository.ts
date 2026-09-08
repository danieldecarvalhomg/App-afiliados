import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisCompletion, PromotionProcessingRepository } from '../../domain/monitoring/PromotionProcessingRepository';
import type { CaptureProcessingStatus, ProcessingCapture, WhatsAppMessageType } from '../../domain/monitoring/types';

type Row = Record<string, any>;
function mapCapture(row: Row): ProcessingCapture {
  return {
    id: row.id, userId: row.user_id, workerId: row.processing_worker_id, rawContent: row.raw_content ?? '',
    links: Array.isArray(row.links) ? row.links : [], messageType: (row.message_type ?? 'unknown') as WhatsAppMessageType,
    mediaMetadata: row.media_metadata ?? null, attemptCount: Number(row.attempt_count ?? 0),
  };
}

export class SupabasePromotionProcessingRepository implements PromotionProcessingRepository {
  constructor(private readonly db: SupabaseClient) {}
  async claimNext(workerId: string, staleBefore: string): Promise<ProcessingCapture | null> {
    const { data, error } = await this.db.rpc('claim_next_promotion_capture', {
      p_worker_id: workerId, p_stale_before: staleBefore,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapCapture(row) : null;
  }
  async complete(input: AnalysisCompletion): Promise<boolean> {
    const { data, error } = await this.db.rpc('complete_promotion_processing', {
      p_user_id: input.capture.userId, p_capture_id: input.capture.id, p_status: input.status,
      p_worker_id: input.capture.workerId,
      p_analysis: input.analysis, p_provider: input.provider, p_model: input.model,
      p_input_tokens: input.inputTokens ?? null, p_output_tokens: input.outputTokens ?? null,
      p_processing_ms: input.processingMs,
    });
    if (error) throw error;
    return data === true;
  }
  async fail(capture: ProcessingCapture, errorCode: string, retryAt: string | null): Promise<void> {
    const terminal = retryAt === null;
    const { error } = await this.db.from('captured_messages').update({
      processing_status: terminal ? 'failed' : 'raw', processing_started_at: null,
      processing_worker_id: null, next_attempt_at: retryAt ?? new Date().toISOString(),
      last_error_code: errorCode, last_error_at: new Date().toISOString(),
    }).eq('id', capture.id).eq('user_id', capture.userId)
      .eq('processing_status', 'processing').eq('processing_worker_id', capture.workerId);
    if (error) throw error;
  }
  async getCaptureStatus(userId: string, captureId: string): Promise<CaptureProcessingStatus | null> {
    const { data, error } = await this.db.from('captured_messages').select('processing_status')
      .eq('user_id', userId).eq('id', captureId).maybeSingle();
    if (error) throw error;
    return data?.processing_status as CaptureProcessingStatus | undefined ?? null;
  }
  async resetForReprocess(userId: string, captureId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc('reset_capture_for_reprocess', {
      p_user_id: userId, p_capture_id: captureId,
    });
    if (error) throw error;
    return data === true;
  }
  async recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('system_events').insert({ user_id: userId, event_type: eventType, payload });
    if (error) throw error;
  }
}
