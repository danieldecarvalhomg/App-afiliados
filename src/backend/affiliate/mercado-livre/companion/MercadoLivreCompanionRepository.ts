import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  BrowserCompanionInstanceStatus,
  MercadoLivreCompanionErrorCode,
  MercadoLivreCompanionInstance,
  MercadoLivreCompanionJob,
  MercadoLivreCompanionJobStatus,
  MercadoLivreCompanionSessionStatus,
} from './types';
import { MERCADO_LIVRE_COMPANION_ADAPTER_VERSION } from './types';

type Row = Record<string, any>;

const mapInstance = (row: Row): MercadoLivreCompanionInstance => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  status: row.status,
  extensionVersion: row.extension_version,
  adapterVersion: Number(row.adapter_version),
  mercadoLivreStatus: row.mercado_livre_status,
  lastSeenAt: row.last_seen_at,
  lastSuccessAt: row.last_success_at,
  lastErrorCode: row.last_error_code,
  tokenExpiresAt: row.token_expires_at,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
});

const mapJob = (row: Row): MercadoLivreCompanionJob => ({
  id: row.id,
  userId: row.user_id,
  affiliateAccountId: row.affiliate_account_id,
  affiliateConversionId: row.affiliate_conversion_id,
  operationKey: row.operation_key,
  sourceUrl: row.source_url,
  normalizedUrl: row.normalized_url,
  trackingLabel: row.tracking_label,
  status: row.status,
  claimedBy: row.claimed_by,
  claimedAt: row.claimed_at,
  completedAt: row.completed_at,
  expiresAt: row.expires_at,
  resultUrl: row.result_url,
  itemId: row.item_id,
  errorCode: row.error_code,
  adapterVersion: Number(row.adapter_version),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class MercadoLivreCompanionRepository {
  constructor(private readonly db: SupabaseClient) {}

  operationKey(sourceUrl: string, trackingLabel?: string | null): string {
    return createHash('sha256').update(`${sourceUrl}\n${trackingLabel ?? ''}`).digest('hex');
  }

  async ensureAccount(userId: string): Promise<string> {
    const { data: existing, error: findError } = await this.db.from('affiliate_accounts')
      .select('id,encrypted_credentials').eq('user_id', userId).eq('platform', 'mercado_livre').maybeSingle();
    if (findError) throw findError;
    const now = new Date().toISOString();
    if (existing?.id) {
      const { error } = await this.db.from('affiliate_accounts').update({
        provider: existing.encrypted_credentials ? 'mercado_livre_hybrid_v1' : 'mercado_livre_browser_companion_v1', status: 'configured',
        validation_status: 'valid', validation_error_code: null, last_error_code: null,
        validated_at: now, updated_at: now,
      }).eq('id', existing.id).eq('user_id', userId);
      if (error) throw error;
      return existing.id;
    }
    const { data, error } = await this.db.from('affiliate_accounts').insert({
      user_id: userId, platform: 'mercado_livre', provider: 'mercado_livre_browser_companion_v1',
      status: 'configured', validation_status: 'valid', validation_error_code: null,
      encrypted_credentials: null, validated_at: now, updated_at: now,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async createPairing(userId: string, codeHash: string, name: string, expiresAt: string): Promise<string> {
    await this.db.from('browser_companion_pairings').delete().eq('user_id', userId).is('consumed_at', null);
    const { data, error } = await this.db.from('browser_companion_pairings').insert({
      user_id: userId, code_hash: codeHash, requested_name: name, expires_at: expiresAt,
    }).select('id').single();
    if (error) throw error;
    return data.id;
  }

  async consumePairing(input: {
    codeHash: string;
    tokenHash: string;
    tokenExpiresAt: string;
    name: string;
    extensionVersion: string;
    adapterVersion: number;
  }): Promise<MercadoLivreCompanionInstance | null> {
    const now = new Date().toISOString();
    const { data: pairing, error: pairingError } = await this.db.from('browser_companion_pairings')
      .update({ consumed_at: now }).eq('code_hash', input.codeHash).is('consumed_at', null)
      .gt('expires_at', now).select('id,user_id,requested_name').maybeSingle();
    if (pairingError) throw pairingError;
    if (!pairing) return null;
    await this.ensureAccount(pairing.user_id);
    const { data, error } = await this.db.from('browser_companion_instances').insert({
      user_id: pairing.user_id,
      name: input.name || pairing.requested_name || 'Chrome',
      status: 'ONLINE',
      extension_version: input.extensionVersion,
      adapter_version: input.adapterVersion,
      mercado_livre_status: 'UNKNOWN',
      token_hash: input.tokenHash,
      token_expires_at: input.tokenExpiresAt,
      last_seen_at: now,
      updated_at: now,
    }).select('*').single();
    if (error) throw error;
    return mapInstance(data);
  }

  async authenticate(tokenHash: string): Promise<MercadoLivreCompanionInstance | null> {
    const { data, error } = await this.db.from('browser_companion_instances').select('*')
      .eq('token_hash', tokenHash).neq('status', 'REVOKED').is('revoked_at', null)
      .gt('token_expires_at', new Date().toISOString()).maybeSingle();
    if (error) throw error;
    return data ? mapInstance(data) : null;
  }

  async heartbeat(instance: MercadoLivreCompanionInstance, input: {
    status: BrowserCompanionInstanceStatus;
    extensionVersion: string;
    adapterVersion: number;
    mercadoLivreStatus: MercadoLivreCompanionSessionStatus;
    errorCode?: MercadoLivreCompanionErrorCode | null;
  }): Promise<MercadoLivreCompanionInstance> {
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('browser_companion_instances').update({
      status: input.status,
      extension_version: input.extensionVersion,
      adapter_version: input.adapterVersion,
      mercado_livre_status: input.mercadoLivreStatus,
      last_seen_at: now,
      last_success_at: input.mercadoLivreStatus === 'READY' ? now : undefined,
      last_error_code: input.errorCode ?? null,
      updated_at: now,
    }).eq('id', instance.id).eq('user_id', instance.userId).is('revoked_at', null).select('*').single();
    if (error) throw error;
    return mapInstance(data);
  }

  async resumeUserActionJobs(userId: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db.from('mercado_livre_companion_jobs').update({
      status: 'PENDING', claimed_by: null, claimed_at: null, lease_expires_at: null,
      completed_at: null, error_code: null, updated_at: now,
    }).eq('user_id', userId).eq('status', 'NEEDS_USER_ACTION').gt('expires_at', now);
    if (error) throw error;
  }

  async markOffline(staleBefore: string): Promise<void> {
    const { error } = await this.db.from('browser_companion_instances').update({
      status: 'OFFLINE', updated_at: new Date().toISOString(),
    }).eq('status', 'ONLINE').lt('last_seen_at', staleBefore).is('revoked_at', null);
    if (error) throw error;
  }

  async listInstances(userId: string): Promise<MercadoLivreCompanionInstance[]> {
    const { data, error } = await this.db.from('browser_companion_instances').select('*')
      .eq('user_id', userId).order('last_seen_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map(mapInstance);
  }

  async latestUsableInstance(userId: string): Promise<MercadoLivreCompanionInstance | null> {
    const { data, error } = await this.db.from('browser_companion_instances').select('*')
      .eq('user_id', userId).is('revoked_at', null).neq('status', 'REVOKED')
      .gt('token_expires_at', new Date().toISOString())
      .order('last_seen_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const instances = (data ?? []).map(mapInstance);
    return instances.find((item) => item.status === 'ONLINE' && item.adapterVersion >= MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? instances.find((item) => item.status !== 'OUTDATED' && item.adapterVersion >= MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? instances[0] ?? null;
  }

  async revokeInstance(userId: string, instanceId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('browser_companion_instances').update({
      status: 'REVOKED', revoked_at: now, token_hash: null, updated_at: now,
    }).eq('id', instanceId).eq('user_id', userId).is('revoked_at', null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return false;
    const { data: remaining } = await this.db.from('browser_companion_instances').select('id')
      .eq('user_id', userId).is('revoked_at', null).neq('status', 'REVOKED').limit(1);
    // A extensão pode ser removida depois que sincronizou a sessão com o motor
    // próprio. A ausência do conector não invalida uma sessão backend válida;
    // getConfiguredAccount ainda exige extensão quando não há sessão cifrada.
    void remaining;
    return true;
  }

  async expireJobs(): Promise<void> {
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').update({
      status: 'EXPIRED', error_code: 'JOB_EXPIRED', completed_at: now,
      claimed_by: null, lease_expires_at: null, updated_at: now,
    }).in('status', ['PENDING', 'CLAIMED', 'PROCESSING', 'NEEDS_USER_ACTION']).lt('expires_at', now).select('*');
    if (error) throw error;
    for (const row of data ?? []) await this.settleConversion(mapJob(row), 'conversion_failed', 'JOB_EXPIRED').catch(() => undefined);
  }

  async cachedJob(userId: string, operationKey: string): Promise<MercadoLivreCompanionJob | null> {
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').select('*')
      .eq('user_id', userId).eq('operation_key', operationKey).eq('status', 'SUCCESS')
      .not('result_url', 'is', null).maybeSingle();
    if (error) throw error;
    return data ? mapJob(data) : null;
  }

  async getOrCreateJob(input: {
    userId: string;
    affiliateAccountId: string;
    sourceUrl: string;
    normalizedUrl: string;
    trackingLabel?: string | null;
    affiliateConversionId?: string | null;
    expiresAt: string;
  }): Promise<MercadoLivreCompanionJob> {
    const operationKey = this.operationKey(input.normalizedUrl, input.trackingLabel);
    const { data: existing, error: findError } = await this.db.from('mercado_livre_companion_jobs')
      .select('*').eq('user_id', input.userId).eq('operation_key', operationKey)
      .in('status', ['PENDING', 'CLAIMED', 'PROCESSING', 'SUCCESS'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (findError) throw findError;
    if (existing) {
      if (input.affiliateConversionId) await this.attachConversion(input.userId, existing.id, input.affiliateConversionId);
      return mapJob(existing);
    }
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').insert({
      user_id: input.userId, affiliate_account_id: input.affiliateAccountId,
      affiliate_conversion_id: input.affiliateConversionId ?? null,
      operation_key: operationKey, source_url: input.sourceUrl, normalized_url: input.normalizedUrl,
      tracking_label: input.trackingLabel ?? null, status: 'PENDING', expires_at: input.expiresAt,
      adapter_version: MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
    }).select('*').single();
    if (error?.code === '23505') {
      const { data: raced, error: racedError } = await this.db.from('mercado_livre_companion_jobs').select('*')
        .eq('user_id', input.userId).eq('operation_key', operationKey)
        .in('status', ['PENDING', 'CLAIMED', 'PROCESSING', 'SUCCESS'])
        .order('created_at', { ascending: false }).limit(1).single();
      if (racedError) throw racedError;
      if (input.affiliateConversionId) await this.attachConversion(input.userId, raced.id, input.affiliateConversionId);
      return mapJob(raced);
    }
    if (error) throw error;
    if (input.affiliateConversionId) await this.attachConversion(input.userId, data.id, input.affiliateConversionId);
    return mapJob(data);
  }

  async getJob(userId: string, jobId: string): Promise<MercadoLivreCompanionJob | null> {
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').select('*')
      .eq('id', jobId).eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? mapJob(data) : null;
  }

  async claimJob(instance: MercadoLivreCompanionInstance, leaseSeconds = 90): Promise<MercadoLivreCompanionJob | null> {
    const { data, error } = await this.db.rpc('claim_ml_companion_job', {
      p_instance_id: instance.id, p_lease_seconds: leaseSeconds,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapJob(row) : null;
  }

  async markProcessing(instance: MercadoLivreCompanionInstance, jobId: string): Promise<boolean> {
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').update({
      status: 'PROCESSING', updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('user_id', instance.userId).eq('claimed_by', instance.id)
      .eq('status', 'CLAIMED').gt('expires_at', new Date().toISOString()).select('id').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async completeJob(instance: MercadoLivreCompanionInstance, jobId: string, input: {
    status: MercadoLivreCompanionJobStatus;
    resultUrl?: string | null;
    itemId?: string | null;
    errorCode?: MercadoLivreCompanionErrorCode | null;
    step?: string | null;
    pageType?: string | null;
    durationMs?: number | null;
  }): Promise<MercadoLivreCompanionJob | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('mercado_livre_companion_jobs').update({
      status: input.status, result_url: input.resultUrl ?? null, item_id: input.itemId ?? null,
      error_code: input.errorCode ?? null, step: input.step ?? null, page_type: input.pageType ?? null,
      duration_ms: input.durationMs ?? null, completed_at: now, lease_expires_at: null, updated_at: now,
    }).eq('id', jobId).eq('user_id', instance.userId).eq('claimed_by', instance.id)
      .in('status', ['CLAIMED', 'PROCESSING']).select('*').maybeSingle();
    if (error) throw error;
    return data ? mapJob(data) : null;
  }

  async recordOperation(job: MercadoLivreCompanionJob): Promise<void> {
    const success = job.status === 'SUCCESS';
    const { error } = await this.db.from('mercado_livre_affiliate_operations').insert({
      user_id: job.userId, affiliate_account_id: job.affiliateAccountId,
      operation_key: job.operationKey, source_url: job.normalizedUrl,
      affiliate_url: success ? job.resultUrl : null, item_id: job.itemId,
      tracking_label: job.trackingLabel, status: success ? 'success' : 'failed',
      error_code: job.errorCode, latency_ms: Math.max(0, new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime()),
      adapter_version: MERCADO_LIVRE_COMPANION_ADAPTER_VERSION, is_canary: false,
    });
    if (error && error.code !== '23505') throw error;
  }

  async settleConversion(job: MercadoLivreCompanionJob, status: 'pending' | 'awaiting_companion' | 'converted' | 'conversion_failed', errorCode?: string | null): Promise<void> {
    const { data: linked, error: linkedError } = await this.db.from('mercado_livre_companion_job_conversions')
      .select('conversion_id').eq('job_id', job.id).eq('user_id', job.userId);
    if (linkedError) throw linkedError;
    const conversionIds = [...new Set([
      job.affiliateConversionId,
      ...(linked ?? []).map((row: Row) => row.conversion_id),
    ].filter((value): value is string => typeof value === 'string' && Boolean(value)))];
    if (!conversionIds.length) return;
    const now = new Date().toISOString();
    const converted = status === 'converted';
    const patch: Row = {
      status, resolved_url: job.normalizedUrl, detected_platform: 'mercado_livre',
      affiliate_account_id: job.affiliateAccountId, provider: 'mercado_livre_browser_companion_v1',
      converted_url: converted ? job.resultUrl : null, error_code: errorCode ?? null,
      processing_started_at: null, processing_worker_id: null, updated_at: now,
    };
    if (status === 'pending') patch.next_attempt_at = new Date(Date.now() + 10_000).toISOString();
    if (converted) patch.converted_at = now;
    const { error } = await this.db.from('affiliate_conversions').update(patch)
      .in('id', conversionIds).eq('user_id', job.userId);
    if (error) throw error;
    const { error: productError } = await this.db.from('products').update({
      affiliate_status: status, affiliate_url: converted ? job.resultUrl : null,
      updated_at: now,
    }).eq('user_id', job.userId).in('affiliate_conversion_id', conversionIds);
    if (productError) throw productError;
  }

  private async attachConversion(userId: string, jobId: string, conversionId: string): Promise<void> {
    const { data: owned, error: ownershipError } = await this.db.from('affiliate_conversions')
      .select('id').eq('id', conversionId).eq('user_id', userId).maybeSingle();
    if (ownershipError) throw ownershipError;
    if (!owned) throw new Error('AFFILIATE_CONVERSION_NOT_OWNED');
    const { error } = await this.db.from('mercado_livre_companion_job_conversions').upsert({
      job_id: jobId, conversion_id: conversionId, user_id: userId,
    }, { onConflict: 'job_id,conversion_id', ignoreDuplicates: true });
    if (error) throw error;
  }

  async health(): Promise<Row> {
    const { data, error } = await this.db.from('mercado_livre_companion_health').select('*').eq('singleton', true).single();
    if (error) throw error;
    return data;
  }

  async updateHealth(input: {
    status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
    circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
    errorCode?: MercadoLivreCompanionErrorCode | null;
    success?: boolean;
    circuitOpenedAt?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db.from('mercado_livre_companion_health').update({
      health_status: input.status, circuit_state: input.circuitState,
      consecutive_failures: input.consecutiveFailures,
      circuit_opened_at: input.circuitOpenedAt ?? null,
      last_check_at: now, last_success_at: input.success ? now : undefined,
      last_error_code: input.errorCode ?? null,
      adapter_version: MERCADO_LIVRE_COMPANION_ADAPTER_VERSION, updated_at: now,
    }).eq('singleton', true);
    if (error) throw error;
  }

  async metrics24h(): Promise<Record<string, any>> {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await this.db.from('mercado_livre_companion_jobs')
      .select('status,error_code,duration_ms').gte('created_at', since);
    if (error) throw error;
    const rows = data ?? [];
    const terminal = rows.filter((row: Row) => ['SUCCESS', 'FAILED', 'EXPIRED', 'NEEDS_USER_ACTION'].includes(row.status));
    const successes = terminal.filter((row: Row) => row.status === 'SUCCESS').length;
    const latencies = terminal.map((row: Row) => Number(row.duration_ms ?? 0)).filter((value) => value > 0).sort((a, b) => a - b);
    const failures: Record<string, number> = {};
    for (const row of terminal) if (row.status !== 'SUCCESS') failures[row.error_code ?? 'UNKNOWN_ERROR'] = (failures[row.error_code ?? 'UNKNOWN_ERROR'] ?? 0) + 1;
    return {
      generationCount: terminal.length,
      successCount: successes,
      failureCount: terminal.length - successes,
      successRate: terminal.length ? Math.round(successes / terminal.length * 10_000) / 100 : 0,
      averageLatency: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
      p95Latency: latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * .95) - 1)] : 0,
      portalChangedCount: failures.PORTAL_CHANGED ?? 0,
      userActionCount: (failures.USER_ACTION_REQUIRED ?? 0) + (failures.CAPTCHA_REQUIRED ?? 0) + (failures.TWO_FACTOR_REQUIRED ?? 0),
      offlineCount: failures.COMPANION_OFFLINE ?? 0,
      expiredJobs: failures.JOB_EXPIRED ?? 0,
      failuresByCategory: failures,
    };
  }
}
