import type { CtaFacts, CtaRule } from "./types";
import { ctaRuleEligible } from "./SemanticMemoryEligibility";

export interface CtaValidationResult {
  valid: boolean;
  publishable: boolean;
  errors: string[];
}

const unsupported = [
  /últimas? unidades?/iu,
  /menor preço(?: (?:do|da))? hist[oó]ric[oa]/iu,
  /\bmenor preço\b/iu,
  /só hoje/iu,
  /somente (?:agora|hoje)/iu,
  /última chance/iu,
  /antes que acabe/iu,
  /corre que (?:está|tá) acabando/iu,
  /estoque acabando/iu,
  /promoção por tempo limitado/iu,
  /entrega (?:garantida|amanhã)/iu,
  /\b(?:possui|conta com|oferece|garante|ideal para|bateria|potência|processador|memória interna|tela de|à prova d)[^\n.!?]*/iu,
];

const money = (text: string) =>
  [...text.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/giu)].map((match) =>
    Number(match[1].replace(/\./g, "").replace(",", ".")),
  );
const urls = (text: string) => text.match(/https?:\/\/[^\s<>]+/giu) ?? [];
const close = (a: number, b: number) => Math.abs(a - b) < 0.011;
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const withoutKnownCoupon = (text: string, couponCode: string | null) =>
  couponCode?.trim()
    ? text.replace(new RegExp(escapeRegExp(couponCode.trim()), "giu"), "")
    : text;
const absentCouponWords = new Set([
  "ausente",
  "indisponivel",
  "indisponível",
  "nenhum",
  "nenhuma",
  "nao",
  "não",
  "sem",
]);
const hasExplicitCouponCode = (text: string) => {
  // Restrinja a procura à mesma linha. Com `\s*`, um texto como
  // "Sem cupom\nMarketplace: shopee" interpretava "Marketplace" como código.
  const match = /(?:cupom|código)[ \t]*:?[ \t]*(?:[*_~`]+[ \t]*)*(?!https?:\/\/)([\p{L}\p{N}][\p{L}\p{N}_-]{2,})/iu.exec(text);
  return Boolean(match && !absentCouponWords.has(match[1].toLocaleLowerCase("pt-BR")));
};
const discounts = (text: string) => {
  const values: number[] = [];
  for (const pattern of [
    /(\d+(?:[.,]\d+)?)\s*%\s*(?:off|de\s+desconto)\b/giu,
    /(?:desconto(?:\s+de)?|economize)\s*(\d+(?:[.,]\d+)?)\s*%/giu,
  ])
    for (const match of text.matchAll(pattern))
      values.push(Number(match[1].replace(",", ".")));
  return values;
};

export class CtaValidator {
  validate(
    text: string,
    facts: CtaFacts,
    rules: CtaRule[] = [],
  ): CtaValidationResult {
    const errors: string[] = [];
    const knownCoupon = facts.couponCode ?? facts.couponDescription;
    const allowed = [facts.price, facts.originalPrice].filter(
      (value): value is number => value != null,
    );
    for (const amount of money(withoutKnownCoupon(text, knownCoupon)))
      if (!allowed.some((value) => close(value, amount)))
        errors.push("FACT_PRICE_MISMATCH");

    // Um cupom pode conter uma porcentagem (por exemplo, "25% OFF FULL").
    // Essa porcentagem descreve o cupom, não o desconto calculado do produto.
    const textWithoutCoupon = withoutKnownCoupon(text, knownCoupon);
    for (const amount of discounts(textWithoutCoupon))
      if (
        facts.discountPercent == null ||
        Math.abs(amount - facts.discountPercent) > 1
      )
        errors.push("FACT_DISCOUNT_MISMATCH");

    if (/\b(?:cupom|código)\b/iu.test(text)) {
      if (!knownCoupon) {
        // “Pegue o cupom” pode ser apenas uma instrução para abrir o link de
        // resgate. Só trate como cupom inventado quando houver um código
        // explícito após a palavra, nunca quando o próximo conteúdo é uma URL.
        if (hasExplicitCouponCode(text)) errors.push("FACT_COUPON_INVENTED");
      } else if (facts.couponCode) {
        const mentioned = [
          ...text.matchAll(
            /(?:cupom|código)\s*:?\s*[\s*]*([\w-]{3,})/giu,
          ),
        ].map((match) => match[1].replace(/\*/g, ""));
        if (
          mentioned.some(
            (value) => value.toLowerCase() !== facts.couponCode!.toLowerCase(),
          )
        )
          errors.push("FACT_COUPON_MISMATCH");
      } else if (
        hasExplicitCouponCode(text) &&
        !text.toLocaleLowerCase("pt-BR").includes(knownCoupon.toLocaleLowerCase("pt-BR"))
      ) {
        errors.push("FACT_COUPON_MISMATCH");
      }
    }
    if (/frete\s+grátis/iu.test(text) && facts.freeShipping !== true)
      errors.push("FACT_FREE_SHIPPING_INVENTED");
    for (const claim of unsupported)
      if (claim.test(text)) errors.push("UNSUPPORTED_FACTUAL_CLAIM");
    const allowedUrls = [facts.affiliateUrl, facts.couponLink].filter(
      (value): value is string => Boolean(value),
    );
    for (const found of urls(text)) {
      const normalized = found.replace(/[),.;]+$/, "");
      if (!allowedUrls.includes(normalized))
        errors.push(
          normalized === facts.sourceUrl
            ? "SOURCE_URL_FORBIDDEN"
            : "AFFILIATE_URL_MISMATCH",
        );
    }
    for (const rule of rules.filter((item) => ctaRuleEligible(item, facts))) {
      if (
        rule.ruleType.startsWith("forbidden") &&
        text.toLowerCase().includes(rule.value.toLowerCase())
      )
        errors.push("PROHIBITED_PHRASE");
      if (
        rule.ruleType === "required_word" &&
        !text.toLowerCase().includes(rule.value.toLowerCase())
      )
        errors.push("REQUIRED_PHRASE_MISSING");
    }
    const normalizedUrls = urls(text).map((item) =>
      item.replace(/[),.;]+$/, ""),
    );
    return {
      valid: errors.length === 0,
      publishable:
        errors.length === 0 &&
        Boolean(facts.affiliateUrl) &&
        normalizedUrls.includes(facts.affiliateUrl!),
      errors: [...new Set(errors)],
    };
  }
}
