/** Mantém null quando a fonte não entrega categoria legível; não inventa taxonomia. */
export class MarketplaceCategoryNormalizer {
  normalize(externalCategory: string | null | undefined): string | null {
    const value = externalCategory?.trim(); if (!value) return null; const normalized = value.toLowerCase();
    if (/(celular|computador|eletr)/.test(normalized)) return 'Eletrônicos';
    if (/(casa|cozinha|móvel)/.test(normalized)) return 'Casa';
    if (/(beleza|saúde)/.test(normalized)) return 'Beleza';
    if (/(moda|roupa|calçado)/.test(normalized)) return 'Moda';
    return value.slice(0, 100);
  }
}
