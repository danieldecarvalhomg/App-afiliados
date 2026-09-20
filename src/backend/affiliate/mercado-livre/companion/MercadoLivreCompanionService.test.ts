import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreCompanionService } from './MercadoLivreCompanionService';

const now = new Date().toISOString();
const instance = {
  id: 'instance-a', userId: 'user-a', name: 'Chrome', status: 'ONLINE', extensionVersion: '1.2.0',
  adapterVersion: 5, mercadoLivreStatus: 'READY', lastSeenAt: now, lastSuccessAt: null,
  lastErrorCode: null, tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now, revokedAt: null,
};
const job = {
  id: 'job-a', userId: 'user-a', affiliateAccountId: 'account-a', affiliateConversionId: 'conversion-a',
  operationKey: 'key', sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM',
  normalizedUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM', trackingLabel: null,
  status: 'PROCESSING', claimedBy: 'instance-a', claimedAt: now, completedAt: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), resultUrl: null, itemId: null,
  errorCode: null, adapterVersion: 5, createdAt: now, updatedAt: now,
};

function repository(overrides: Record<string, unknown> = {}) {
  return {
    createPairing: vi.fn(async () => 'pairing-a'), consumePairing: vi.fn(async () => instance), authenticate: vi.fn(async () => instance),
    heartbeat: vi.fn(async (_instance, input) => ({ ...instance, ...input })), resumeUserActionJobs: vi.fn(async () => undefined),
    markOffline: vi.fn(async () => undefined), expireJobs: vi.fn(async () => undefined), listInstances: vi.fn(async () => [instance]),
    health: vi.fn(async () => ({ health_status: 'HEALTHY', circuit_state: 'CLOSED', last_check_at: now, last_success_at: now, last_error_code: null, adapter_version: 3, consecutive_failures: 0 })),
    metrics24h: vi.fn(async () => ({})), revokeInstance: vi.fn(async () => true), claimJob: vi.fn(async () => job),
    markProcessing: vi.fn(async () => true), getJob: vi.fn(async () => job), completeJob: vi.fn(async (_instance, _jobId, input) => ({ ...job, ...input, updatedAt: new Date().toISOString() })),
    recordOperation: vi.fn(async () => undefined), settleConversion: vi.fn(async () => undefined), updateHealth: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('MercadoLivreCompanionService', () => {
  it('gera pareamento de uso único e persiste somente o hash do código', async () => {
    const repo = repository();
    const result = await new MercadoLivreCompanionService(repo as any, {} as any).createPairing('user-a', 'Meu Chrome');
    expect(result.code).toMatch(/^[A-Z2-9]{4}(?:-[A-Z2-9]{4}){2}$/u);
    expect(repo.createPairing).toHaveBeenCalledWith('user-a', expect.not.stringContaining(result.code), 'Meu Chrome', result.expiresAt);
  });

  it('emite credencial própria limitada e nunca a persiste em texto puro', async () => {
    const repo = repository();
    const result = await new MercadoLivreCompanionService(repo as any, {} as any).pair({ code: 'ABCD-EFGH-JKLM', name: 'Chrome', extensionVersion: '1.2.0', adapterVersion: 5 });
    expect(result.token).toMatch(/^pc_/u);
    const persisted = (repo.consumePairing as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(persisted.tokenHash).not.toBe(result.token);
    expect(JSON.stringify(persisted)).not.toContain(result.token);
  });

  it('retoma jobs que exigiam ação quando a sessão volta a READY', async () => {
    const repo = repository();
    await new MercadoLivreCompanionService(repo as any, {} as any).heartbeat(instance as any, { mercadoLivreStatus: 'READY', extensionVersion: '1.2.0', adapterVersion: 5 });
    expect(repo.resumeUserActionJobs).toHaveBeenCalledWith('user-a');
  });

  it('sincroniza a sessão somente por uma instância autenticada e sem alterar o conteúdo', async () => {
    const sync = vi.fn(async () => undefined);
    const service = new MercadoLivreCompanionService(repository() as any, {} as any, undefined, null, sync);
    const result = await service.syncSession(instance as any, {
      sessionCookie: 'session=abc123; affiliate=xyz789', trackingTag: 'principal',
    });
    expect(result.status).toBe('READY');
    expect(sync).toHaveBeenCalledWith('user-a', 'session=abc123; affiliate=xyz789', 'principal');
  });

  it('expõe a versão do adaptador do servidor mesmo com health legado', async () => {
    const repo = repository();
    const result = await new MercadoLivreCompanionService(repo as any, {} as any).status('user-a');
    expect(result.global.adapterVersion).toBe(5);
    expect(result.required).toMatchObject({ extensionVersion: '1.2.0', adapterVersion: 5 });
  });

  it('impede outra instância de concluir o job', async () => {
    const repo = repository();
    const other = { ...instance, id: 'instance-b' };
    await expect(new MercadoLivreCompanionService(repo as any, {} as any).complete(other as any, 'job-a', { status: 'SUCCESS', affiliateUrl: 'https://meli.la/AbC123' })).rejects.toThrow('JOB_ALREADY_CLAIMED');
    expect(repo.completeJob).not.toHaveBeenCalled();
  });

  it('valida novamente o link no backend antes de concluir e persistir', async () => {
    const repo = repository();
    const result = await new MercadoLivreCompanionService(repo as any, {} as any).complete(instance as any, 'job-a', { status: 'SUCCESS', affiliateUrl: 'https://meli.la/AbC123', durationMs: 123 });
    expect(result.status).toBe('SUCCESS');
    expect(repo.completeJob).toHaveBeenCalledWith(instance, 'job-a', expect.objectContaining({ status: 'SUCCESS', resultUrl: 'https://meli.la/AbC123' }));
    expect(repo.settleConversion).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUCCESS' }), 'converted');
  });

  it('classifica CAPTCHA como ação do usuário, sem bypass ou retry automático', async () => {
    const completed = { ...job, status: 'NEEDS_USER_ACTION', errorCode: 'CAPTCHA_REQUIRED' };
    const repo = repository({ completeJob: vi.fn(async () => completed) });
    await new MercadoLivreCompanionService(repo as any, {} as any).complete(instance as any, 'job-a', { status: 'FAILED', errorCode: 'CAPTCHA_REQUIRED', step: 'detect_session' });
    expect(repo.settleConversion).toHaveBeenCalledWith(completed, 'awaiting_companion', 'CAPTCHA_REQUIRED');
  });
});
