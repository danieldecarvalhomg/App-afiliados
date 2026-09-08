import { describe, expect, it } from "vitest";
import { MessageTemplateRenderer } from "./MessageTemplateRenderer";
import { TemplateParser, TemplateSyntaxError } from "./TemplateParser";
import { TemplateSerializer, templateDocumentsEquivalent } from "./TemplateSerializer";
import type { CtaFacts } from "./types";

const facts: CtaFacts = {
  productId: "echo", title: "Echo Dot", category: "Eletrônicos",
  price: 249, originalPrice: 399, discountPercent: 38,
  couponCode: "ECHO20", couponDescription: "20 reais",
  couponLink: "https://cupom.test/echo", freeShipping: true,
  marketplace: "shopee", affiliateUrl: "https://afiliado.test/echo",
  sourceUrl: "https://origem.test/echo",
};

describe("canonical message template engine", () => {
  const parser = new TemplateParser();
  const serializer = new TemplateSerializer();
  const renderer = new MessageTemplateRenderer();

  it("aceita template vazio sem inventar blocos", () => {
    const document = parser.parse("");
    expect(document.nodes).toEqual([]);
    expect(renderer.render(document, facts, "CTA").text).toBe("");
  });

  it("preserva ordem livre, texto exato e um único CTA", () => {
    const document = parser.parse("POR {preco}\n{cta_ia}\nProduto: *{produto}*");
    expect(renderer.render(document, facts, "Tava de olho neste?").text)
      .toBe("POR R$ 249,00\nTava de olho neste?\nProduto: *Echo Dot*");
  });

  it("renderiza condicionais com else e aninhamento", () => {
    const dsl = "{if preco_original}DE ~{preco_original}~\n{if desconto >= 30}Economia de {desconto}{else}Boa condição{/if}{else}POR {preco}{/if}";
    const document = parser.parse(dsl);
    expect(renderer.render(document, facts, "").text).toBe("DE ~R$ 399,00~\nEconomia de 38%");
    expect(renderer.render(document, { ...facts, originalPrice: null }, "").text).toBe("POR R$ 249,00");
  });

  it("mantém coupon_link factual e independente do link afiliado", () => {
    const document = parser.parse("{if coupon_link}Cupom: {coupon_link}\n{/if}Produto: {affiliate_link}");
    const text = renderer.render(document, facts, "").text;
    expect(text).toContain("https://cupom.test/echo");
    expect(text).toContain("https://afiliado.test/echo");
  });

  it("renderiza a descrição literal quando o cupom não possui código", () => {
    const document = parser.parse("{if cupom}Cupom: {cupom}{else}Sem cupom{/if}");
    const text = renderer.render(document, { ...facts, couponCode: null, couponDescription: "R$30 OFF" }, "").text;
    expect(text).toBe("Cupom: R$30 OFF");
  });

  it("remove o espaço reservado de seções opcionais ausentes", () => {
    const dsl = "{cta_ia}\n\n*{produto}*\n\n*POR {preco}*\n\n{if cupom}🎟️ Cupom: *{cupom}*{/if}\n\n{if coupon_link}👉 Pegue o cupom:\n{coupon_link}{/if}\n\n👉 Produto:\n{affiliate_link}";
    const document = parser.parse(dsl);
    const withoutCoupon = { ...facts, couponCode: null, couponDescription: null, couponLink: null };
    expect(renderer.render(document, withoutCoupon, "CTA").text).toBe(
      "CTA\n\n*Echo Dot*\n\n*POR R$ 249,00*\n\n👉 Produto:\nhttps://afiliado.test/echo",
    );
  });

  it("preserva o espaçamento intencional quando a seção opcional existe", () => {
    const dsl = "Antes\n\n{if cupom}Cupom: {cupom}{/if}\n\nDepois";
    expect(renderer.render(parser.parse(dsl), facts, "").text)
      .toBe("Antes\n\nCupom: ECHO20\n\nDepois");
  });

  it("faz round-trip sem perda semântica em formatação e condicionais", () => {
    const first = parser.parse("> {cta_ia}\n- {produto}\n{if cupom}*{cupom}*{else}_{marketplace}_{/if}");
    const second = parser.parse(serializer.serialize(first));
    expect(templateDocumentsEquivalent(first, second)).toBe(true);
  });

  it("aceita template legado com marcadores de formatação no texto", () => {
    const legado = {
      version: 1 as const,
      nodes: [
        { id: "text-before", type: "text" as const, text: "*" },
        { id: "product", type: "variable" as const, key: "produto" as const },
        { id: "text-after", type: "text" as const, text: "*" },
      ],
    };
    const normalizado = parser.parse("*{produto}*");
    expect(templateDocumentsEquivalent(legado, normalizado)).toBe(true);
  });

  it("normaliza delimitador solto sem impedir a geração", () => {
    const document = parser.parse("~DE~{preco_original}~\n*POR {preco}*\n{affiliate_link}");
    const result = renderer.render(document, facts, "");
    expect(result.text).toBe("~DE~R$\u00a0399,00\n*POR R$\u00a0249,00*\nhttps://afiliado.test/echo");
    expect(result.markupRepairs).toEqual(["~"]);
  });

  it("não interpreta underscores de URL ou identificador como formatação", () => {
    const withUnderscores = {
      ...facts,
      affiliateUrl: "https://afiliado.test/oferta_completa?id=abc_def",
    };
    const result = renderer.render(parser.parse("SKU_123\n{affiliate_link}"), withUnderscores, "");
    expect(result.text).toBe("SKU_123\nhttps://afiliado.test/oferta_completa?id=abc_def");
    expect(result.markupRepairs).toEqual([]);
  });

  it("rejeita sintaxe inválida com linha e coluna", () => {
    expect(() => parser.parse("Linha 1\n{if cupom}sem fechamento")).toThrow(TemplateSyntaxError);
    try { parser.parse("Linha 1\n{if cupom}sem fechamento"); } catch (error) {
      expect(error).toMatchObject({ code: "TEMPLATE_DSL_INVALID", line: 2 });
    }
  });

  it("rejeita mais de um CTA no renderer", () => {
    expect(() => renderer.render(parser.parse("{cta_ia}\n{cta_ia}"), facts, "CTA"))
      .toThrow("TEMPLATE_MULTIPLE_CTA_SLOTS");
  });
});
