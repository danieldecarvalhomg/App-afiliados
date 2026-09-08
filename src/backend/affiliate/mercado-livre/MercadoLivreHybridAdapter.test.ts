import { describe, expect, it, vi } from 'vitest';
import { MercadoLivreHybridAdapter } from './MercadoLivreHybridAdapter';
import { MercadoLivreCompanionError } from './companion/types';

const result = { affiliateUrl:'https://meli.la/abc',itemId:'MLB123',trackingLabel:null,cached:false };

describe('MercadoLivreHybridAdapter', () => {
  it('usa o navegador remoto como motor principal', async () => {
    const remote = { configured:()=>true, generate:vi.fn(async()=>result) };
    const companion = { generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(remote as any, companion as any).generate('u','https://produto.mercadolivre.com.br/MLB-123')).resolves.toEqual(result);
    expect(companion.generate).not.toHaveBeenCalled();
  });

  it('usa a extensão como fallback quando a sessão remota ainda não está pronta', async () => {
    const remote = { configured:()=>true, generate:vi.fn(async()=>{throw new MercadoLivreCompanionError('REMOTE_LOGIN_REQUIRED' as any,'login');}) };
    const companion = { generate:vi.fn(async()=>result) };
    await expect(new MercadoLivreHybridAdapter(remote as any, companion as any).generate('u','https://produto.mercadolivre.com.br/MLB-123')).resolves.toEqual(result);
    expect(companion.generate).toHaveBeenCalledOnce();
  });
});
