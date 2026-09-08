import type { SupabaseClient } from '@supabase/supabase-js';
import type { InternalAutomationEventType, InternalAutomationJob, InternalAutomationRepository } from '../../domain/automation/types';

type Row = Record<string, unknown>;

function mapJob(row: Row): InternalAutomationJob {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    eventType: row.event_type as InternalAutomationEventType,
    idempotencyKey: String(row.idempotency_key),
    payload: row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {},
    attemptCount: Number(row.attempt_count ?? 0),
    workerId: String(row.locked_by),
  };
}

export class SupabaseInternalAutomationRepository implements InternalAutomationRepository {
  constructor(private readonly db: SupabaseClient) {}

  async enqueue(userId: string, eventType: InternalAutomationEventType, idempotencyKey: string, payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await this.db.rpc('enqueue_internal_automation', {
      p_user_id: userId,
      p_event_type: eventType,
      p_idempotency_key: idempotencyKey,
      p_payload: payload,
    });
    if (error) throw error;
    return String(data);
  }

  async claimNext(workerId: string, staleBefore: string): Promise<InternalAutomationJob | null> {
    const { data, error } = await this.db.rpc('claim_next_internal_automation', {
      p_worker_id: workerId,
      p_stale_before: staleBefore,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapJob(row as Row) : null;
  }

  async complete(job: InternalAutomationJob, level: 'info' | 'warning' | 'error' | 'success', message: string): Promise<void> {
    const { data, error } = await this.db.rpc('complete_internal_automation', {
      p_job_id: job.id,
      p_worker_id: job.workerId,
      p_level: level,
      p_message: message,
    });
    if (error) throw error;
    if (data !== true) throw new Error('AUTOMATION_COMPLETION_CONFLICT');
  }

  async fail(job: InternalAutomationJob, errorCode: string, retryAt: string | null): Promise<void> {
    const { data, error } = await this.db.rpc('fail_internal_automation', {
      p_job_id: job.id,
      p_worker_id: job.workerId,
      p_error_code: errorCode,
      p_retry_at: retryAt,
    });
    if (error) throw error;
    if (data !== true) throw new Error('AUTOMATION_FAILURE_CONFLICT');
  }
}
