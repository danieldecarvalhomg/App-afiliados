import type { PromotionAIOutput } from '../ai/AIProvider';
import type { PromotionAnalysisResult, PromotionMarketplace } from './types';

const MARKETPLACES: PromotionMarketplace[] = ['shopee','amazon','mercado_livre','magalu','aliexpress','other','unknown'];

export function normalizeMoney(value: string): number | null {
  const compact = value.replace(/\s/g, '').replace(/^R\$/i, '');
  let normalized = compact;
  if (compact.includes(',')) normalized = compact.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(compact)) normalized = compact.replace(/\./g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : null;
}

export function extractMoneyCandidates(text: string): number[] {
  const matches = text.match(/R\$\s*\d+(?:(?:\.\d{3})+(?:,\d{1,2})?|[.,]\d{1,2})?/giu) ?? [];
  return [...new Set(matches.map(normalizeMoney).filter((value): value is number => value !== null))];
}

export function calculateDiscount(originalPrice: number | null, price: number | null): number | null {
  if (originalPrice == null || price == null || originalPrice <= 0 || price > originalPrice) return null;
  return Math.round(((originalPrice - price) / originalPrice) * 10_000) / 100;
}

export function detectMarketplace(links: string[]): PromotionMarketplace | null {
  for (const link of links) {
    try {
      const host = new URL(link).hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'shopee.com.br' || host.endsWith('.shopee.com.br')) return 'shopee';
      if (host === 'amazon.com.br' || host.endsWith('.amazon.com.br') || host === 'amzn.to') return 'amazon';
      if (host === 'mercadolivre.com.br' || host.endsWith('.mercadolivre.com.br') || host === 'meli.la') return 'mercado_livre';
      if (host === 'magazineluiza.com.br' || host.endsWith('.magazineluiza.com.br') || host === 'magalu.com') return 'magalu';
      if (host === 'aliexpress.com' || host.endsWith('.aliexpress.com')) return 'aliexpress';
    } catch { /* URL já veio validada do 3A; ignore entrada inválida legada. */ }
  }
  return null;
}

function nullableString(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new Error('INVALID_STRING_FIELD');
  const text = value.trim();
  return text ? text.slice(0, max) : null;
}
function nullableMoney(value: unknown, candidates: number[]): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error('INVALID_PRICE_FIELD');
  const normalized = Math.round(value * 100) / 100;
  return candidates.some((candidate) => Math.abs(candidate - normalized) < 0.01) ? normalized : null;
}

function literalCouponValue(text: string, value: string | null): string | null {
  if (!value) return null;
  return text.toLocaleLowerCase('pt-BR').includes(value.toLocaleLowerCase('pt-BR')) ? value : null;
}

export function extractExplicitCouponDescription(text: string): string | null {
  const match = /(?:^|\n)[ \t]*(?:[*_~`]+[ \t]*)*(?:cupom|c[oó]digo)[ \t]*:[ \t]*(?:[*_~`]+[ \t]*)*([^\r\n]+)/imu.exec(text);
  if (!match) return null;
  const value = match[1]
    .replace(/[*_~`]+/gu, '')
    .replace(/https?:\/\/\S+.*$/iu, '')
    .trim();
  if (!value || /^(?:sem|nenhum|nenhuma|não informado|indisponível)\b/iu.test(value)) return null;
  return value.slice(0, 300);
}

export function validatePromotionOutput(raw: unknown, text: string, links: string[]): PromotionAnalysisResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('INVALID_STRUCTURED_OUTPUT');
  const value = raw as Record<string, unknown>;
  if (value.isPromotion !== null && typeof value.isPromotion !== 'boolean') throw new Error('INVALID_PROMOTION_CLASSIFICATION');
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) throw new Error('INVALID_CONFIDENCE');
  const confidence = Math.min(1, Math.max(0, Math.round(value.confidence * 1000) / 1000));
  const candidates = extractMoneyCandidates(text);
  const price = nullableMoney(value.price, candidates);
  const originalPrice = nullableMoney(value.originalPrice, candidates);
  const productName = nullableString(value.productName, 300);
  let coupon: PromotionAnalysisResult['coupon'] = null;
  if (value.coupon !== null && value.coupon !== undefined) {
    if (typeof value.coupon !== 'object' || Array.isArray(value.coupon)) throw new Error('INVALID_COUPON');
    const candidate = value.coupon as Record<string, unknown>;
    const code = literalCouponValue(text, nullableString(candidate.code, 100));
    const rawDescription = nullableString(candidate.description, 300);
    const description = code ? rawDescription : literalCouponValue(text, rawDescription);
    // Cada parte do cupom só é aceita quando está literalmente presente na
    // captura. Ofertas como "Cupom: R$30 OFF" podem ter descrição sem código.
    coupon = code || description ? { code, description } : null;
  }
  if (!coupon) {
    const description = extractExplicitCouponDescription(text);
    if (description) coupon = { code: null, description };
  }
  const deterministicMarketplace = detectMarketplace(links);
  const aiMarketplace = typeof value.marketplace === 'string' && MARKETPLACES.includes(value.marketplace as PromotionMarketplace)
    ? value.marketplace as PromotionMarketplace : 'unknown';
  const explicitFreeShipping = /\b(frete|envio)\s*(gr[aá]tis|0(?:[,\.]00)?)\b/iu.test(text);
  const isPromotion = value.isPromotion as boolean | null;
  const discountPercent = calculateDiscount(originalPrice, price);
  const hasCommercialData = Boolean(productName || price !== null || coupon?.code || coupon?.description || /\b\d{1,3}\s*%\s*(?:off|de desconto)\b/iu.test(text));
  const primaryProductLink = typeof value.primaryProductLink === 'string' && links.includes(value.primaryProductLink)
    ? value.primaryProductLink : null;
  const couponLinks = Array.isArray(value.couponLinks)
    ? [...new Set(value.couponLinks.filter((link): link is string => typeof link === 'string' && links.includes(link) && link !== primaryProductLink))]
    : [];
  return {
    isPromotion,
    confidence,
    productName,
    price,
    originalPrice,
    discountPercent,
    currency: price !== null || originalPrice !== null ? 'BRL' : null,
    coupon,
    freeShipping: explicitFreeShipping ? true : null,
    marketplace: deterministicMarketplace ?? aiMarketplace,
    links: [...links],
    primaryProductLink,
    couponLinks,
    ...(isPromotion === null || (isPromotion === true && !hasCommercialData) ? { reason: 'ambiguous_content' as const } : {}),
  };
}
