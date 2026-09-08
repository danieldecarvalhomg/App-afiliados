import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreBrowserCompanionAdapter } from './MercadoLivreBrowserCompanionAdapter';

const source = 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM';
const instance = {
  id: 'instance-a', userId: 'user-a', name: 'Chrome', status: 'ONLINE',
  extensionVersion: '1.1.0', adapterVersion: 4, mercadoLivreStatus: 'READY',
  lastSeenAt: new Date().toISOString(), lastSuccessAt: null, lastErrorCode: null,
  tokenExpiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: new Date().toISOString(), revokedAt: null,
};
const job = {
  id: 'job-a', userId: 'user-a', affiliateAccountId: 'account-a', affiliateConversionId: null,
  operationKey: 'key', sourceUrl: source, normalizedUrl: source, trackingLabel: 'promofy_manual',
  status: 'PENDING', claimedBy: null, claimedAt: null, completedAt: null,
  expiresAt: new Date(Date.now() + 60_000).toISOString(), resultUrl: null, itemId: null,
  errorCode: null, adapterVersion: 4, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
};

function repository(overrides: Record<string, unknown> = {}) {
  return {
    operationKey: vi.fn(() => 'key'), cachedJob: vi.fn(async () => null), expireJobs: vi.fn(async () => undefined),
    health: vi.fn(async () => ({ circuit_state: 'CLOSED' })), latestUsableInstance: vi.fn(async () => instance),
    ensureAccount: vi.fn(async () => 'account-a'), getOrCreateJob: vi.fn(async () => job),
    getJob: vi.fn(async () => job), updateHealth: vi.fn(async () => undefined), ...overrides,
  };
}

describe('MercadoLivreBrowserCompanionAdapter', () => {
  it('enfileira um job mesmo com extensão offline, sem tentar browser no servidor', async () => {
    const repo = repository({ latestUsableInstance: vi.fn(async () => ({ ...instance, status: 'OFFLINE' })) });
    const result = await new MercadoLivreBrowserCompanionAdapter(repo as any).enqueue('user-a', source, 'promofy_manual', 'conversion-a');
    expect(result.id).toBe('job-a');
    expect(repo.getOrCreateJob).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a', affiliateConversionId: 'conversion-a' }));
  });

  it('bloqueia geração sem Companion pareado', async () => {
    const repo = repository({ latestUsableInstance: vi.fn(async () => null) });
    await expect(new MercadoLivreBrowserCompanionAdapter(repo as any).enqueue('user-a', source)).rejects.toMatchObject({ code: 'COMPANION_NOT_PAIRED' });
  });

  it('reutiliza resultado válido em cache sem criar outro job', async () => {
    const cached = { ...job, status: 'SUCCESS', resultUrl: 'https://meli.la/AbC123', itemId: 'MLB1234567890' };
    const repo = repository({ cachedJob: vi.fn(async () => cached) });
    const result = await new MercadoLivreBrowserCompanionAdapter(repo as any).generate('user-a', source, 'promofy_manual');
    expect(result).toMatchObject({ affiliateUrl: 'https://meli.la/AbC123', cached: true });
    expect(repo.getOrCreateJob).not.toHaveBeenCalled();
  });

  it('abre o circuito quando a saúde global indica falha protegida', async () => {
    const repo = repository({ health: vi.fn(async () => ({ circuit_state: 'OPEN', circuit_opened_at: new Date().toISOString() })) });
    await expect(new MercadoLivreBrowserCompanionAdapter(repo as any).enqueue('user-a', source)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
  });
});
