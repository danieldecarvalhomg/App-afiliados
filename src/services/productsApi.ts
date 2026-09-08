import type { AffiliateAccountSummary, ProductSourceType } from '../domain/affiliate/types';
import type { ManualProductInput, ProductRecord } from '../domain/products/types';
import { supabase } from '../lib/supabase';
import type { ProductPresentationContext, ProductMediaAsset } from '../domain/media/types';
import { readJsonResponse } from './apiResponse';
import { notifyProductCatalogChanged } from './productCatalogEvents';

interface Payload<T> { success: boolean; data?: T; error?: { code: string; message: string }; }
export class ProductsApiError extends Error { constructor(public readonly code: string, message: string) { super(message); } }
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession(); const access = data.session?.access_token;
  if (!access) throw new ProductsApiError('UNAUTHORIZED', 'Faça login para gerenciar produtos.');
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${access}`, ...init.headers } });
  const payload = await readJsonResponse<Payload<T>>(response);
  if (!response.ok || !payload.success) throw new ProductsApiError(payload.error?.code ?? 'PRODUCT_API_ERROR', payload.error?.message ?? 'Falha ao processar produto.');
  return payload.data as T;
}
export const productsApi = {
  list: (sourceType?: ProductSourceType) => request<ProductRecord[]>(`/api/products${sourceType ? `?sourceType=${sourceType}` : ''}`),
  createManual: async (input: ManualProductInput) => {
    const product = await request<ProductRecord>('/api/products', { method: 'POST', body: JSON.stringify(input) });
    notifyProductCatalogChanged();
    return product;
  },
  delete: async (productId: string) => {
    await request<void>(`/api/products/${productId}`, { method: 'DELETE' });
    notifyProductCatalogChanged();
  },
  retryAffiliate: (productId: string) => request<void>(`/api/products/${productId}/retry-affiliate`, { method: 'POST' }),
  completeAffiliate: (productId: string, affiliateUrl: string) => request<ProductRecord>(`/api/products/${productId}/affiliate-link`, { method: 'POST', body: JSON.stringify({ affiliateUrl }) }),
  listAccounts: () => request<AffiliateAccountSummary[]>('/api/affiliate/accounts'),
  configureShopee: (appId: string, secret: string) => request<void>('/api/affiliate/accounts/shopee', { method: 'PUT', body: JSON.stringify({ appId, secret }) }),
  configureAmazon: (appId: string, secret: string, partnerTag: string) => request<void>('/api/affiliate/accounts/amazon', { method: 'PUT', body: JSON.stringify({ appId, secret, partnerTag }) }),
  configureMercadoLivre: (appId: string, secret: string, accessToken: string, refreshToken?: string) => request<void>('/api/affiliate/accounts/mercado-livre', { method: 'PUT', body: JSON.stringify({ appId, secret, accessToken, refreshToken }) }),
  media: (productId: string) => request<ProductPresentationContext>(`/api/products/${productId}/media`),
  selectMedia: (productId: string, assetId: string) => request<void>(`/api/products/${productId}/media/${assetId}/select`, { method: 'POST' }),
  uploadMedia: async (productId: string, file: File): Promise<ProductMediaAsset> => {
    const { data } = await supabase.auth.getSession(); const access = data.session?.access_token;
    if (!access) throw new ProductsApiError('UNAUTHORIZED', 'Faça login para gerenciar produtos.');
    const response = await fetch(`/api/products/${productId}/media`, { method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': file.type || 'application/octet-stream' }, body: file });
    const payload = await readJsonResponse<Payload<ProductMediaAsset>>(response); if (!response.ok || !payload.success) throw new ProductsApiError(payload.error?.code ?? 'MEDIA_UPLOAD_FAILED', payload.error?.message ?? 'Falha ao enviar imagem.'); return payload.data!;
  },
};

const PRODUCTS_NAVIGATION_KEY = 'promofy.products.navigation';
const MESSAGE_COMPOSER_PRODUCT_KEY = 'promofy.messages.product-intent';

export const productsNavigation = {
  openCreate(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PRODUCTS_NAVIGATION_KEY, 'create');
  },
  consume(): 'create' | null {
    if (typeof window === 'undefined') return null;
    const intent = window.sessionStorage.getItem(PRODUCTS_NAVIGATION_KEY);
    window.sessionStorage.removeItem(PRODUCTS_NAVIGATION_KEY);
    return intent === 'create' ? 'create' : null;
  },
  openMessageComposer(productId: string): void {
    if (typeof window === 'undefined' || !productId) return;
    window.sessionStorage.setItem(MESSAGE_COMPOSER_PRODUCT_KEY, productId);
  },
  consumeMessageComposer(): string | null {
    if (typeof window === 'undefined') return null;
    const productId = window.sessionStorage.getItem(MESSAGE_COMPOSER_PRODUCT_KEY);
    window.sessionStorage.removeItem(MESSAGE_COMPOSER_PRODUCT_KEY);
    return productId || null;
  },
};
