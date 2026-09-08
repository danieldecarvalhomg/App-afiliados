import { describe, expect, it } from "vitest";
import { eligibleDryRunProducts } from "./AutomationDryRun";

const products = [
  { id: "manual", title: "Manual", marketplace: "shopee", sourceType: "manual" },
  { id: "radar", title: "Radar", marketplace: "mercado_livre", sourceType: "marketplace_radar" },
  { id: "capture", title: "Capturado", marketplace: "shopee", sourceType: "whatsapp" },
];

describe("opções do dry run de automações", () => {
  it("Modo 1 oferece apenas Products que possuem mensagem original capturada", () => {
    expect(eligibleDryRunProducts(products, "original_message")).toEqual([
      products[2],
    ]);
  });

  it("Modo 2 aceita qualquer Product real", () => {
    expect(eligibleDryRunProducts(products, "generated_cta")).toEqual(products);
  });
});
