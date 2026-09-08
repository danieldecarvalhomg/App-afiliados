import { describe, expect, it, vi } from "vitest";
import { normalizeShopeeConversionNodes, ShopeeAnalyticsProvider } from "./ShopeeAnalyticsSync";
import { shopeeTrackingSubId } from "../../domain/affiliate/ShopeeTracking";

describe("Shopee Analytics oficial", () => {
  it("normaliza pedidos e mantém comissão do relatório como estimada", () => {
    const orders = normalizeShopeeConversionNodes([{
      conversionId: "conversion-provider-1",
      purchaseTime: 1_788_765_000,
      clickTime: 1_788_764_900,
      totalCommission: "8.70",
      utmContent: "p123",
      orders: [{
        orderId: "order-1",
        orderStatus: "PENDING",
        items: [{ itemId: "item-1", itemName: "Produto", itemPrice: "50.00", qty: 2, itemTotalCommission: "8.70", attributionType: "DIRECT" }],
      }],
    }]);
    expect(orders).toEqual([expect.objectContaining({
      externalOrderId: "order-1",
      status: "PENDING",
      salesValue: 100,
      estimatedCommission: 8.7,
      trackingSubId: "p123",
    })]);
  });

  it("preserva o valor histórico e marca cancelamento para exclusão dos totais", () => {
    const [order] = normalizeShopeeConversionNodes([{
      conversionId: "conversion-provider-1",
      purchaseTime: 1_788_765_000,
      totalCommission: "10",
      orders: [{ orderId: "order-1", orderStatus: "CANCELLED", items: [{ itemId: "item-1", itemPrice: "100", qty: 1, itemTotalCommission: "10" }] }],
    }]);
    expect(order).toMatchObject({ status: "CANCELLED", salesValue: 100, estimatedCommission: 10 });
  });

  it("não transforma preço ou comissão ausente em zero", () => {
    const orders = normalizeShopeeConversionNodes([{
      conversionId: "conversion-provider-1",
      purchaseTime: 1_788_765_000,
      totalCommission: "12.00",
      orders: [
        { orderId: "missing-price", orderStatus: "PENDING", items: [{ itemId: "item-1", qty: 1 }] },
        { orderId: "missing-commission", orderStatus: "PENDING", items: [{ itemId: "item-2", itemPrice: "100", qty: 1 }] },
      ],
    }]);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ externalOrderId: "missing-commission", salesValue: 100, estimatedCommission: null });
  });

  it("pagina pelo scrollId sem duplicar uma página", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { conversionReport: {
        nodes: [], pageInfo: { hasNextPage: true, scrollId: "cursor-a" },
      } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { conversionReport: {
        nodes: [], pageInfo: { hasNextPage: false, scrollId: null },
      } } }), { status: 200 }));
    await new ShopeeAnalyticsProvider(fetcher as typeof fetch, "https://shopee.test/graphql")
      .listOrders({ appId: "app", secret: "secret" }, new Date("2026-09-01"), new Date("2026-09-02"));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String((fetcher.mock.calls[1][1] as RequestInit).body)).toContain("cursor-a");
  });

  it("gera subId pseudônimo e determinístico", () => {
    expect(shopeeTrackingSubId("11111111-2222-3333-4444-555555555555"))
      .toBe("p11111111222233334444555555555555");
  });
});
