import { describe, expect, it, vi } from 'vitest';
import { resolvePlatform } from '../../domain/affiliate/PlatformResolver';
import { AffiliateLinkService } from '../../domain/affiliate/AffiliateLinkService';
import { ShopeeAffiliateProvider } from './ShopeeAffiliateProvider';

describe('plataforma e ShopeeAffiliateProvider', () => {
  it('identifica Shopee deterministicamente', () => expect(resolvePlatform('https://s.shopee.com.br/ABC')).toBe('shopee'));
  it('usa URL resolvida como fonte de verdade', () => expect(resolvePlatform('https://amazon.com.br/dp/1')).toBe('amazon'));
  it('retorna converted_url real devolvida pela API', async () => {
    const fake = vi.fn(async () => new Response(JSON.stringify({ data: { generateShortLink: { shortLink: 'https://s.shopee.com.br/AFF123' } } }), { status: 200 })) as unknown as typeof fetch;
    const result = await new ShopeeAffiliateProvider(fake).convert({ url: 'https://shopee.com.br/product/1', credentials: { appId: 'app', secret: 'secret-value' }, subIds: ['conversion-1'] });
    expect(result).toMatchObject({ success: true, convertedUrl: 'https://s.shopee.com.br/AFF123' });
    expect(JSON.parse(String((fake as any).mock.calls[0][1].body)).query).toContain('subIds: ["conversion-1"]');
  });
  it('falha sem reutilizar URL original', async () => {
    const fake = (async () => new Response(JSON.stringify({ errors: [{ message: 'invalid' }] }), { status: 200 })) as typeof fetch;
    const original = 'https://shopee.com.br/product/1';
    const result = await new AffiliateLinkService([new ShopeeAffiliateProvider(fake)]).convert('shopee', original, { appId: 'app', secret: 'bad-secret' });
    expect(result.success).toBe(false); expect(result.convertedUrl).toBeNull(); expect(result.convertedUrl).not.toBe(original);
  });
  it('serviço rejeita provider que declara sucesso devolvendo a URL original', async () => {
    const original = 'https://shopee.com.br/product/1';
    const badProvider = { platform: 'shopee' as const, providerName: 'bad', convert: async () => ({ success: true, convertedUrl: original, provider: 'bad' }) };
    await expect(new AffiliateLinkService([badProvider]).convert('shopee', original, { appId: 'app', secret: 'secret' }))
      .resolves.toMatchObject({ success: false, convertedUrl: null, errorCode: 'INVALID_CONVERTED_URL' });
  });
});
