import type { AffiliateConversionStatus, AffiliatePlatform, ProductSourceType } from '../affiliate/types';
import type { ProductMediaStatus } from '../media/types';

export interface ProductRecord {
  id: string;
  userId: string;
  sourceType: ProductSourceType;
  sourceReferenceId: string | null;
  title: string;
  category: string | null;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  currency: 'BRL' | null;
  couponCode: string | null;
  couponDescription: string | null;
  /** Link factual e independente para resgate/aplicação do cupom. */
  couponLink?: string | null;
  freeShipping: boolean | null;
  marketplace: AffiliatePlatform | 'unknown';
  sourceUrl: string | null;
  affiliateUrl: string | null;
  affiliateStatus: AffiliateConversionStatus | 'pending_url';
  affiliateConversionId: string | null;
  observations: string | null;
  mediaStatus?: ProductMediaStatus;
  primaryMediaAssetId?: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ManualProductInput {
  title: string;
  marketplace?: AffiliatePlatform | 'unknown';
  price?: number | null;
  originalPrice?: number | null;
  couponCode?: string | null;
  couponDescription?: string | null;
  couponLink?: string | null;
  freeShipping?: boolean | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  category?: string | null;
  observations?: string | null;
}
