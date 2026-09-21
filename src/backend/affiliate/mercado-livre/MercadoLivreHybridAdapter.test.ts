import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreHybridAdapter } from './MercadoLivreHybridAdapter';

const result = { affiliateUrl:'https://meli.la/abc',itemId:'MLB123',trackingLabel:null,cached:false };
const credentials = { appId:'browser-companion', secret:'scoped-extension-token' };

describe('MercadoLivreHybridAdapter', () => {
  it('usa somente o motor próprio sem acionar navegador quando a sessão está sincronizada', async () => {
    const directResult = { ...result, provider:'mercado_livre_unofficial_v1' };
    const direct = { configured:()=>true, generate:vi.fn(async()=>directResult) };
    await expect(new MercadoLivreHybridAdapter(direct as any).generate(
      'u','account','https://produto.mercadolivre.com.br/MLB-1234567',
      { ...credentials, sessionCookie:'session=abc123', trackingTag:'principal' },
    )).resolves.toEqual(directResult);
  });

  it('recupera meli.la antes de chamar o motor próprio', async () => {
    const directResult = { ...result, provider:'mercado_livre_unofficial_v1' };
    const direct = { configured:()=>true, generate:vi.fn(async()=>directResult) };
    const recoveredUrl = 'https://produto.mercadolivre.com.br/MLB-1234567-produto';
    const recovery = { recover:vi.fn(async()=>({ productUrl:recoveredUrl, candidates:[recoveredUrl] })) };
    await expect(new MercadoLivreHybridAdapter(direct as any, recovery as any).generate(
      'u','account','https://meli.la/2FdaeDB',
      { ...credentials, sessionCookie:'session=abc123', trackingTag:'principal' },
    )).resolves.toEqual(directResult);
    expect(recovery.recover).toHaveBeenCalledWith('https://meli.la/2FdaeDB','u');
    expect(direct.generate).toHaveBeenCalledWith('u','account',recoveredUrl,expect.any(Object),undefined);
  });

  it('recusa a conversão quando não existe sessão direta, mesmo com navegador remoto configurado', async () => {
    const remote = { configured:()=>true, generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(null).generate('u','account','https://produto.mercadolivre.com.br/MLB-123',credentials)).rejects.toMatchObject({ code:'DIRECT_SESSION_REQUIRED' });
    expect(remote.generate).not.toHaveBeenCalled();
  });

  it('recusa a conversão quando a sessão direta ainda não foi sincronizada', async () => {
    const direct = { configured:()=>false, generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(direct as any).generate('u','account','https://produto.mercadolivre.com.br/MLB-123',credentials)).rejects.toMatchObject({ code:'DIRECT_SESSION_REQUIRED' });
    expect(direct.generate).not.toHaveBeenCalled();
  });
});
