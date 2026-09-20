import { describe, expect, it, vi } from 'vitest';
import type { AffiliateRepository } from './AffiliateRepository';
import { AffiliateAccountService } from './AffiliateAccountService';

function setup(validateShopee: (credentials: { appId: string; secret: string }) => Promise<void>) {
  const upsertAccount = vi.fn(async () => {});
  const setValidationStatus = vi.fn(async () => {});
  const repository = { upsertAccount, setValidationStatus } as unknown as AffiliateRepository;
  const protectCredentials = vi.fn(() => ({ ciphertext: 'encrypted' }));
  return {
    service: new AffiliateAccountService(repository, protectCredentials, { shopee: validateShopee }),
    protectCredentials,
    upsertShopeeAccount: upsertAccount,
    setShopeeValidationStatus: setValidationStatus,
  };
}

describe('validação de conta afiliada Shopee', () => {
  it('marca como válida somente depois da validação oficial', async () => {
    const validate = vi.fn(async () => {});
    const { service, protectCredentials, upsertShopeeAccount, setShopeeValidationStatus } = setup(validate);

    await expect(service.configureShopee('user-a', 'app-id', 'secret-123')).resolves.toMatchObject({ success: true });
    expect(protectCredentials).toHaveBeenCalledWith({ appId: 'app-id', secret: 'secret-123' });
    expect(upsertShopeeAccount).toHaveBeenCalledWith('user-a', 'shopee', 'shopee_open_api', { ciphertext: 'encrypted' });
    expect(validate).toHaveBeenCalledWith({ appId: 'app-id', secret: 'secret-123' });
    expect(setShopeeValidationStatus).toHaveBeenCalledWith('user-a', 'shopee', 'valid');
  });

  it('classifica credenciais recusadas como inválidas', async () => {
    const { service, setShopeeValidationStatus } = setup(async () => { throw new Error('SHOPEE_UNAUTHORIZED'); });

    await expect(service.configureShopee('user-a', 'app-id', 'secret-123')).resolves.toMatchObject({ success: false, error: { code: 'SHOPEE_CREDENTIALS_INVALID' } });
    expect(setShopeeValidationStatus).toHaveBeenCalledWith('user-a', 'shopee', 'invalid', 'SHOPEE_CREDENTIALS_INVALID');
  });

  it('distingue indisponibilidade do provedor de credencial inválida', async () => {
    const { service, setShopeeValidationStatus } = setup(async () => { throw new Error('SHOPEE_PROVIDER_UNAVAILABLE'); });

    await expect(service.configureShopee('user-a', 'app-id', 'secret-123')).resolves.toMatchObject({ success: false, error: { code: 'SHOPEE_VALIDATION_ERROR' } });
    expect(setShopeeValidationStatus).toHaveBeenCalledWith('user-a', 'shopee', 'error', 'SHOPEE_VALIDATION_ERROR');
  });
});

describe('sincronização da sessão Mercado Livre', () => {
  it('valida antes de persistir e preserva as credenciais de catálogo', async () => {
    const validate = vi.fn(async () => undefined);
    const upsertAccount = vi.fn(async () => undefined);
    const setValidationStatus = vi.fn(async () => undefined);
    const repository = {
      getAccountCredentials: vi.fn(async () => ({ appId: 'app-id', secret: 'secret-123', accessToken: 'oauth-token' })),
      upsertAccount, setValidationStatus,
    } as unknown as AffiliateRepository;
    const protect = vi.fn((value) => ({ encrypted: value }));
    const service = new AffiliateAccountService(repository, protect, { mercado_livre: validate });
    const result = await service.syncMercadoLivreSession('user-a', 'session=abc123; affiliate=xyz789', 'principal');
    expect(result).toMatchObject({ success: true });
    expect(validate).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'oauth-token', sessionCookie: expect.stringContaining('session='), trackingTag: 'principal' }));
    expect(upsertAccount).toHaveBeenCalledWith('user-a', 'mercado_livre', 'mercado_livre_unofficial_v1', expect.any(Object));
    expect(setValidationStatus).toHaveBeenCalledWith('user-a', 'mercado_livre', 'valid');
  });

  it('não persiste uma sessão recusada pelo Mercado Livre', async () => {
    const upsertAccount = vi.fn();
    const repository = { getAccountCredentials: vi.fn(async () => null), upsertAccount } as unknown as AffiliateRepository;
    const service = new AffiliateAccountService(repository, (value) => ({ value }), {
      mercado_livre: async () => { throw new Error('AUTH_REQUIRED'); },
    });
    await expect(service.syncMercadoLivreSession('user-a', 'session=abc123; affiliate=xyz789', 'principal'))
      .resolves.toMatchObject({ success: false, error: { code: 'MERCADO_LIVRE_SESSION_INVALID' } });
    expect(upsertAccount).not.toHaveBeenCalled();
  });
});
