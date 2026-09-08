import type { ProductRecord } from "../products/types";

const normalize = (value: string | null | undefined) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const canonicalUrl = (value: string | null) => {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname.toLowerCase()}${path}`;
  } catch {
    return value.trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
};

const sameNumber = (left: number | null, right: number | null) =>
  left == null || right == null
    ? left === right
    : Math.abs(left - right) < 0.011;

const sameCommercialFacts = (left: ProductRecord, right: ProductRecord) =>
  sameNumber(left.price, right.price) &&
  sameNumber(left.originalPrice, right.originalPrice) &&
  sameNumber(left.discountPercent, right.discountPercent) &&
  normalize(left.couponCode) === normalize(right.couponCode) &&
  normalize(left.couponDescription) === normalize(right.couponDescription) &&
  left.freeShipping === right.freeShipping;

/**
 * Identifica a mesma promoção, não apenas um título parecido. As condições
 * comerciais precisam ser idênticas; o link do produto ou o título normalizado
 * completa a identidade quando uma nova captura cria outro registro de produto.
 */
export function isSamePromotion(
  current: ProductRecord,
  candidate: ProductRecord,
) {
  if (current.userId !== candidate.userId) return false;
  if (current.marketplace !== candidate.marketplace) return false;
  if (!sameCommercialFacts(current, candidate)) return false;

  const currentUrl = canonicalUrl(current.sourceUrl);
  const candidateUrl = canonicalUrl(candidate.sourceUrl);
  if (currentUrl && candidateUrl && currentUrl === candidateUrl) return true;

  const currentTitle = normalize(current.title);
  const candidateTitle = normalize(candidate.title);
  return (
    currentTitle.length >= 4 &&
    currentTitle === candidateTitle
  );
}
