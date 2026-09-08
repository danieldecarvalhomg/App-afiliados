const PRODUCT_CATALOG_CHANGED = "promofy:product-catalog-changed";

export function notifyProductCatalogChanged(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(PRODUCT_CATALOG_CHANGED));
}

export function onProductCatalogChanged(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(PRODUCT_CATALOG_CHANGED, listener);
  return () => window.removeEventListener(PRODUCT_CATALOG_CHANGED, listener);
}
