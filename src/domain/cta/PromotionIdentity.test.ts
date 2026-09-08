import { describe, expect, it } from "vitest";
import type { ProductRecord } from "../products/types";
import { isSamePromotion } from "./PromotionIdentity";

const product: ProductRecord = {
  id: "product-a",
  userId: "user-a",
  sourceType: "whatsapp",
  sourceReferenceId: "analysis-a",
  title: "Kit 2 Bermudas Blackout",
  category: "Moda",
  imageUrl: null,
  price: 43.43,
  originalPrice: 105.27,
  discountPercent: 58.74,
  currency: "BRL",
  couponCode: "25% OFF FULL",
  couponDescription: null,
  freeShipping: null,
  marketplace: "shopee",
  sourceUrl: "https://s.shopee.com.br/112RMt9X1Q?lp=aff",
  affiliateUrl: "https://s.shopee.com.br/affiliate-a?lp=aff",
  affiliateStatus: "converted",
  affiliateConversionId: null,
  observations: null,
  createdAt: "",
  updatedAt: "",
};

describe("isSamePromotion", () => {
  it("reconhece outra captura do mesmo link e das mesmas condições", () => {
    expect(
      isSamePromotion(product, {
        ...product,
        id: "product-b",
        sourceReferenceId: "analysis-b",
        sourceUrl: "https://s.shopee.com.br/112RMt9X1Q?another=query",
      }),
    ).toBe(true);
  });

  it("usa título normalizado quando o marketplace entrega outro link curto", () => {
    expect(
      isSamePromotion(product, {
        ...product,
        id: "product-b",
        title: "  KIT 2 BERMUDAS BLACKOUT  ",
        sourceUrl: "https://s.shopee.com.br/outro-link",
      }),
    ).toBe(true);
  });

  it("não reutiliza CTA quando preço ou cupom mudam", () => {
    expect(isSamePromotion(product, { ...product, price: 49.9 })).toBe(false);
    expect(
      isSamePromotion(product, { ...product, couponCode: "OUTRO25" }),
    ).toBe(false);
  });
});
