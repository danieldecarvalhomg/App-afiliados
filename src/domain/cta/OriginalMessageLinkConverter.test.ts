import { describe, expect, it } from "vitest";
import { convertOriginalMessageLinks } from "./OriginalMessageLinkConverter";

describe("convertOriginalMessageLinks", () => {
  it("preserva toda a mensagem e troca somente os links convertidos", () => {
    const raw =
      "🔥 *OFERTA DO DIA*\n\nDe: R$ 99,90\nPor: *R$ 49,90*\n\nConfira 👇\nhttps://shopee.com.br/produto?x=1\nCupom: PROMO10";
    const converted = new Map([
      ["https://shopee.com.br/produto?x=1", "https://s.shopee.com.br/abc"],
    ]);
    expect(
      convertOriginalMessageLinks(
        raw,
        ["https://shopee.com.br/produto?x=1"],
        converted,
      ).text,
    ).toBe(
      raw.replace(
        "https://shopee.com.br/produto?x=1",
        "https://s.shopee.com.br/abc",
      ),
    );
  });

  it("converte todos os links repetidos sem alterar pontuação", () => {
    const raw =
      "Produto: https://loja.test/p. Cupom: https://loja.test/c\nDe novo: https://loja.test/p";
    const value = convertOriginalMessageLinks(
      raw,
      ["https://loja.test/p", "https://loja.test/c"],
      new Map([
        ["https://loja.test/p", "https://af.test/p"],
        ["https://loja.test/c", "https://af.test/c"],
      ]),
    );
    expect(value.text).toBe(
      "Produto: https://af.test/p. Cupom: https://af.test/c\nDe novo: https://af.test/p",
    );
    expect(value.convertedLinkCount).toBe(2);
  });

  it("bloqueia o envio se algum link ainda não foi convertido", () => {
    expect(() =>
      convertOriginalMessageLinks(
        "A https://loja.test/a B https://loja.test/b",
        ["https://loja.test/a", "https://loja.test/b"],
        new Map([["https://loja.test/a", "https://af.test/a"]]),
      ),
    ).toThrow("CTA_ORIGINAL_LINKS_NOT_CONVERTED");
  });
});
