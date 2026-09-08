import { describe, expect, it, vi } from 'vitest';
import { AmazonAffiliateProvider, extractAmazonAsin } from './AmazonAffiliateProvider';

describe('AmazonAffiliateProvider', () => {
  it('extrai ASIN dos formatos canônicos brasileiros', () => {
    expect(extractAmazonAsin('https://www.amazon.com.br/dp/B0ABC12345?ref=x')).toBe('B0ABC12345');
    expect(extractAmazonAsin('https://amazon.com.br/gp/product/B0ABC12345')).toBe('B0ABC12345');
  });
  it('usa a detailPageURL afiliada devolvida pela Creators API', async () => {
    const client = { getItems: vi.fn(async () => [{ detailPageURL: 'https://www.amazon.com.br/dp/B0ABC12345?tag=promofy-20' }]) } as any;
    const result = await new AmazonAffiliateProvider(client).convert({ url: 'https://www.amazon.com.br/dp/B0ABC12345', credentials: { appId: 'id', secret: 'secret-123', partnerTag: 'promofy-20' } });
    expect(result).toEqual({ success: true, convertedUrl: 'https://www.amazon.com.br/dp/B0ABC12345?tag=promofy-20', provider: 'amazon_creators_api' });
  });
  it('não fabrica link quando a API não devolve o produto', async () => {
    const result = await new AmazonAffiliateProvider({ getItems: vi.fn(async () => []) } as any).convert({ url: 'https://www.amazon.com.br/dp/B0ABC12345', credentials: { appId: 'id', secret: 'secret-123', partnerTag: 'promofy-20' } });
    expect(result).toMatchObject({ success: false, convertedUrl: null, errorCode: 'AMAZON_ITEM_NOT_FOUND' });
  });
});
