import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreAffiliateProvider } from './MercadoLivreAffiliateProvider';
import { MercadoLivreCompanionError } from './mercado-livre/companion/types';

const credentials = { appId: 'browser-companion', secret: 'scoped-extension-token' };

describe('MercadoLivreAffiliateProvider', () => {
  it('delega a geração ao adapter com contexto do usuário e tracking', async () => {
    const generate = vi.fn(async () => ({ affiliateUrl: 'https://meli.la/abc123', itemId: 'MLB1234567', trackingLabel: 'promofy_manual', cached: false, provider: 'mercado_livre_unofficial_v1' }));
    const provider = new MercadoLivreAffiliateProvider({ generate } as any);
    const result = await provider.convert({ url: 'https://produto.mercadolivre.com.br/MLB-1234567', credentials, userId: 'user-a', affiliateAccountId: 'account-a', trackingLabel: 'promofy_manual' });
    expect(generate).toHaveBeenCalledWith('user-a', 'account-a', 'https://produto.mercadolivre.com.br/MLB-1234567', credentials, 'promofy_manual', null);
    expect(result).toMatchObject({ success: true, convertedUrl: 'https://meli.la/abc123', provider: 'mercado_livre_unofficial_v1' });
  });

  it('exige contexto autenticado sem enfileirar job', async () => {
    const generate = vi.fn();
    const result = await new MercadoLivreAffiliateProvider({ generate } as any).convert({ url: 'https://produto.mercadolivre.com.br/MLB-1234567', credentials });
    expect(generate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ success: false, convertedUrl: null, errorCode: 'AUTH_REQUIRED' });
  });

  it('propaga erro específico e nunca usa a URL original como fallback', async () => {
    const original = 'https://produto.mercadolivre.com.br/MLB-1234567';
    const generate = vi.fn(async () => { throw new MercadoLivreCompanionError('CAPTCHA_REQUIRED', 'CAPTCHA solicitado.'); });
    const result = await new MercadoLivreAffiliateProvider({ generate } as any).convert({ url: original, credentials, userId: 'user-a', affiliateAccountId: 'account-a' });
    expect(result).toMatchObject({ success: false, convertedUrl: null, errorCode: 'CAPTCHA_REQUIRED' });
    expect(result.convertedUrl).not.toBe(original);
  });
});
