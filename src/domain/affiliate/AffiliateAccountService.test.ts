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
