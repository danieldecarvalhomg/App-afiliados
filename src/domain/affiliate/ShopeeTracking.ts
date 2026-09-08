/** Identificador pseudônimo estável aceito como subId pela Shopee. */
export function shopeeTrackingSubId(conversionId: string) {
  const compact = conversionId.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return `p${compact}`.slice(0, 64);
}
