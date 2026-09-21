import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreHybridAdapter } from './MercadoLivreHybridAdapter';

const result = { affiliateUrl:'https://meli.la/abc',itemId:'MLB123',trackingLabel:null,cached:false };
const credentials = { appId:'browser-companion', secret:'scoped-extension-token' };

describe('MercadoLivreHybridAdapter', () => {
  it('usa somente o motor próprio sem acionar navegador quando a sessão está sincronizada', async () => {
    const directResult = { ...result, provider:'mercado_livre_unofficial_v1' };
    const direct = { configured:()=>true, generate:vi.fn(async()=>directResult) };
    await expect(new MercadoLivreHybridAdapter(direct as any).generate(
      'u','account','https://produto.mercadolivre.com.br/MLB-123',
      { ...credentials, sessionCookie:'session=abc123', trackingTag:'principal' },
    )).resolves.toEqual(directResult);
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
