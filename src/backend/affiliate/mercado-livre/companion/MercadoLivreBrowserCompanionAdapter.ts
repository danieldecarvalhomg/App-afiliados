import { extractMercadoLivreItemId, normalizeMercadoLivreProductUrl } from '../AffiliateLinkValidator';
import { MercadoLivreCompanionRepository } from './MercadoLivreCompanionRepository';
import {
  MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION,
  MercadoLivreCompanionError,
  type MercadoLivreCompanionGeneratedLink,
  type MercadoLivreCompanionJob,
} from './types';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class MercadoLivreBrowserCompanionAdapter {
  readonly version = MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION;

  constructor(
    private readonly repository: MercadoLivreCompanionRepository,
    private readonly waitTimeoutMs = Number(process.env.MERCADO_LIVRE_COMPANION_WAIT_MS ?? 35_000),
    private readonly jobTtlMs = Number(process.env.MERCADO_LIVRE_COMPANION_JOB_TTL_MS ?? 15 * 60_000),
  ) {}

  async enqueue(userId: string, sourceUrl: string, trackingLabel?: string | null, affiliateConversionId?: string | null): Promise<MercadoLivreCompanionJob> {
    const normalizedUrl = normalizeMercadoLivreProductUrl(sourceUrl);
    await this.repository.expireJobs();
    await this.assertCircuitAvailable();
    const instance = await this.repository.latestUsableInstance(userId);
    if (!instance) {
      throw new MercadoLivreCompanionError('COMPANION_NOT_PAIRED', 'Conecte a extensão AfiliHub.', false);
    }
    if (instance.adapterVersion < MINIMUM_MERCADO_LIVRE_COMPANION_ADAPTER_VERSION || instance.status === 'OUTDATED') {
      throw new MercadoLivreCompanionError('COMPANION_OUTDATED', 'Atualize a extensão AfiliHub.', false);
    }
    const accountId = await this.repository.ensureAccount(userId);
    return this.repository.getOrCreateJob({
      userId,
      affiliateAccountId: accountId,
      sourceUrl,
      normalizedUrl,
      trackingLabel,
      affiliateConversionId,
      expiresAt: new Date(Date.now() + this.jobTtlMs).toISOString(),
    });
  }

  async generate(userId: string, sourceUrl: string, trackingLabel?: string | null, affiliateConversionId?: string | null): Promise<MercadoLivreCompanionGeneratedLink> {
    const normalizedUrl = normalizeMercadoLivreProductUrl(sourceUrl);
    const operationKey = this.repository.operationKey(normalizedUrl, trackingLabel);
    const cached = await this.repository.cachedJob(userId, operationKey);
    if (cached?.resultUrl) return this.result(cached, true);

    const job = await this.enqueue(userId, sourceUrl, trackingLabel, affiliateConversionId);
    if (job.status === 'SUCCESS' && job.resultUrl) return this.result(job, true);
    const deadline = Date.now() + Math.max(1_000, this.waitTimeoutMs);
    let current = job;
    while (Date.now() < deadline) {
      await wait(750);
      current = await this.repository.getJob(userId, job.id) ?? current;
      if (current.status === 'SUCCESS' && current.resultUrl) return this.result(current, false);
      if (current.status === 'NEEDS_USER_ACTION') {
        throw new MercadoLivreCompanionError(current.errorCode ?? 'USER_ACTION_REQUIRED', 'O Mercado Livre precisa confirmar seu acesso.');
      }
      if (current.status === 'FAILED' || current.status === 'EXPIRED' || current.status === 'CANCELLED') {
        const code = current.status === 'EXPIRED' ? 'JOB_EXPIRED' : current.errorCode ?? 'GENERATION_FAILED';
        throw new MercadoLivreCompanionError(code, 'O Companion não concluiu a geração.', ['GENERATION_TIMEOUT', 'TEMPORARY_ERROR', 'PORTAL_UNAVAILABLE'].includes(code));
      }
    }
    const instance = await this.repository.latestUsableInstance(userId);
    if (!instance || instance.status === 'OFFLINE') {
      throw new MercadoLivreCompanionError('COMPANION_OFFLINE', 'A extensão está offline; o job continuará aguardando.', true);
    }
    throw new MercadoLivreCompanionError('TEMPORARY_ERROR', 'A geração continua pendente no Companion.', true);
  }

  private result(job: MercadoLivreCompanionJob, cached: boolean): MercadoLivreCompanionGeneratedLink {
    if (!job.resultUrl) throw new MercadoLivreCompanionError('INVALID_AFFILIATE_URL', 'Resultado vazio.');
    return {
      marketplace: 'mercado_livre',
      sourceUrl: job.normalizedUrl,
      affiliateUrl: job.resultUrl,
      itemId: job.itemId ?? extractMercadoLivreItemId(job.normalizedUrl),
      trackingLabel: job.trackingLabel,
      status: 'SUCCESS',
      cached,
    };
  }

  private async assertCircuitAvailable(): Promise<void> {
    const health = await this.repository.health();
    if (health.circuit_state !== 'OPEN') return;
    const openedAt = health.circuit_opened_at ? new Date(health.circuit_opened_at).getTime() : Date.now();
    if (Date.now() - openedAt < 5 * 60_000) {
      throw new MercadoLivreCompanionError('CIRCUIT_OPEN', 'Integração temporariamente indisponível.', true);
    }
    await this.repository.updateHealth({
      status: 'DEGRADED', circuitState: 'HALF_OPEN',
      consecutiveFailures: Number(health.consecutive_failures ?? 0),
      errorCode: health.last_error_code,
    });
  }
}
