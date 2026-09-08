import { describe, expect, it } from "vitest";
import type { AnalyticsDataSet, AnalyticsRow } from "./aggregation";
import { buildAnalyticsResponse, estimateCommission, MARKETPLACE_ANALYTICS_CAPABILITIES } from "./aggregation";
import { resolveAnalyticsPeriod } from "./router";

const userId = "user-a";
const at = "2026-09-05T15:00:00.000Z";
const other = (row: AnalyticsRow) => ({ ...row, id: `other-${row.id}`, user_id: "user-b" });

function fixture(): AnalyticsDataSet {
  const captures = Array.from({ length: 10 }, (_, index) => ({
    id: `capture-${index + 1}`,
    user_id: userId,
    processing_status: index < 8 ? "promotion_detected" : index === 8 ? "ignored" : "needs_review",
    review_status: "approved",
    received_at: at,
  }));
  const analyses = captures.map((capture, index) => ({
    id: `analysis-${index + 1}`,
    user_id: userId,
    captured_message_id: capture.id,
    is_promotion: index < 8,
    marketplace: index < 4 ? "shopee" : "mercado_livre",
    created_at: at,
  }));
  const products = Array.from({ length: 6 }, (_, index) => ({
    id: `product-${index + 1}`,
    user_id: userId,
    title: `Produto ${index + 1}`,
    marketplace: index < 4 ? "shopee" : "mercado_livre",
    source_type: "whatsapp",
    source_reference_id: `analysis-${index + 1}`,
    affiliate_conversion_id: index < 2 ? `conversion-${index + 1}` : null,
    affiliate_status: index < 2 ? "converted" : "pending_url",
    created_at: at,
  }));
  const queueItems = products.map((product, index) => ({
    id: `item-${index + 1}`,
    user_id: userId,
    product_id: product.id,
    source_type: "cta_generation",
    source_reference_id: `cta-${index + 1}`,
    content_snapshot: {
      productId: product.id,
      ctaGenerationId: `cta-${index + 1}`,
      templateId: "template-1",
      templateVersion: 3,
      affiliateUrl: `https://affiliate.test/${index + 1}`,
    },
    created_at: at,
  }));
  const executions = products.map((_, index) => ({
    id: `execution-${index + 1}`,
    user_id: userId,
    automation_id: "automation-1",
    event_type: "PROMOTION_DETECTED",
    source_type: "promotion",
    source_reference_id: `capture-${index + 1}`,
    status: "queued",
    prepared_snapshot_id: `snapshot-${index + 1}`,
    queue_item_id: `item-${index + 1}`,
    created_at: at,
    updated_at: at,
  }));
  const snapshots = products.map((product, index) => ({
    id: `snapshot-${index + 1}`,
    user_id: userId,
    execution_id: `execution-${index + 1}`,
    product_id: product.id,
    source_type: "whatsapp",
    source_reference_id: `analysis-${index + 1}`,
    template_id: "template-1",
    template_version: 3,
    cta_generation_id: `cta-${index + 1}`,
    prepared_at: at,
    superseded_at: null,
  }));
  const deliveries: AnalyticsRow[] = products.map((_, index) => ({
    id: `delivery-${index + 1}`,
    user_id: userId,
    queue_item_id: `item-${index + 1}`,
    connection_id: index < 4 ? "connection-1" : "connection-2",
    whatsapp_group_id: index < 4 ? "group-1" : "group-2",
    status: "sent",
    attempt_count: index === 0 ? 3 : 1,
    sent_at: at,
    last_error_at: index === 0 ? "2026-09-05T14:00:00.000Z" : null,
    created_at: at,
    updated_at: at,
  }));
  deliveries.push({
    id: "delivery-failed",
    user_id: userId,
    queue_item_id: "item-1",
    connection_id: "connection-1",
    whatsapp_group_id: "group-1",
    status: "failed",
    attempt_count: 3,
    sent_at: null,
    last_error_at: at,
    created_at: at,
    updated_at: at,
  });
  return {
    connections: [
      { id: "connection-1", user_id: userId, label: "Principal", status: "connected" },
      { id: "connection-2", user_id: userId, label: "Secundária", status: "connected" },
    ],
    groups: [
      { id: "group-1", user_id: userId, connection_id: "connection-1", name: "Grupo 1" },
      { id: "group-2", user_id: userId, connection_id: "connection-2", name: "Grupo 2" },
    ],
    captures: [...captures, other(captures[0])],
    captureSources: captures.map((capture, index) => ({
      id: `source-${index + 1}`,
      user_id: userId,
      captured_message_id: capture.id,
      connection_id: index < 4 ? "connection-1" : "connection-2",
      group_id: index < 4 ? "group-1" : "group-2",
      monitor_id: "monitor-1",
      observed_at: at,
    })),
    analyses,
    products,
    conversions: [1, 2].map((value) => ({
      id: `conversion-${value}`,
      user_id: userId,
      status: "converted",
      detected_platform: "shopee",
      source_type: "whatsapp",
      source_reference_id: `analysis-${value}`,
      created_at: at,
      converted_at: at,
    })),
    automationRules: [{ id: "automation-1", user_id: userId, name: "Monitor principal", status: "active" }],
    automationExecutions: executions,
    preparedSnapshots: snapshots,
    queueItems,
    deliveries,
    templates: [{ id: "template-1", user_id: userId, name: "Template Principal" }],
    ctaHistory: products.map((_, index) => ({
      id: `cta-${index + 1}`,
      user_id: userId,
      generation_mode: index === 0 ? "original_message" : "single",
      template_id: "template-1",
      created_at: at,
    })),
    discoveryRuns: [{ id: "sync-1", user_id: userId, marketplace: "shopee", status: "completed", last_error_code: null, completed_at: at, updated_at: at }],
    orders: [],
    orderItems: [],
    marketplaceSyncStates: [],
  };
}

function aggregate(filters: Record<string, string> = {}) {
  return buildAnalyticsResponse({
    userId,
    timezone: "America/Sao_Paulo",
    period: { preset: "7d", from: "2026-09-01T03:00:00.000Z", to: "2026-09-08T02:59:59.999Z", timezone: "America/Sao_Paulo" },
    filters: { preset: "7d", ...filters },
    rows: fixture(),
  });
}

describe("Analytics operacional", () => {
  it("reflete capturas, promoções, mensagens preparadas e outcomes reais sem inflar retries", () => {
    const result = aggregate();
    expect(result.overview.captured.value).toBe(10);
    expect(result.overview.promotions.value).toBe(8);
    expect(result.overview.prepared.value).toBe(6);
    expect(result.overview.sent.value).toBe(6);
    expect(result.overview.failed.value).toBe(1);
    expect(result.overview.successRate.value).toBeCloseTo(6 / 7);
  });

  it("mantém unsupported diferente de zero", () => {
    const result = aggregate();
    expect(result.overview.delivered).toMatchObject({ available: false, value: null });
    expect(result.overview.read).toMatchObject({ available: false, value: null });
    expect(result.overview.clicks).toMatchObject({ available: false, value: null });
    expect(result.overview.orders).toMatchObject({ available: false, value: null });
    expect(result.overview.confirmedCommission).toMatchObject({ available: false, value: null });
  });

  it("contabiliza somente receipts reais posteriores ao início do tracking", () => {
    const rows = fixture();
    rows.connections[0].receipt_tracking_started_at = "2026-09-05T14:00:00.000Z";
    rows.deliveries[0].delivered_at = "2026-09-05T15:01:00.000Z";
    rows.deliveries[0].read_at = "2026-09-05T15:02:00.000Z";
    rows.deliveries[1].delivered_at = "2026-09-05T15:03:00.000Z";
    const result = buildAnalyticsResponse({
      userId,
      timezone: "America/Sao_Paulo",
      period: { preset: "7d", from: "2026-09-01T03:00:00.000Z", to: "2026-09-08T02:59:59.999Z", timezone: "America/Sao_Paulo" },
      filters: { preset: "7d", connectionId: "connection-1" },
      rows,
    });
    expect(result.overview.delivered).toMatchObject({ available: true, value: 2 });
    expect(result.overview.read).toMatchObject({ available: true, value: 1 });
    expect(result.whatsapp.deliveryRate).toBe(0.5);
    expect(result.whatsapp.readRate).toBe(0.5);
    expect(result.groups[0]).toMatchObject({ delivered: 2, read: 1 });
  });

  it("faz breakdown por grupo, conexão e marketplace com delivery atribuível", () => {
    const result = aggregate();
    expect(result.groups.map((row) => [row.id, row.sent])).toEqual([["group-1", 4], ["group-2", 2]]);
    expect(result.connections.map((row) => [row.id, row.sent])).toEqual([["connection-1", 4], ["connection-2", 2]]);
    expect(result.marketplaces.find((row) => row.marketplace === "shopee")).toMatchObject({ sent: 4, linksGenerated: 2 });
    expect(result.marketplaces.find((row) => row.marketplace === "mercado_livre")).toMatchObject({ sent: 2, linksGenerated: 0 });
  });

  it("aplica filtros dimensionais à query lógica", () => {
    expect(aggregate({ connectionId: "connection-2" }).overview.sent.value).toBe(2);
    expect(aggregate({ groupId: "group-1" }).overview.sent.value).toBe(4);
    expect(aggregate({ marketplace: "mercado_livre" }).overview.sent.value).toBe(2);
    expect(aggregate({ productId: "product-1" }).overview.sent.value).toBe(1);
    expect(aggregate({ automationId: "automation-1" }).overview.sent.value).toBe(6);
    expect(aggregate({ templateId: "template-1" }).overview.sent.value).toBe(6);
    expect(aggregate({ generationMode: "monitor_passthrough" }).overview.sent.value).toBe(1);
  });

  it("bloqueia linhas cross-user mesmo sob service role", () => {
    const result = aggregate();
    expect(result.overview.captured.value).toBe(10);
    expect(result.filterOptions.connections).toHaveLength(2);
  });

  it("preserva attribution de template/version e modo de geração", () => {
    const result = aggregate();
    expect(result.templates).toContainEqual(expect.objectContaining({ id: "template-1:3", prepared: 6, sent: 6 }));
    expect(result.generationModes).toContainEqual(expect.objectContaining({ id: "monitor_passthrough", sent: 1 }));
    expect(result.generationModes).toContainEqual(expect.objectContaining({ id: "cta_template", sent: 5 }));
  });

  it("mantém uma fonte única de capabilities comprovadas", () => {
    expect(MARKETPLACE_ANALYTICS_CAPABILITIES.shopee.orders).toBe(true);
    expect(MARKETPLACE_ANALYTICS_CAPABILITIES.mercado_livre.commissionConfirmed).toBe(false);
    expect(MARKETPLACE_ANALYTICS_CAPABILITIES.amazon.linksGenerated).toBe(true);
  });

  it("usa pedidos e comissão estimada reais da Shopee sem promover para confirmada", () => {
    const rows = fixture();
    rows.orders.push({
      id: "order-1", user_id: userId, marketplace: "shopee",
      external_order_id: "provider-order-1", product_id: "product-1",
      purchased_at: at, status: "PENDING", external_status: "PENDING",
      sales_value: 100, estimated_commission: 10, confirmed_commission: null,
    });
    rows.orderItems.push({ id: "order-item-1", user_id: userId, order_id: "order-1", marketplace: "shopee", external_item_id: "provider-item-1", name: "Produto vendido", unit_price: 100, quantity: 1 });
    rows.marketplaceSyncStates.push({ user_id: userId, marketplace: "shopee", status: "SYNCED", last_success_at: at, last_sync_at: at, last_error_code: null });
    const result = buildAnalyticsResponse({
      userId,
      timezone: "America/Sao_Paulo",
      period: { preset: "7d", from: "2026-09-01T03:00:00.000Z", to: "2026-09-08T02:59:59.999Z", timezone: "America/Sao_Paulo" },
      filters: { preset: "7d" },
      rows,
    });
    expect(result.overview.orders).toMatchObject({ available: true, value: 1 });
    expect(result.overview.salesValue).toMatchObject({ available: true, value: 100 });
    expect(result.overview.estimatedCommission).toMatchObject({ available: true, value: 10 });
    expect(result.overview.confirmedCommission).toMatchObject({ available: false, value: null });
    expect(result.sales[0]).toMatchObject({ product: "Produto 1", status: "PENDING", estimatedCommission: 10, confirmedCommission: null });
    expect(result.products.find((row) => row.id === "product-1")).toMatchObject({ orders: 1, salesValue: 100, estimatedCommission: 10 });
  });

  it("remove cancelamentos dos totais sem apagar a venda histórica", () => {
    const rows = fixture();
    rows.orders.push({ id: "order-cancelled", user_id: userId, marketplace: "shopee", external_order_id: "provider-order-c", purchased_at: at, status: "CANCELLED", external_status: "CANCELLED", sales_value: 100, estimated_commission: 10, confirmed_commission: null });
    rows.marketplaceSyncStates.push({ user_id: userId, marketplace: "shopee", status: "SYNCED", last_success_at: at });
    const result = buildAnalyticsResponse({ userId, timezone: "UTC", period: { preset: "7d", from: "2026-09-01T00:00:00.000Z", to: "2026-09-08T00:00:00.000Z", timezone: "UTC" }, filters: { preset: "7d" }, rows });
    expect(result.overview.orders.value).toBe(0);
    expect(result.overview.salesValue.value).toBe(0);
    expect(result.overview.estimatedCommission.value).toBe(0);
    expect(result.sales[0].status).toBe("CANCELLED");
  });

  it("só calcula comissão estimada com valor e taxa confiáveis", () => {
    expect(estimateCommission(100, 0.1, true)).toBe(10);
    expect(estimateCommission(100, null, true)).toBeNull();
    expect(estimateCommission(100, 0.1, false)).toBeNull();
  });

  it("retorna zero apenas para métricas suportadas no empty state", () => {
    const rows = fixture();
    for (const key of Object.keys(rows) as Array<keyof AnalyticsDataSet>) rows[key] = [];
    const result = buildAnalyticsResponse({
      userId,
      timezone: "UTC",
      period: { preset: "today", from: "2026-09-05T00:00:00.000Z", to: "2026-09-05T23:59:59.999Z", timezone: "UTC" },
      filters: { preset: "today" },
      rows,
    });
    expect(result.overview.captured).toMatchObject({ available: true, value: 0 });
    expect(result.overview.sent).toMatchObject({ available: true, value: 0 });
    expect(result.overview.clicks).toMatchObject({ available: false, value: null });
    expect(result.groups).toEqual([]);
    expect(result.sales).toEqual([]);
  });
});

describe("períodos e timezone", () => {
  it("resolve Hoje no timezone do usuário", () => {
    const period = resolveAnalyticsPeriod({ preset: "today" }, "America/Sao_Paulo", new Date("2026-09-07T12:00:00.000Z"));
    expect(period.from).toBe("2026-09-07T03:00:00.000Z");
    expect(period.to).toBe("2026-09-08T02:59:59.999Z");
  });

  it("recusa período customizado maior que um ano", () => {
    expect(() => resolveAnalyticsPeriod({ preset: "custom", from: "2024-01-01", to: "2026-01-01" }, "UTC")).toThrow("ANALYTICS_PERIOD_INVALID");
  });
});
