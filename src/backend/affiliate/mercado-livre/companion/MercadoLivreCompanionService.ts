import { createHash, randomBytes } from 'node:crypto';
import { extractMercadoLivreItemId, MercadoLivreAffiliateLinkValidator, normalizeMercadoLivreProductUrl } from '../AffiliateLinkValidator';
import { MercadoLivreBrowserCompanionAdapter } from './MercadoLivreBrowserCompanionAdapter';
import { MercadoLivreCompanionRepository } from './MercadoLivreCompanionRepository';
import type { MercadoLivreRemoteBrowserService } from '../remote/MercadoLivreRemoteBrowserService';
import {
  MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
  MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
  PROMOFY_COMPANION_EXTENSION_VERSION,
  SANITIZED_COMPANION_ERRORS,
  USER_ACTION_ERRORS,
  MercadoLivreCompanionError,
  type BrowserCompanionInstanceStatus,
  type MercadoLivreCompanionErrorCode,
  type MercadoLivreCompanionInstance,
  type MercadoLivreCompanionSessionStatus,
} from './types';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const clean = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
const integer = (value: unknown, fallback: number): number => Number.isInteger(Number(value)) ? Number(value) : fallback;
const pairingAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function pairingCode(): string {
  const bytes = randomBytes(12);
  const raw = [...bytes].map((value) => pairingAlphabet[value % pairingAlphabet.length]).join('');
  return raw.match(/.{1,4}/gu)!.join('-');
}

function sanitizedError(value: unknown): MercadoLivreCompanionErrorCode {
  const candidate = clean(value, 64).toUpperCase() as MercadoLivreCompanionErrorCode;
  return SANITIZED_COMPANION_ERRORS.has(candidate) ? candidate : 'UNKNOWN_ERROR';
}

function companionToken(): string {
  return `pc_${randomBytes(32).toString('base64url')}`;
}

function versionBefore(current: string, minimum: string): boolean {
  const numbers = (value: string) => value.split('.').slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const left = numbers(current); const right = numbers(minimum);
  for (let index = 0; index < 3; index += 1) {
    if ((left[index] ?? 0) !== (right[index] ?? 0)) return (left[index] ?? 0) < (right[index] ?? 0);
  }
  return false;
}

export class MercadoLivreCompanionService {
  constructor(
    private readonly repository: MercadoLivreCompanionRepository,
    private readonly adapter: MercadoLivreBrowserCompanionAdapter,
    private readonly validator = new MercadoLivreAffiliateLinkValidator(),
    private readonly remote: MercadoLivreRemoteBrowserService | null = null,
    private readonly sessionSync: ((userId: string, sessionCookie: string, trackingTag: string) => Promise<void>) | null = null,
    private readonly directTest: ((userId: string, sourceUrl: string, trackingLabel: string | null) => Promise<{
      affiliateUrl: string; itemId: string | null; trackingLabel: string | null;
    } | null>) | null = null,
  ) {}

  async createPairing(userId: string, requestedName: unknown) {
    const code = pairingCode();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    await this.repository.createPairing(userId, hash(code), clean(requestedName, 80) || 'Chrome', expiresAt);
    return { code, expiresAt };
  }

  async pair(input: Record<string, unknown>) {
    const code = clean(input.code, 32).toUpperCase();
    const extensionVersion = clean(input.extensionVersion, 32) || '0.0.0';
    const adapterVersion = integer(input.adapterVersion, 0);
    if (!/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/u.test(code)) throw new Error('PAIRING_CODE_INVALID');
    const token = companionToken();
    const tokenExpiresAt = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const instance = await this.repository.consumePairing({
      codeHash: hash(code), tokenHash: hash(token), tokenExpiresAt,
      name: clean(input.name, 80) || 'Chrome', extensionVersion, adapterVersion,
    });
    if (!instance) throw new Error('PAIRING_CODE_INVALID');
    return {
      instance: this.publicInstance(instance), token, tokenExpiresAt,
      minimumAdapterVersion: MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
    };
  }

  async authenticate(rawToken: string): Promise<MercadoLivreCompanionInstance | null> {
    if (!rawToken.startsWith('pc_') || rawToken.length < 40) return null;
    return this.repository.authenticate(hash(rawToken));
  }

  async syncSession(instance: MercadoLivreCompanionInstance, input: Record<string, unknown>) {
    if (!this.sessionSync) throw new MercadoLivreCompanionError('DIRECT_ENGINE_UNAVAILABLE', 'Sincronização do motor próprio indisponível.');
    const sessionCookie = clean(input.sessionCookie, 32_768);
    const trackingTag = clean(input.trackingTag, 80);
    if (sessionCookie.length < 20 || /[\r\n]/u.test(sessionCookie) || !trackingTag) {
      throw new MercadoLivreCompanionError('DIRECT_SESSION_INVALID', 'Sessão inválida.');
    }
    await this.sessionSync(instance.userId, sessionCookie, trackingTag);
    return { status: 'READY', syncedAt: new Date().toISOString() };
  }

  async heartbeat(instance: MercadoLivreCompanionInstance, input: Record<string, unknown>) {
    const adapterVersion = integer(input.adapterVersion, instance.adapterVersion);
    const extensionVersion = clean(input.extensionVersion, 32) || instance.extensionVersion;
    const mercadoLivreStatus = this.sessionStatus(input.mercadoLivreStatus);
    const outdated = adapterVersion < MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION
      || versionBefore(extensionVersion, PROMOFY_COMPANION_EXTENSION_VERSION);
    const requested = clean(input.status, 24).toUpperCase();
    const status: BrowserCompanionInstanceStatus = outdated ? 'OUTDATED' : requested === 'ERROR' ? 'ERROR' : 'ONLINE';
    const errorCode = input.errorCode ? sanitizedError(input.errorCode) : null;
    const updated = await this.repository.heartbeat(instance, {
      status, extensionVersion,
      adapterVersion, mercadoLivreStatus, errorCode,
    });
    if (mercadoLivreStatus === 'READY') await this.repository.resumeUserActionJobs(instance.userId);
    return {
      instance: this.publicInstance(updated), serverTime: new Date().toISOString(),
      pollAfterMs: 3_000, minimumAdapterVersion: MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
    };
  }

  async status(userId: string) {
    await this.repository.markOffline(new Date(Date.now() - 45_000).toISOString());
    await this.repository.expireJobs();
    const [instances, global, metrics] = await Promise.all([
      this.repository.listInstances(userId), this.repository.health(), this.repository.metrics24h(),
    ]);
    const available = instances.filter((item) => item.status !== 'REVOKED' && !item.revokedAt);
    const active = available.find((item) => item.status === 'ONLINE' && item.adapterVersion >= MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? available.find((item) => item.status !== 'OUTDATED' && item.adapterVersion >= MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION)
      ?? available[0] ?? null;
    return {
      global: {
        status: global.health_status,
        circuitState: global.circuit_state,
        lastCheckAt: global.last_check_at,
        lastSuccessAt: global.last_success_at,
        lastErrorCode: global.last_error_code,
        adapterVersion: Math.max(Number(global.adapter_version), MERCADO_LIVRE_COMPANION_ADAPTER_VERSION),
      },
      companion: active ? this.publicInstance(active) : null,
      instances: instances.map((item) => this.publicInstance(item)),
      mercadoLivre: {
        status: active?.mercadoLivreStatus ?? 'UNKNOWN',
        lastSuccessAt: active?.lastSuccessAt ?? null,
        lastErrorCode: active?.lastErrorCode ?? null,
      },
      remote: this.remote ? await this.remote.status(userId) : {
        configured: false, provider: null, preferredProvider: null, availableProviders: [],
        status: 'NOT_CONFIGURED', lastCheckedAt: null,
        lastSuccessAt: null, lastErrorCode: null, loginInProgress: false,
      },
      metrics,
      required: {
        extensionVersion: PROMOFY_COMPANION_EXTENSION_VERSION,
        adapterVersion: MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
      },
    };
  }

  async beginRemoteLogin(userId: string, mobile = false) {
    if (!this.remote) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED', 'Navegador remoto não configurado.');
    return this.remote.beginLogin(userId, { mobile });
  }

  async verifyRemoteLogin(userId: string) {
    if (!this.remote) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED', 'Navegador remoto não configurado.');
    return this.remote.verifyLogin(userId);
  }

  async createRemoteTest(userId: string, sourceUrl: unknown, trackingLabel?: unknown) {
    if (!this.remote) throw new MercadoLivreCompanionError('REMOTE_BROWSER_NOT_CONFIGURED', 'Navegador remoto não configurado.');
    const source = clean(sourceUrl, 2_000);
    if (!source) throw new Error('SOURCE_URL_REQUIRED');
    const result = await this.remote.generate(userId, source, clean(trackingLabel, 80) || null);
    const now = new Date().toISOString();
    return {
      id: `remote-${Date.now()}`, status: 'SUCCESS', sourceUrl: source,
      trackingLabel: result.trackingLabel, resultUrl: result.affiliateUrl,
      errorCode: null, expiresAt: now, createdAt: now, updatedAt: now,
    };
  }

  async revoke(userId: string, instanceId: string): Promise<void> {
    if (!await this.repository.revokeInstance(userId, instanceId)) throw new Error('COMPANION_INSTANCE_NOT_FOUND');
  }

  async createTest(userId: string, sourceUrl: unknown, trackingLabel?: unknown) {
    const source = clean(sourceUrl, 2_000);
    if (!source) throw new Error('SOURCE_URL_REQUIRED');
    const label = clean(trackingLabel, 80) || null;
    const direct = await this.directTest?.(userId, source, label);
    if (direct) {
      const now = new Date().toISOString();
      return {
        id: `direct-${Date.now()}`, status: 'SUCCESS', sourceUrl: source,
        trackingLabel: direct.trackingLabel, resultUrl: direct.affiliateUrl,
        itemId: direct.itemId, errorCode: null, expiresAt: now,
        createdAt: now, updatedAt: now,
      };
    }
    const job = await this.adapter.enqueue(userId, source, label);
    return this.publicJob(job);
  }

  async getJob(userId: string, jobId: string) {
    await this.repository.expireJobs();
    const job = await this.repository.getJob(userId, jobId);
    if (!job) throw new Error('COMPANION_JOB_NOT_FOUND');
    return this.publicJob(job);
  }

  async claim(instance: MercadoLivreCompanionInstance) {
    if (instance.adapterVersion < MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION) throw new Error('COMPANION_OUTDATED');
    await this.repository.expireJobs();
    const health = await this.repository.health();
    if (health.circuit_state === 'OPEN') throw new Error('CIRCUIT_OPEN');
    const job = await this.repository.claimJob(instance);
    return job ? {
      id: job.id, marketplace: 'mercado_livre', sourceUrl: job.normalizedUrl,
      trackingLabel: job.trackingLabel, expiresAt: job.expiresAt,
      adapterVersion: job.adapterVersion,
    } : null;
  }

  async processing(instance: MercadoLivreCompanionInstance, jobId: string): Promise<void> {
    if (!await this.repository.markProcessing(instance, jobId)) throw new Error('JOB_ALREADY_CLAIMED');
  }

  async complete(instance: MercadoLivreCompanionInstance, jobId: string, input: Record<string, unknown>) {
    const rawStatus = clean(input.status, 32).toUpperCase();
    const durationMs = Math.max(0, Math.min(180_000, integer(input.durationMs, 0)));
    const step = clean(input.step, 64) || null;
    const pageType = clean(input.pageType, 64) || null;
    let status: 'SUCCESS' | 'FAILED' | 'NEEDS_USER_ACTION';
    let resultUrl: string | null = null;
    let errorCode: MercadoLivreCompanionErrorCode | null = null;
    const currentJob = await this.repository.getJob(instance.userId, jobId);
    if (!currentJob || currentJob.claimedBy !== instance.id) throw new Error('JOB_ALREADY_CLAIMED');
    if (rawStatus === 'SUCCESS') {
      try { resultUrl = this.validator.validate(currentJob.normalizedUrl, input.affiliateUrl); }
      catch { status = 'FAILED'; errorCode = 'INVALID_AFFILIATE_URL'; }
      if (resultUrl) status = 'SUCCESS';
    } else {
      errorCode = sanitizedError(input.errorCode);
      status = USER_ACTION_ERRORS.has(errorCode) ? 'NEEDS_USER_ACTION' : 'FAILED';
    }
    const completed = await this.repository.completeJob(instance, jobId, {
      status: status!, resultUrl, itemId: resultUrl ? extractMercadoLivreItemId(currentJob.normalizedUrl) : null,
      errorCode, step, pageType, durationMs,
    });
    if (!completed) throw new Error('JOB_ALREADY_CLAIMED');
    await this.repository.recordOperation(completed).catch(() => undefined);
    if (completed.status === 'SUCCESS') await this.repository.settleConversion(completed, 'converted');
    else if (completed.status === 'NEEDS_USER_ACTION') await this.repository.settleConversion(completed, 'awaiting_companion', completed.errorCode);
    else if (['GENERATION_TIMEOUT', 'TEMPORARY_ERROR', 'PORTAL_UNAVAILABLE'].includes(completed.errorCode ?? '')) {
      await this.repository.settleConversion(completed, 'pending', completed.errorCode);
    } else await this.repository.settleConversion(completed, 'conversion_failed', completed.errorCode);
    await this.updateHealth(completed.status === 'SUCCESS', completed.errorCode);
    const mercadoLivreStatus: MercadoLivreCompanionSessionStatus = completed.status === 'SUCCESS' ? 'READY'
      : completed.status === 'NEEDS_USER_ACTION'
        ? completed.errorCode === 'AUTH_REQUIRED' ? 'NEEDS_LOGIN' : 'NEEDS_USER_ACTION'
        : completed.errorCode === 'PORTAL_CHANGED' ? 'PORTAL_CHANGED'
          : completed.errorCode === 'PORTAL_UNAVAILABLE' ? 'PORTAL_UNAVAILABLE' : instance.mercadoLivreStatus;
    await this.repository.heartbeat(instance, {
      status: 'ONLINE', extensionVersion: instance.extensionVersion,
      adapterVersion: instance.adapterVersion, mercadoLivreStatus,
      errorCode: completed.errorCode,
    });
    return this.publicJob(completed);
  }

  private async updateHealth(success: boolean, errorCode: MercadoLivreCompanionErrorCode | null): Promise<void> {
    if (success) {
      await this.repository.updateHealth({ status: 'HEALTHY', circuitState: 'CLOSED', consecutiveFailures: 0, success: true });
      return;
    }
    if (!['PORTAL_CHANGED', 'GENERATION_FAILED', 'GENERATOR_NOT_FOUND', 'INPUT_NOT_FOUND'].includes(errorCode ?? '')) return;
    const current = await this.repository.health();
    const failures = Number(current.consecutive_failures ?? 0) + 1;
    const open = failures >= 5;
    await this.repository.updateHealth({
      status: open ? 'DOWN' : 'DEGRADED', circuitState: open ? 'OPEN' : 'CLOSED',
      consecutiveFailures: failures, circuitOpenedAt: open ? new Date().toISOString() : current.circuit_opened_at,
      errorCode: errorCode ?? 'UNKNOWN_ERROR',
    });
  }

  private sessionStatus(value: unknown): MercadoLivreCompanionSessionStatus {
    const status = clean(value, 32).toUpperCase() as MercadoLivreCompanionSessionStatus;
    return ['READY', 'NEEDS_LOGIN', 'NEEDS_USER_ACTION', 'PORTAL_UNAVAILABLE', 'PORTAL_CHANGED', 'UNKNOWN'].includes(status) ? status : 'UNKNOWN';
  }

  private publicInstance(instance: MercadoLivreCompanionInstance) {
    return {
      id: instance.id, name: instance.name, status: instance.status,
      extensionVersion: instance.extensionVersion, adapterVersion: instance.adapterVersion,
      mercadoLivreStatus: instance.mercadoLivreStatus, lastSeenAt: instance.lastSeenAt,
      lastSuccessAt: instance.lastSuccessAt, lastErrorCode: instance.lastErrorCode,
      tokenExpiresAt: instance.tokenExpiresAt, createdAt: instance.createdAt, revokedAt: instance.revokedAt,
    };
  }

  private publicJob(job: Awaited<ReturnType<MercadoLivreCompanionRepository['getOrCreateJob']>>) {
    return {
      id: job.id, status: job.status, sourceUrl: job.normalizedUrl,
      trackingLabel: job.trackingLabel, resultUrl: job.resultUrl,
      errorCode: job.errorCode, expiresAt: job.expiresAt,
      createdAt: job.createdAt, updatedAt: job.updatedAt,
    };
  }
}
