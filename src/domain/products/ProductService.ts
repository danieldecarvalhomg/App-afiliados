import type { AppResult } from '../errors';
import { fail, ok } from '../errors';
import type { AffiliateRepository } from '../affiliate/AffiliateRepository';
import type { AffiliateConversionService } from '../affiliate/AffiliateConversionService';
import type { ProductSourceType } from '../affiliate/types';
import type { ManualProductInput, ProductRecord } from './types';
import type { ProductMediaService } from '../media/ProductMediaService';
import type { InternalAutomationPublisher } from '../automation/types';
import { resolvePlatform } from '../affiliate/PlatformResolver';
import { MercadoLivreAffiliateLinkValidator } from '../../backend/affiliate/mercado-livre/AffiliateLinkValidator';

function optionalMoney(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value); if (!Number.isFinite(number) || number < 0 || number > 99_999_999) throw new Error('INVALID_MONEY');
  return Math.round(number * 100) / 100;
}
function text(value: unknown, max: number): string | null {
  if (value == null) return null; if (typeof value !== 'string') throw new Error('INVALID_TEXT');
  const trimmed = value.trim(); return trimmed ? trimmed.slice(0, max) : null;
}
function httpUrl(value: unknown): string | null {
  const candidate = text(value, 2_000);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('INVALID_URL');
    return parsed.toString();
  } catch {
    throw new Error('INVALID_URL');
  }
}
export class ProductService {
  constructor(
    private readonly repository: AffiliateRepository,
    private readonly conversions: AffiliateConversionService,
    private readonly media?: ProductMediaService,
    private readonly automations?: InternalAutomationPublisher,
  ) {}
  async list(userId: string, sourceType?: string): Promise<AppResult<ProductRecord[]>> {
    if (sourceType && !['whatsapp','marketplace_radar','manual'].includes(sourceType)) return fail('VALIDATION_ERROR', 'Origem inválida.');
    try { return ok(await this.repository.listProducts(userId, sourceType as ProductSourceType | undefined)); }
    catch { return fail('PRODUCT_PERSISTENCE_ERROR', 'Não foi possível listar os produtos.'); }
  }
  async createManual(userId: string, raw: Record<string, unknown>): Promise<AppResult<ProductRecord>> {
    try {
      const title = text(raw.title, 300); if (!title) return fail('VALIDATION_ERROR', 'Nome do produto é obrigatório.');
      const sourceUrl = text(raw.sourceUrl, 2_000);
      const marketplace = typeof raw.marketplace === 'string' && ['shopee','amazon','mercado_livre','magalu','aliexpress','other','unsupported','unknown'].includes(raw.marketplace)
        ? raw.marketplace as ManualProductInput['marketplace'] : 'unknown';
      const input: ManualProductInput = { title, marketplace, price: optionalMoney(raw.price), originalPrice: optionalMoney(raw.originalPrice),
        couponCode: text(raw.couponCode, 100), couponDescription: text(raw.couponDescription, 300), couponLink: httpUrl(raw.couponLink),
        freeShipping: typeof raw.freeShipping === 'boolean' ? raw.freeShipping : null, sourceUrl,
        imageUrl: null, category: text(raw.category, 100), observations: text(raw.observations, 2_000) };
      const product = await this.repository.createManualProduct(userId, input);
      if (sourceUrl) { await this.repository.createConversion(userId, 'manual', product.id, sourceUrl); this.conversions.kick(); }
      await this.media?.markUnavailable(userId, product.id);
      const saved = await this.repository.getProduct(userId, product.id) ?? product;
      await this.publishSafe(userId, saved.id, { productId: saved.id, sourceType: saved.sourceType });
      return ok(saved);
    } catch (error) {
      if (error instanceof Error && ['INVALID_MONEY','INVALID_TEXT','INVALID_URL'].includes(error.message)) return fail('VALIDATION_ERROR', 'Dados do produto inválidos.');
      return fail('PRODUCT_PERSISTENCE_ERROR', 'O produto não pôde ser salvo.');
    }
  }

  async delete(userId: string, productId: string): Promise<AppResult<void>> {
    if (!productId?.trim()) return fail('VALIDATION_ERROR', 'Produto inválido.');
    try {
      if (!await this.repository.deleteProduct(userId, productId)) {
        return fail('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
      }
      return ok(undefined);
    } catch (error) {
      console.error('[AfiliHub:Products] Falha ao excluir produto.', error);
      return fail('PRODUCT_DELETE_ERROR', 'Não foi possível excluir o produto.');
    }
  }

  async completeManualAffiliate(userId: string, productId: string, rawAffiliateUrl: unknown): Promise<AppResult<ProductRecord>> {
    try {
      const product = await this.repository.getProduct(userId, productId);
      if (!product) return fail('PRODUCT_NOT_FOUND', 'Produto não encontrado.');
      const sourceUrl = product.sourceUrl?.trim();
      if (!sourceUrl) return fail('VALIDATION_ERROR', 'O produto precisa ter um link original antes de receber o link afiliado.');
      if (typeof rawAffiliateUrl !== 'string' || !rawAffiliateUrl.trim()) return fail('VALIDATION_ERROR', 'Cole o link afiliado gerado no marketplace.');
      const affiliateUrl = rawAffiliateUrl.trim().slice(0, 2_000);
      const sourcePlatform = resolvePlatform(sourceUrl);
      const detectedPlatform = resolvePlatform(affiliateUrl);
      if (!['shopee', 'amazon', 'mercado_livre'].includes(detectedPlatform) || (sourcePlatform !== 'unsupported' && sourcePlatform !== 'other' && sourcePlatform !== detectedPlatform)) {
        return fail('VALIDATION_ERROR', 'O link afiliado não pertence ao mesmo marketplace do produto.');
      }
      if (product.marketplace !== 'unknown' && product.marketplace !== detectedPlatform) {
        return fail('VALIDATION_ERROR', 'O link afiliado não corresponde ao marketplace selecionado.');
      }
      let validatedUrl = affiliateUrl;
      if (detectedPlatform === 'mercado_livre') {
        validatedUrl = new MercadoLivreAffiliateLinkValidator().validate(sourceUrl, affiliateUrl);
      } else {
        const parsed = new URL(affiliateUrl);
        if (parsed.protocol !== 'https:' || parsed.toString() === sourceUrl) return fail('VALIDATION_ERROR', 'O link afiliado precisa ser HTTPS e diferente do link original.');
      }
      const completed = await this.repository.completeManualConversion(userId, productId, validatedUrl, detectedPlatform);
      if (!completed) return fail('AFFILIATE_REPROCESS_CONFLICT', 'A conversão não está disponível para atualização.');
      return ok(completed);
    } catch (error) {
      if (error instanceof Error && (error.message.includes('URL') || error.message.includes('link'))) return fail('VALIDATION_ERROR', error.message);
      return fail('PRODUCT_PERSISTENCE_ERROR', 'Não foi possível salvar o link afiliado.');
    }
  }

  private async publishSafe(userId: string, productId: string, payload: Record<string, unknown>): Promise<void> {
    try { await this.automations?.publish(userId, 'PRODUCT_CREATED', productId, payload); }
    catch (error) { console.error('[AfiliHub:Products] Falha ao enfileirar automação interna.', error); }
  }
}
