import { describe, expect, it, vi } from 'vitest';
import type { AffiliateRepository } from '../affiliate/AffiliateRepository';
import type { ProductRecord } from './types';
import { ProductService } from './ProductService';

function product(overrides: Partial<ProductRecord> = {}): ProductRecord { const now = new Date().toISOString(); return {
  id: 'product-1', userId: 'user-a', sourceType: 'manual', sourceReferenceId: null, title: 'Echo Dot', category: null,
  imageUrl: null, price: null, originalPrice: null, discountPercent: null, currency: null, couponCode: null,
  couponDescription: null, freeShipping: null, marketplace: 'unknown', sourceUrl: null, affiliateUrl: null,
  affiliateStatus: 'pending_url', affiliateConversionId: null, observations: null, createdAt: now, updatedAt: now, ...overrides };
}
function setup() {
  let saved = product(); const createConversion = vi.fn(async () => {});
  const deleteProduct = vi.fn(async (_userId: string, productId: string) => productId === saved.id);
  const repository = { createManualProduct: vi.fn(async (_user: string, input: any) => { saved = product({ title: input.title, sourceUrl: input.sourceUrl, affiliateStatus: input.sourceUrl ? 'pending' : 'pending_url' }); return saved; }),
    getProduct: vi.fn(async () => saved), createConversion, deleteProduct, listProducts: vi.fn(async () => [saved]) } as unknown as AffiliateRepository;
  const conversions = { kick: vi.fn() } as any; return { service: new ProductService(repository, conversions), createConversion, deleteProduct, conversions };
}
describe('cadastro manual multiorigem', () => {
  it('salva produto manual sem link', async () => { const { service, createConversion } = setup(); const result = await service.createManual('user-a', { title: 'Echo Dot' }); expect(result).toMatchObject({ success: true, data: { sourceType: 'manual', affiliateStatus: 'pending_url' } }); expect(createConversion).not.toHaveBeenCalled(); });
  it('produto manual com link usa o pipeline afiliado', async () => { const { service, createConversion, conversions } = setup(); const result = await service.createManual('user-a', { title: 'Echo Dot', sourceUrl: 'https://shopee.com.br/item' }); expect(result.success).toBe(true); expect(createConversion).toHaveBeenCalledWith('user-a','manual','product-1','https://shopee.com.br/item'); expect(conversions.kick).toHaveBeenCalled(); });
  it('title é obrigatório', async () => { const { service } = setup(); await expect(service.createManual('user-a', { title: '  ' })).resolves.toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } }); });
  it('exclui somente o produto pertencente ao usuário', async () => {
    const { service, deleteProduct } = setup();
    await expect(service.delete('user-a', 'product-1')).resolves.toMatchObject({ success: true });
    expect(deleteProduct).toHaveBeenCalledWith('user-a', 'product-1');
  });
  it('retorna não encontrado sem revelar produtos de outro usuário', async () => {
    const { service } = setup();
    await expect(service.delete('user-a', 'product-other')).resolves.toMatchObject({ success: false, error: { code: 'PRODUCT_NOT_FOUND' } });
  });
  it('aceita o link meli.la gerado no celular e conclui a conversão', async () => {
    const source = 'https://produto.mercadolivre.com.br/MLB-1234567-produto';
    const current = product({ marketplace: 'mercado_livre', sourceUrl: source, affiliateConversionId: 'conversion-1', affiliateStatus: 'awaiting_companion' });
    const completeManualConversion = vi.fn(async () => product({ ...current, affiliateStatus: 'converted', affiliateUrl: 'https://meli.la/AbC123' }));
    const repository = { getProduct: vi.fn(async () => current), completeManualConversion } as unknown as AffiliateRepository;
    const service = new ProductService(repository, {} as any);
    const result = await service.completeManualAffiliate('user-a', current.id, 'https://meli.la/AbC123');
    expect(result).toMatchObject({ success: true, data: { affiliateStatus: 'converted', affiliateUrl: 'https://meli.la/AbC123' } });
    expect(completeManualConversion).toHaveBeenCalledWith('user-a', current.id, 'https://meli.la/AbC123', 'mercado_livre');
  });
  it('recusa no celular um link que não seja afiliado do Mercado Livre', async () => {
    const current = product({ marketplace: 'mercado_livre', sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567-produto', affiliateConversionId: 'conversion-1' });
    const completeManualConversion = vi.fn();
    const repository = { getProduct: vi.fn(async () => current), completeManualConversion } as unknown as AffiliateRepository;
    const service = new ProductService(repository, {} as any);
    await expect(service.completeManualAffiliate('user-a', current.id, 'https://example.com/not-affiliate')).resolves.toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(completeManualConversion).not.toHaveBeenCalled();
  });
});
