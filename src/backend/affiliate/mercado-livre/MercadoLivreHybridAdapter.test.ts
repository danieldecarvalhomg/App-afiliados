import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreHybridAdapter } from './MercadoLivreHybridAdapter';
import { MercadoLivreCompanionError } from './companion/types';

const result = { affiliateUrl:'https://meli.la/abc',itemId:'MLB123',trackingLabel:null,cached:false };
const credentials = { appId:'browser-companion', secret:'scoped-extension-token' };

describe('MercadoLivreHybridAdapter', () => {
  it('usa o motor próprio sem acionar navegador quando a sessão está sincronizada', async () => {
    const directResult = { ...result, provider:'mercado_livre_unofficial_v1' };
    const direct = { configured:()=>true, generate:vi.fn(async()=>directResult) };
    const remote = { configured:()=>true, generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(direct as any, remote as any, null).generate(
      'u','account','https://produto.mercadolivre.com.br/MLB-123',
      { ...credentials, sessionCookie:'session=abc123', trackingTag:'principal' },
    )).resolves.toEqual(directResult);
    expect(remote.generate).not.toHaveBeenCalled();
  });

  it('usa o navegador remoto como motor principal', async () => {
    const remote = { configured:()=>true, generate:vi.fn(async()=>result) };
    const companion = { generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(null, remote as any, companion as any).generate('u','account','https://produto.mercadolivre.com.br/MLB-123',credentials)).resolves.toEqual({ ...result, provider:'mercado_livre_remote_browser_v1' });
    expect(companion.generate).not.toHaveBeenCalled();
  });

  it('usa a extensão como fallback quando a sessão remota ainda não está pronta', async () => {
    const remote = { configured:()=>true, generate:vi.fn(async()=>{throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any,'login');}) };
    const companion = { generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(null, remote as any, companion as any).generate('u','account','https://produto.mercadolivre.com.br/MLB-123',credentials)).resolves.toEqual({ ...result, provider:'mercado_livre_browser_companion_v1' });
    expect(companion.generate).toHaveBeenCalledOnce();
  });
});
