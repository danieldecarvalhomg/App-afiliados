import { describe, expect, it, vi } from "vitest";
import type { MarketplacePageEvidence } from "../ai/MarketplaceOfferPageFetcher";
import {
  canonicalShopeeProductUrl,
  firstHttpUrl,
  WhatsAppLinkPreviewService,
} from "./WhatsAppLinkPreviewService";

const evidence = (
  patch: Partial<MarketplacePageEvidence> = {},
): MarketplacePageEvidence => ({
  requestedUrl: "https://s.shopee.com.br/original",
  finalUrl: "https://shopee.com.br/product/123456/987654",
  marketplace: "Shopee",
  title: "Produto real",
  description: "Descrição real",
  imageUrl: "https://down-br.img.susercontent.com/file/product",
  price: null,
  originalPrice: null,
  rating: null,
  reviewsCount: null,
  visibleText: "",
  ...patch,
});

describe("WhatsAppLinkPreviewService", () => {
  it("usa o link afiliado visível, mas obtém a imagem da página canônica", async () => {
    const fetchEvidence = vi
      .fn()
      .mockResolvedValueOnce(
        evidence({
          finalUrl: "https://shopee.com.br/opaanlp/1191271291/23298712595",
          title: null,
          description: null,
          imageUrl: null,
        }),
      )
      .mockResolvedValueOnce(evidence());
    const service = new WhatsAppLinkPreviewService(
      fetchEvidence,
      vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
      vi.fn().mockResolvedValue(Buffer.from([9, 8, 7])),
    );

    const preview = await service.build({
      text: "*Oferta*\nhttps://s.shopee.com.br/affiliate",
      sourceUrl: "https://s.shopee.com.br/original",
      affiliateUrl: "https://s.shopee.com.br/affiliate",
      productTitle: "Fallback",
      description: "@comprinhasdajulia",
    });

    expect(fetchEvidence).toHaveBeenNthCalledWith(
      2,
      "https://shopee.com.br/product/1191271291/23298712595",
    );
    expect(preview).toMatchObject({
      "canonical-url": "https://s.shopee.com.br/affiliate",
      "matched-text": "https://s.shopee.com.br/affiliate",
      title: "Produto real",
      description: "@comprinhasdajulia",
      jpegThumbnail: Buffer.from([9, 8, 7]),
    });
  });

  it("cai para preview textual quando a imagem não pode ser baixada", async () => {
    const service = new WhatsAppLinkPreviewService(
      vi.fn().mockResolvedValue(evidence()),
      vi.fn().mockRejectedValue(new Error("CDN indisponível")),
      vi.fn(),
    );
    await expect(
      service.build({
        text: "Compre https://s.shopee.com.br/affiliate",
        sourceUrl: "https://shopee.com.br/product/123456/987654",
        affiliateUrl: null,
        productTitle: null,
        description: null,
      }),
    ).resolves.toMatchObject({
      title: "Produto real",
      jpegThumbnail: undefined,
    });
  });

  it("reconhece URLs e não transforma outro domínio em página da Shopee", () => {
    expect(firstHttpUrl("Veja https://s.shopee.com.br/item.")).toBe(
      "https://s.shopee.com.br/item",
    );
    expect(
      canonicalShopeeProductUrl("https://shopee.com.br/slug/123456/987654?x=1"),
    ).toBe("https://shopee.com.br/product/123456/987654");
    expect(
      canonicalShopeeProductUrl("https://example.com/slug/123456/987654"),
    ).toBeNull();
  });
});
