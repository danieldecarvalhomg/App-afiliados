import type { ProductMediaAsset, ProductMediaPreferences } from './types';

export class ProductImageSelector {
  select(assets: ProductMediaAsset[], preferences: ProductMediaPreferences): ProductMediaAsset | null {
    if (assets.some((asset) => asset.selectionStatus === 'manual_selected')) return null;
    const safe = assets.filter((asset) => {
      const trustedMarketplaceBranding = asset.sourceType === 'marketplace'
        && asset.classification === 'marketplace_product_image'
        && asset.productMatchConfidence != null
        && asset.productMatchConfidence >= 0.85;
      return asset.analysisStatus === 'completed'
        && !asset.hasQrCode
        && !asset.hasWatermark
        && (!asset.hasDetectedBranding || trustedMarketplaceBranding)
        && !asset.possibleConflictingCommercialText
        && asset.productMatchConfidence != null
        && asset.productMatchConfidence >= 0.65
        && !['promotional_creative','screenshot','unknown'].includes(asset.classification ?? 'unknown');
    });
    return safe.sort((a, b) => {
      const adjust = (item: ProductMediaAsset) => (item.qualityScore ?? 0) + (preferences.preferNoText && !item.hasTextOverlay ? 4 : 0) + (preferences.avoidPackaging && item.classification === 'packaging' ? -8 : 0);
      return adjust(b) - adjust(a) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    })[0] ?? null;
  }
}
