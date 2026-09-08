import { describe, expect, it } from "vitest";
import { formatPercentRatio } from "./format";

describe("formatação de taxa do Analytics", () => {
  it("converte a razão retornada pelo backend em percentual", () => {
    expect(formatPercentRatio(1)).toBe("100,0%");
    expect(formatPercentRatio(0.975)).toBe("97,5%");
    expect(formatPercentRatio(0)).toBe("0,0%");
  });

  it("não inventa taxa quando a fonte não tem amostra", () => {
    expect(formatPercentRatio(null)).toBe("Não disponível");
  });
});
