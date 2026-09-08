import type {
  AnalyticsBreakdownRow,
  AnalyticsFilters,
  AnalyticsGenerationMode,
  AnalyticsMetric,
  AnalyticsResponse,
  MarketplaceAnalyticsCapabilities,
} from "../../domain/analytics/types";

export type AnalyticsRow = Record<string, any>;

export interface AnalyticsDataSet {
  connections: AnalyticsRow[];
  groups: AnalyticsRow[];
  captures: AnalyticsRow[];
  captureSources: AnalyticsRow[];
  analyses: AnalyticsRow[];
  products: AnalyticsRow[];
  conversions: AnalyticsRow[];
  automationRules: AnalyticsRow[];
  automationExecutions: AnalyticsRow[];
  preparedSnapshots: AnalyticsRow[];
  queueItems: AnalyticsRow[];
  deliveries: AnalyticsRow[];
  templates: AnalyticsRow[];
  ctaHistory: AnalyticsRow[];
  discoveryRuns: AnalyticsRow[];
  orders: AnalyticsRow[];
  orderItems: AnalyticsRow[];
  marketplaceSyncStates: AnalyticsRow[];
}

const unavailable = (definition: string, unavailableReason: string): AnalyticsMetric => ({
  value: null,
  available: false,
  definition,
  unavailableReason,
});
const available = (value: number, definition: string): AnalyticsMetric => ({
  value,
  available: true,
  definition,
});

export const MARKETPLACE_ANALYTICS_CAPABILITIES: Record<
  string,
  MarketplaceAnalyticsCapabilities
> = Object.freeze({
  shopee: Object.freeze({
    linksGenerated: true,
    productsAdvertised: true,
    messagesSent: true,
    groups: true,
    clicks: false,
    uniqueClicks: false,
    orders: true,
    salesValue: true,
    commissionEstimated: true,
    commissionConfirmed: false,
    conversionRate: false,
    cancellations: true,
    refunds: false,
    lastSales: true,
    syncHealth: true,
  }),
  mercado_livre: Object.freeze({
    linksGenerated: true,
    productsAdvertised: true,
    messagesSent: true,
    groups: true,
    clicks: false,
    uniqueClicks: false,
    orders: false,
    salesValue: false,
    commissionEstimated: false,
    commissionConfirmed: false,
    conversionRate: false,
    cancellations: false,
    refunds: false,
    lastSales: false,
    syncHealth: true,
  }),
  amazon: Object.freeze({
    linksGenerated: true,
    productsAdvertised: true,
    messagesSent: true,
    groups: true,
    clicks: false,
    uniqueClicks: false,
    orders: false,
    salesValue: false,
    commissionEstimated: false,
    commissionConfirmed: false,
    conversionRate: false,
    cancellations: false,
    refunds: false,
    lastSales: false,
    syncHealth: true,
  }),
});

/**
 * Fórmula preparada para providers de pedidos futuros. O chamador precisa
 * afirmar que valor e taxa vieram de fontes confiáveis; ausência nunca vira 0.
 */
export function estimateCommission(
  saleValue: number | null,
  commissionRateRatio: number | null,
  reliable: boolean,
) {
  if (!reliable || saleValue == null || commissionRateRatio == null) return null;
  if (!Number.isFinite(saleValue) || !Number.isFinite(commissionRateRatio)) return null;
  if (saleValue < 0 || commissionRateRatio < 0 || commissionRateRatio > 1) return null;
  return Math.round(saleValue * commissionRateRatio * 100) / 100;
}

const id = (value: unknown) => String(value ?? "");
const unique = <T>(values: T[]) => [...new Set(values)];
const amount = (value: unknown) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const sumKnown = (rows: AnalyticsRow[], field: string): number | null => {
  if (!rows.length) return 0;
  const values = rows.map((row) => amount(row[field]));
  if (values.some((value) => value == null)) return null;
  return Math.round((values as number[]).reduce((sum, value) => sum + value, 0) * 100) / 100;
};
const isWithin = (value: unknown, from: string, to: string) => {
  const time = new Date(String(value ?? "")).getTime();
  return Number.isFinite(time) && time >= Date.parse(from) && time <= Date.parse(to);
};
const lastBy = (rows: AnalyticsRow[], field: string) =>
  [...rows].sort(
    (a, b) => Date.parse(String(b[field] ?? 0)) - Date.parse(String(a[field] ?? 0)),
  )[0];

export function analyticsDateKey(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function dateKeys(from: string, to: string, timezone: string) {
  const start = analyticsDateKey(from, timezone);
  const end = analyticsDateKey(to, timezone);
  const cursor = new Date(`${start}T12:00:00.000Z`);
  const endDate = new Date(`${end}T12:00:00.000Z`);
  const result: string[] = [];
  while (cursor <= endDate && result.length < 370) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function blankBreakdown(idValue: string, name: string): AnalyticsBreakdownRow {
  return {
    id: idValue,
    name,
    sent: 0,
    delivered: null,
    read: null,
    failed: 0,
    clicks: null,
    ctr: null,
    orders: null,
    salesValue: null,
    estimatedCommission: null,
    confirmedCommission: null,
  };
}

function modeLabel(mode: AnalyticsGenerationMode) {
  if (mode === "monitor_passthrough") return "Mensagem original do Monitor";
  if (mode === "manual") return "Manual";
  return "CTA + Template";
}

export function buildAnalyticsResponse(input: {
  userId: string;
  timezone: string;
  period: AnalyticsResponse["period"];
  filters: AnalyticsFilters;
  rows: AnalyticsDataSet;
}): AnalyticsResponse {
  const { userId, timezone, period, filters } = input;
  // Defesa adicional para consultas com service role: mesmo que uma query futura
  // esqueça o filtro, nenhuma linha de outro owner participa da agregação.
  const owned = (rows: AnalyticsRow[]) => rows.filter((row) => id(row.user_id) === userId);
  const rows: AnalyticsDataSet = {
    connections: owned(input.rows.connections),
    groups: owned(input.rows.groups),
    captures: owned(input.rows.captures),
    captureSources: owned(input.rows.captureSources),
    analyses: owned(input.rows.analyses),
    products: owned(input.rows.products),
    conversions: owned(input.rows.conversions),
    automationRules: owned(input.rows.automationRules),
    automationExecutions: owned(input.rows.automationExecutions),
    preparedSnapshots: owned(input.rows.preparedSnapshots),
    queueItems: owned(input.rows.queueItems),
    deliveries: owned(input.rows.deliveries),
    templates: owned(input.rows.templates),
    ctaHistory: owned(input.rows.ctaHistory),
    discoveryRuns: owned(input.rows.discoveryRuns),
    orders: owned(input.rows.orders),
    orderItems: owned(input.rows.orderItems),
    marketplaceSyncStates: owned(input.rows.marketplaceSyncStates),
  };

  const groupById = new Map(rows.groups.map((row) => [id(row.id), row]));
  const connectionById = new Map(rows.connections.map((row) => [id(row.id), row]));
  const analysisByCapture = new Map(rows.analyses.map((row) => [id(row.captured_message_id), row]));
  const productById = new Map(rows.products.map((row) => [id(row.id), row]));
  const productsByReference = new Map<string, AnalyticsRow[]>();
  for (const product of rows.products) {
    const key = id(product.source_reference_id);
    if (key) productsByReference.set(key, [...(productsByReference.get(key) ?? []), product]);
  }
  const sourcesByCapture = new Map<string, AnalyticsRow[]>();
  for (const source of rows.captureSources) {
    const key = id(source.captured_message_id);
    sourcesByCapture.set(key, [...(sourcesByCapture.get(key) ?? []), source]);
  }
  const itemById = new Map(rows.queueItems.map((row) => [id(row.id), row]));
  const executionByQueue = new Map(
    rows.automationExecutions
      .filter((row) => row.queue_item_id)
      .map((row) => [id(row.queue_item_id), row]),
  );
  const executionsByCapture = new Map<string, AnalyticsRow[]>();
  for (const execution of rows.automationExecutions) {
    if (execution.event_type !== "PROMOTION_DETECTED") continue;
    const key = id(execution.source_reference_id);
    executionsByCapture.set(key, [...(executionsByCapture.get(key) ?? []), execution]);
  }
  const snapshotById = new Map(rows.preparedSnapshots.map((row) => [id(row.id), row]));
  const currentSnapshots = rows.automationExecutions
    .map((execution) => snapshotById.get(id(execution.prepared_snapshot_id)))
    .filter(Boolean) as AnalyticsRow[];
  const snapshotByExecution = new Map(
    currentSnapshots.map((snapshot) => [id(snapshot.execution_id), snapshot]),
  );
  const ctaById = new Map(rows.ctaHistory.map((row) => [id(row.id), row]));
  const templateById = new Map(rows.templates.map((row) => [id(row.id), row]));
  const ruleById = new Map(rows.automationRules.map((row) => [id(row.id), row]));

  const queueMode = (item: AnalyticsRow | undefined): AnalyticsGenerationMode => {
    if (!item || item.source_type === "manual") return "manual";
    const generationId = id(item.content_snapshot?.ctaGenerationId ?? item.source_reference_id);
    return ctaById.get(generationId)?.generation_mode === "original_message"
      ? "monitor_passthrough"
      : "cta_template";
  };
  const snapshotMode = (snapshot: AnalyticsRow | undefined): AnalyticsGenerationMode => {
    if (!snapshot) return "manual";
    return ctaById.get(id(snapshot.cta_generation_id))?.generation_mode === "original_message"
      ? "monitor_passthrough"
      : "cta_template";
  };
  const itemTemplate = (item: AnalyticsRow | undefined) =>
    id(item?.content_snapshot?.templateId) || null;

  const itemMatchesFilters = (item: AnalyticsRow) => {
    const product = productById.get(id(item.product_id ?? item.content_snapshot?.productId));
    const execution = executionByQueue.get(id(item.id));
    const itemDeliveries = rows.deliveries.filter((delivery) => id(delivery.queue_item_id) === id(item.id));
    if (filters.marketplace && id(product?.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && !itemDeliveries.some((delivery) => id(delivery.connection_id) === filters.connectionId)) return false;
    if (filters.groupId && !itemDeliveries.some((delivery) => id(delivery.whatsapp_group_id) === filters.groupId)) return false;
    if (filters.automationId && id(execution?.automation_id) !== filters.automationId) return false;
    if (filters.productId && id(product?.id) !== filters.productId) return false;
    if (filters.templateId && itemTemplate(item) !== filters.templateId) return false;
    if (filters.generationMode && queueMode(item) !== filters.generationMode) return false;
    return true;
  };

  const captureProducts = (captureId: string) => {
    const analysis = analysisByCapture.get(captureId);
    return unique([
      ...(productsByReference.get(captureId) ?? []),
      ...(productsByReference.get(id(analysis?.id)) ?? []),
    ]);
  };
  const captureExecutions = (captureId: string) => executionsByCapture.get(captureId) ?? [];
  const captureMatchesFilters = (capture: AnalyticsRow) => {
    const captureId = id(capture.id);
    const analysis = analysisByCapture.get(captureId);
    const sources = sourcesByCapture.get(captureId) ?? [];
    const products = captureProducts(captureId);
    const executions = captureExecutions(captureId);
    const snapshots = executions
      .map((execution) => snapshotByExecution.get(id(execution.id)))
      .filter(Boolean) as AnalyticsRow[];
    if (filters.marketplace && id(analysis?.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && !sources.some((source) => id(source.connection_id) === filters.connectionId)) return false;
    if (filters.groupId && !sources.some((source) => id(source.group_id) === filters.groupId)) return false;
    if (filters.automationId && !executions.some((execution) => id(execution.automation_id) === filters.automationId)) return false;
    if (filters.productId && !products.some((product) => id(product.id) === filters.productId)) return false;
    if (filters.templateId && !snapshots.some((snapshot) => id(snapshot.template_id) === filters.templateId)) return false;
    if (filters.generationMode && !snapshots.some((snapshot) => snapshotMode(snapshot) === filters.generationMode)) return false;
    return true;
  };

  const executionMatchesFilters = (execution: AnalyticsRow) => {
    const snapshot = snapshotByExecution.get(id(execution.id));
    const capture = rows.captures.find((row) => id(row.id) === id(execution.source_reference_id));
    const product = productById.get(id(snapshot?.product_id));
    const captureSources = sourcesByCapture.get(id(capture?.id)) ?? [];
    if (filters.marketplace && id(product?.marketplace) !== filters.marketplace && id(analysisByCapture.get(id(capture?.id))?.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && !captureSources.some((source) => id(source.connection_id) === filters.connectionId)) return false;
    if (filters.groupId && !captureSources.some((source) => id(source.group_id) === filters.groupId)) return false;
    if (filters.automationId && id(execution.automation_id) !== filters.automationId) return false;
    if (filters.productId && id(snapshot?.product_id) !== filters.productId) return false;
    if (filters.templateId && id(snapshot?.template_id) !== filters.templateId) return false;
    if (filters.generationMode && snapshotMode(snapshot) !== filters.generationMode) return false;
    return true;
  };

  const deliveryMatchesFilters = (delivery: AnalyticsRow) => {
    const item = itemById.get(id(delivery.queue_item_id));
    const product = productById.get(id(item?.product_id ?? item?.content_snapshot?.productId));
    const execution = executionByQueue.get(id(item?.id));
    if (filters.marketplace && id(product?.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && id(delivery.connection_id) !== filters.connectionId) return false;
    if (filters.groupId && id(delivery.whatsapp_group_id) !== filters.groupId) return false;
    if (filters.automationId && id(execution?.automation_id) !== filters.automationId) return false;
    if (filters.productId && id(product?.id) !== filters.productId) return false;
    if (filters.templateId && itemTemplate(item) !== filters.templateId) return false;
    if (filters.generationMode && queueMode(item) !== filters.generationMode) return false;
    return true;
  };

  const orderMatchesFilters = (order: AnalyticsRow) => {
    const delivery = rows.deliveries.find((row) => id(row.id) === id(order.delivery_id));
    const item = itemById.get(id(order.queue_item_id ?? delivery?.queue_item_id));
    if (filters.marketplace && id(order.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && id(delivery?.connection_id) !== filters.connectionId) return false;
    if (filters.groupId && id(order.group_id ?? delivery?.whatsapp_group_id) !== filters.groupId) return false;
    if (filters.automationId && id(order.automation_id) !== filters.automationId) return false;
    if (filters.productId && id(order.product_id) !== filters.productId) return false;
    if (filters.templateId && id(order.template_id ?? itemTemplate(item)) !== filters.templateId) return false;
    if (filters.generationMode && (!item || queueMode(item) !== filters.generationMode)) return false;
    return true;
  };

  const conversionMatchesFilters = (conversion: AnalyticsRow) => {
    const product = rows.products.find((row) => id(row.affiliate_conversion_id) === id(conversion.id));
    const analysis = rows.analyses.find((row) => id(row.id) === id(product?.source_reference_id));
    const captureId = id(analysis?.captured_message_id);
    const sources = sourcesByCapture.get(captureId) ?? [];
    const executions = captureExecutions(captureId);
    const snapshots = executions.map((row) => snapshotByExecution.get(id(row.id))).filter(Boolean) as AnalyticsRow[];
    if (filters.marketplace && id(conversion.detected_platform ?? product?.marketplace) !== filters.marketplace) return false;
    if (filters.connectionId && !sources.some((source) => id(source.connection_id) === filters.connectionId)) return false;
    if (filters.groupId && !sources.some((source) => id(source.group_id) === filters.groupId)) return false;
    if (filters.automationId && !executions.some((execution) => id(execution.automation_id) === filters.automationId)) return false;
    if (filters.productId && id(product?.id) !== filters.productId) return false;
    if (filters.templateId && !snapshots.some((snapshot) => id(snapshot.template_id) === filters.templateId)) return false;
    if (filters.generationMode && !snapshots.some((snapshot) => snapshotMode(snapshot) === filters.generationMode)) return false;
    return true;
  };

  const captures = rows.captures.filter(
    (row) => isWithin(row.received_at, period.from, period.to) && captureMatchesFilters(row),
  );
  const captureIds = new Set(captures.map((row) => id(row.id)));
  const promotions = captures.filter((row) => row.processing_status === "promotion_detected");
  const ignored = captures.filter((row) => row.processing_status === "ignored");
  const needsReview = captures.filter((row) => row.processing_status === "needs_review");

  const preparedEvents = new Map<string, { at: string; snapshot?: AnalyticsRow; item?: AnalyticsRow }>();
  for (const snapshot of currentSnapshots) {
    const execution = rows.automationExecutions.find((row) => id(row.id) === id(snapshot.execution_id));
    if (!execution || !executionMatchesFilters(execution) || !isWithin(snapshot.prepared_at, period.from, period.to)) continue;
    const key = id(snapshot.cta_generation_id) ? `cta:${id(snapshot.cta_generation_id)}` : `snapshot:${id(snapshot.id)}`;
    preparedEvents.set(key, { at: snapshot.prepared_at, snapshot });
  }
  for (const item of rows.queueItems) {
    if (!isWithin(item.created_at, period.from, period.to)) continue;
    if (!itemMatchesFilters(item)) continue;
    const generationId = id(item.content_snapshot?.ctaGenerationId);
    const key = generationId ? `cta:${generationId}` : `item:${id(item.id)}`;
    if (!preparedEvents.has(key)) preparedEvents.set(key, { at: item.created_at, item });
  }

  const sentDeliveries = rows.deliveries.filter(
    (row) => row.status === "sent" && isWithin(row.sent_at, period.from, period.to) && deliveryMatchesFilters(row),
  );
  const selectedConnections = rows.connections.filter((connection) =>
    !filters.connectionId || id(connection.id) === filters.connectionId);
  const receiptTrackingAvailable = selectedConnections.some((connection) =>
    Boolean(connection.receipt_tracking_started_at)
    && Date.parse(String(connection.receipt_tracking_started_at)) <= Date.parse(period.to));
  const receiptTrackedSentDeliveries = sentDeliveries.filter((delivery) => {
    const trackingStartedAt = connectionById.get(id(delivery.connection_id))?.receipt_tracking_started_at;
    return trackingStartedAt
      && Date.parse(String(delivery.sent_at)) >= Date.parse(String(trackingStartedAt));
  });
  const deliveredDeliveries = receiptTrackedSentDeliveries.filter((delivery) =>
    delivery.delivered_at && Date.parse(String(delivery.delivered_at)) <= Date.parse(period.to));
  const readDeliveries = receiptTrackedSentDeliveries.filter((delivery) =>
    delivery.read_at && Date.parse(String(delivery.read_at)) <= Date.parse(period.to));
  const failedDeliveries = rows.deliveries.filter(
    (row) => ["failed", "uncertain"].includes(row.status)
      && isWithin(row.last_error_at ?? row.updated_at, period.from, period.to)
      && deliveryMatchesFilters(row),
  );
  const orders = rows.orders.filter((row) =>
    isWithin(row.purchased_at, period.from, period.to) && orderMatchesFilters(row));
  const activeOrders = orders.filter((row) => !["CANCELLED", "REFUNDED"].includes(row.status));
  const advertisedProductIds = new Set(
    sentDeliveries
      .map((delivery) => itemById.get(id(delivery.queue_item_id)))
      .map((item) => id(item?.product_id ?? item?.content_snapshot?.productId))
      .filter(Boolean),
  );
  const generatedLinks = rows.conversions.filter(
    (row) => row.status === "converted"
      && isWithin(row.converted_at, period.from, period.to)
      && conversionMatchesFilters(row),
  );
  const impactedGroups = new Set(sentDeliveries.map((row) => id(row.whatsapp_group_id)));
  const successful = sentDeliveries.length;
  const finalFailures = failedDeliveries.length;

  const seriesMap = new Map(
    dateKeys(period.from, period.to, timezone).map((date) => [date, {
      date,
      captured: 0,
      promotions: 0,
      prepared: 0,
      sent: 0,
      failed: 0,
      delivered: receiptTrackingAvailable ? 0 : null,
      read: receiptTrackingAvailable ? 0 : null,
      clicks: null,
    }]),
  );
  const increment = (at: string, key: "captured" | "promotions" | "prepared" | "sent" | "failed" | "delivered" | "read") => {
    const point = seriesMap.get(analyticsDateKey(at, timezone));
    if (point && point[key] != null) point[key]++;
  };
  for (const capture of captures) increment(capture.received_at, "captured");
  for (const promotion of promotions) increment(promotion.received_at, "promotions");
  for (const prepared of preparedEvents.values()) increment(prepared.at, "prepared");
  for (const delivery of sentDeliveries) increment(delivery.sent_at, "sent");
  for (const delivery of failedDeliveries) increment(delivery.last_error_at ?? delivery.updated_at, "failed");
  if (receiptTrackingAvailable) {
    for (const delivery of rows.deliveries.filter((row) => row.delivered_at && isWithin(row.delivered_at, period.from, period.to) && deliveryMatchesFilters(row)))
      increment(delivery.delivered_at, "delivered");
    for (const delivery of rows.deliveries.filter((row) => row.read_at && isWithin(row.read_at, period.from, period.to) && deliveryMatchesFilters(row)))
      increment(delivery.read_at, "read");
  }

  const breakdownForDeliveries = (
    keys: Array<{ id: string; name: string; match: (delivery: AnalyticsRow) => boolean }>,
  ) => keys.map((entry) => {
    const sentRows = sentDeliveries.filter(entry.match);
    const failedRows = failedDeliveries.filter(entry.match);
    const value = blankBreakdown(entry.id, entry.name);
    value.sent = sentRows.length;
    value.delivered = receiptTrackingAvailable
      ? sentRows.filter((delivery) => delivery.delivered_at).length
      : null;
    value.read = receiptTrackingAvailable
      ? sentRows.filter((delivery) => delivery.read_at).length
      : null;
    value.failed = failedRows.length;
    value.products = new Set(sentRows.map((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return id(item?.product_id ?? item?.content_snapshot?.productId);
    }).filter(Boolean)).size;
    value.linksGenerated = new Set(sentRows.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return Boolean(item?.content_snapshot?.affiliateUrl ?? item?.affiliate_url);
    }).map((delivery) => id(delivery.queue_item_id))).size;
    return value;
  }).filter((row) => row.sent > 0 || row.failed > 0);

  const groups = breakdownForDeliveries(rows.groups.map((group) => ({
    id: id(group.id),
    name: String(group.name ?? "Grupo"),
    match: (delivery: AnalyticsRow) => id(delivery.whatsapp_group_id) === id(group.id),
  }))).sort((a, b) => b.sent - a.sent);

  const connections = breakdownForDeliveries(rows.connections.map((connection) => ({
    id: id(connection.id),
    name: String(connection.label ?? connection.display_name ?? connection.phone ?? "Conexão WhatsApp"),
    match: (delivery: AnalyticsRow) => id(delivery.connection_id) === id(connection.id),
  }))).map((row) => ({
    ...row,
    groups: new Set(sentDeliveries.filter((delivery) => id(delivery.connection_id) === row.id).map((delivery) => id(delivery.whatsapp_group_id))).size,
  })).sort((a, b) => b.sent - a.sent);

  const products = breakdownForDeliveries(rows.products.map((product) => ({
    id: id(product.id),
    name: String(product.title ?? "Produto"),
    match: (delivery: AnalyticsRow) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return id(item?.product_id ?? item?.content_snapshot?.productId) === id(product.id);
    },
  }))).map((row) => {
    const attributedOrders = activeOrders.filter((order) => id(order.product_id) === row.id);
    const hasAttribution = orders.some((order) => id(order.product_id) === row.id);
    return {
    ...row,
    marketplace: id(productById.get(row.id)?.marketplace) || "unknown",
    groups: new Set(sentDeliveries.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return id(item?.product_id ?? item?.content_snapshot?.productId) === row.id;
    }).map((delivery) => id(delivery.whatsapp_group_id))).size,
    linksGenerated: generatedLinks.filter((conversion) => id(rows.products.find((product) => id(product.affiliate_conversion_id) === id(conversion.id))?.id) === row.id).length,
    orders: hasAttribution ? attributedOrders.length : null,
    salesValue: hasAttribution ? sumKnown(attributedOrders, "sales_value") : null,
    estimatedCommission: hasAttribution ? sumKnown(attributedOrders, "estimated_commission") : null,
  };}).sort((a, b) => b.sent - a.sent);

  const matchedStatuses = new Set(["matched", "processing", "awaiting_review", "queued", "completed", "failed", "retry_wait"]);
  const automations = rows.automationRules.map((rule) => {
    const executions = rows.automationExecutions.filter((execution) =>
      id(execution.automation_id) === id(rule.id)
      && isWithin(execution.created_at, period.from, period.to)
      && executionMatchesFilters(execution));
    const queueIds = new Set(executions.map((execution) => id(execution.queue_item_id)).filter(Boolean));
    const value = blankBreakdown(id(rule.id), String(rule.name ?? "Automação sem nome"));
    value.promotions = new Set(executions.filter((execution) => execution.event_type === "PROMOTION_DETECTED").map((execution) => id(execution.source_reference_id))).size;
    value.captured = value.promotions;
    value.prepared = executions.filter((execution) => snapshotByExecution.has(id(execution.id))).length;
    value.sent = sentDeliveries.filter((delivery) => queueIds.has(id(delivery.queue_item_id))).length;
    value.failed = failedDeliveries.filter((delivery) => queueIds.has(id(delivery.queue_item_id))).length
      + executions.filter((execution) => execution.status === "failed" && !execution.queue_item_id).length;
    (value as AnalyticsBreakdownRow & { matched: number }).matched = executions.filter((execution) => matchedStatuses.has(execution.status)).length;
    return value;
  }).filter((row) => (row.captured ?? 0) + (row.prepared ?? 0) + row.sent + row.failed > 0)
    .sort((a, b) => b.sent - a.sent);

  const templateKeys = new Map<string, { templateId: string; version: number | null }>();
  for (const prepared of preparedEvents.values()) {
    const templateId = id(prepared.snapshot?.template_id ?? prepared.item?.content_snapshot?.templateId);
    if (!templateId) continue;
    const versionRaw = prepared.snapshot?.template_version ?? prepared.item?.content_snapshot?.templateVersion;
    const version = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : null;
    templateKeys.set(`${templateId}:${version ?? "unknown"}`, { templateId, version });
  }
  const templates = [...templateKeys.entries()].map(([key, value]) => {
    const name = String(templateById.get(value.templateId)?.name ?? "Template removido");
    const row = blankBreakdown(key, `${name} · ${value.version == null ? "versão não registrada" : `v${value.version}`}`);
    row.prepared = [...preparedEvents.values()].filter((event) => {
      const templateId = id(event.snapshot?.template_id ?? event.item?.content_snapshot?.templateId);
      const version = event.snapshot?.template_version ?? event.item?.content_snapshot?.templateVersion;
      return `${templateId}:${Number.isFinite(Number(version)) ? Number(version) : "unknown"}` === key;
    }).length;
    row.sent = sentDeliveries.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      const templateId = itemTemplate(item);
      const version = item?.content_snapshot?.templateVersion;
      return `${templateId}:${Number.isFinite(Number(version)) ? Number(version) : "unknown"}` === key;
    }).length;
    row.failed = failedDeliveries.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      const templateId = itemTemplate(item);
      const version = item?.content_snapshot?.templateVersion;
      return `${templateId}:${Number.isFinite(Number(version)) ? Number(version) : "unknown"}` === key;
    }).length;
    return row;
  }).sort((a, b) => b.sent - a.sent);

  const generationModes = (["monitor_passthrough", "cta_template", "manual"] as AnalyticsGenerationMode[]).map((mode) => {
    const row = blankBreakdown(mode, modeLabel(mode));
    row.prepared = [...preparedEvents.values()].filter((event) => event.snapshot ? snapshotMode(event.snapshot) === mode : queueMode(event.item) === mode).length;
    row.sent = sentDeliveries.filter((delivery) => queueMode(itemById.get(id(delivery.queue_item_id))) === mode).length;
    row.failed = failedDeliveries.filter((delivery) => queueMode(itemById.get(id(delivery.queue_item_id))) === mode).length;
    return row;
  }).filter((row) => (row.prepared ?? 0) + row.sent + row.failed > 0);

  const marketplaces = Object.entries(MARKETPLACE_ANALYTICS_CAPABILITIES)
    .filter(([marketplace]) => !filters.marketplace || marketplace === filters.marketplace)
    .map(([marketplace, capabilities]) => {
    const marketplaceProducts = new Set(rows.products.filter((product) => id(product.marketplace) === marketplace).map((product) => id(product.id)));
    const marketplaceSent = sentDeliveries.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return marketplaceProducts.has(id(item?.product_id ?? item?.content_snapshot?.productId));
    });
    const marketplaceFailed = failedDeliveries.filter((delivery) => {
      const item = itemById.get(id(delivery.queue_item_id));
      return marketplaceProducts.has(id(item?.product_id ?? item?.content_snapshot?.productId));
    });
    const marketplaceOrders = orders.filter((order) => id(order.marketplace) === marketplace);
    const marketplaceActiveOrders = marketplaceOrders.filter((order) => !["CANCELLED", "REFUNDED"].includes(order.status));
    const analyticsSync = rows.marketplaceSyncStates.find((state) => id(state.marketplace) === marketplace);
    const reportingAvailable = Boolean(analyticsSync?.last_success_at) || marketplaceOrders.length > 0;
    const effectiveCapabilities = {
      ...capabilities,
      orders: capabilities.orders && reportingAvailable,
      salesValue: capabilities.salesValue && reportingAvailable,
      commissionEstimated: capabilities.commissionEstimated && reportingAvailable,
      cancellations: capabilities.cancellations && reportingAvailable,
      refunds: capabilities.refunds && reportingAvailable,
      lastSales: capabilities.lastSales && reportingAvailable,
    };
    const runs = rows.discoveryRuns.filter((run) => id(run.marketplace) === marketplace);
    const latest = analyticsSync ?? lastBy(runs, "updated_at");
    const syncStatus = analyticsSync?.status ?? (!latest ? "UNAVAILABLE"
      : ["running", "pending"].includes(latest.status) ? "SYNCING"
      : latest.status === "completed" && !latest.last_error_code ? "SYNCED"
      : latest.status === "failed" ? "FAILED" : "DEGRADED");
    return {
      ...blankBreakdown(marketplace, marketplace),
      marketplace,
      products: new Set(marketplaceSent.map((delivery) => {
        const item = itemById.get(id(delivery.queue_item_id));
        return id(item?.product_id ?? item?.content_snapshot?.productId);
      }).filter(Boolean)).size,
      sent: marketplaceSent.length,
      failed: marketplaceFailed.length,
      groups: new Set(marketplaceSent.map((delivery) => id(delivery.whatsapp_group_id))).size,
      linksGenerated: generatedLinks.filter((conversion) => id(conversion.detected_platform) === marketplace).length,
      orders: effectiveCapabilities.orders ? marketplaceActiveOrders.length : null,
      salesValue: effectiveCapabilities.salesValue ? sumKnown(marketplaceActiveOrders, "sales_value") : null,
      estimatedCommission: effectiveCapabilities.commissionEstimated ? sumKnown(marketplaceActiveOrders, "estimated_commission") : null,
      cancellations: effectiveCapabilities.cancellations ? marketplaceOrders.filter((order) => order.status === "CANCELLED").length : null,
      refunds: effectiveCapabilities.refunds ? marketplaceOrders.filter((order) => order.status === "REFUNDED").length : null,
      capabilities: effectiveCapabilities,
      lastSyncAt: analyticsSync?.last_success_at ?? latest?.completed_at ?? latest?.updated_at ?? null,
      syncStatus: syncStatus as "SYNCED" | "SYNCING" | "DEGRADED" | "FAILED" | "UNAVAILABLE",
      lastErrorCode: analyticsSync?.last_error_code ?? latest?.last_error_code ?? null,
    };
  });

  const orderReportingAvailable = marketplaces.some((row) => row.capabilities.orders);
  const salesReportingAvailable = marketplaces.some((row) => row.capabilities.salesValue);
  const estimatedCommissionAvailable = marketplaces.some((row) => row.capabilities.commissionEstimated);

  const unsupportedWhatsApp = "A conexão ainda não registrou o início da captura de receipts; envios históricos permanecem desconhecidos.";
  const unsupportedMarketplace = "Nenhuma integração ativa fornece este dado de forma confiável.";
  const overview: AnalyticsResponse["overview"] = {
    captured: available(captures.length, "Mensagens canônicas capturadas pelo Monitor no período."),
    promotions: available(promotions.length, "Capturas cujo processing_status real é promotion_detected."),
    prepared: available(preparedEvents.size, "Mensagens com snapshot imutável ou item de fila efetivamente preparado."),
    sent: available(successful, "Deliveries distintas com status sent e sent_at no período."),
    delivered: receiptTrackingAvailable
      ? available(deliveredDeliveries.length, "Deliveries enviadas durante a janela monitorada com receipt real de entrega para ao menos um participante.")
      : unavailable("Deliveries com receipt de entrega confirmado.", unsupportedWhatsApp),
    read: receiptTrackingAvailable
      ? available(readDeliveries.length, "Deliveries enviadas durante a janela monitorada com receipt real de leitura para ao menos um participante.")
      : unavailable("Deliveries com receipt de leitura confirmado.", unsupportedWhatsApp),
    failed: available(finalFailures, "Deliveries em estado terminal failed ou uncertain; retries bem-sucedidos não permanecem como falha."),
    successRate: successful + finalFailures
      ? available(successful / (successful + finalFailures), "sent / (sent + falhas terminais)")
      : unavailable("sent / (sent + falhas terminais)", "Não há outcomes de envio no período."),
    activeGroups: available(impactedGroups.size, "Grupos distintos com ao menos uma delivery sent no período."),
    productsAdvertised: available(advertisedProductIds.size, "Products distintos associados a deliveries sent."),
    linksGenerated: available(generatedLinks.length, "Affiliate conversions distintas com status converted e converted_at no período."),
    clicks: unavailable("Cliques reais reportados por marketplace ou redirect compatível.", unsupportedMarketplace),
    ctr: unavailable("clicks / messages sent", "Cliques reais não estão disponíveis; o denominador definido seria mensagens enviadas."),
    orders: orderReportingAvailable
      ? available(activeOrders.length, "Pedidos reais recebidos do relatório oficial, excluindo cancelados e reembolsados.")
      : unavailable("Pedidos reais recebidos de marketplaces.", unsupportedMarketplace),
    salesValue: salesReportingAvailable
      ? available(sumKnown(activeOrders, "sales_value") ?? 0, "Soma do valor dos itens em pedidos reais não cancelados/reembolsados.")
      : unavailable("Soma do valor de pedidos reais elegíveis.", unsupportedMarketplace),
    estimatedCommission: estimatedCommissionAvailable && sumKnown(activeOrders, "estimated_commission") != null
      ? available(sumKnown(activeOrders, "estimated_commission")!, "Comissão estimada informada pelo relatório de conversões; cancelamentos e reembolsos são excluídos.")
      : unavailable("Comissão estimada reportada pelo marketplace ou sale_value × taxa confiável.", "O relatório disponível não contém comissão estimada completa."),
    confirmedCommission: unavailable("Comissão confirmada pelo marketplace.", unsupportedMarketplace),
  };

  return {
    period,
    appliedFilters: {
      preset: filters.preset,
      marketplace: filters.marketplace,
      connectionId: filters.connectionId,
      groupId: filters.groupId,
      automationId: filters.automationId,
      productId: filters.productId,
      templateId: filters.templateId,
      generationMode: filters.generationMode,
    },
    filterOptions: {
      marketplaces: Object.keys(MARKETPLACE_ANALYTICS_CAPABILITIES),
      connections: rows.connections.map((row) => ({ id: id(row.id), name: String(row.label ?? row.display_name ?? row.phone ?? "Conexão WhatsApp") })),
      groups: rows.groups.map((row) => ({ id: id(row.id), name: String(row.name ?? "Grupo"), connectionId: id(row.connection_id) })),
      automations: rows.automationRules.map((row) => ({ id: id(row.id), name: String(row.name ?? "Automação sem nome") })),
      products: rows.products.map((row) => ({ id: id(row.id), name: String(row.title ?? "Produto"), marketplace: id(row.marketplace) || "unknown" })),
      templates: rows.templates.map((row) => ({ id: id(row.id), name: String(row.name ?? "Template") })),
      generationModes: ["monitor_passthrough", "cta_template", "manual"],
    },
    capabilities: {
      whatsapp: { captured: true, promotions: true, prepared: true, sent: true, failed: true, delivered: receiptTrackingAvailable, read: receiptTrackingAvailable, clicks: false },
      marketplaces: Object.fromEntries(marketplaces.map((row) => [row.marketplace!, row.capabilities])),
    },
    overview,
    whatsapp: {
      captured: captures.length,
      promotions: promotions.length,
      ignored: ignored.length,
      needsReview: needsReview.length,
      prepared: preparedEvents.size,
      sent: successful,
      failed: finalFailures,
      delivered: receiptTrackingAvailable ? deliveredDeliveries.length : null,
      read: receiptTrackingAvailable ? readDeliveries.length : null,
      deliveryRate: receiptTrackingAvailable && receiptTrackedSentDeliveries.length
        ? deliveredDeliveries.length / receiptTrackedSentDeliveries.length
        : null,
      readRate: receiptTrackingAvailable && deliveredDeliveries.length
        ? readDeliveries.length / deliveredDeliveries.length
        : null,
      clicks: null,
      ctr: null,
      productsAdvertised: advertisedProductIds.size,
      groupsImpacted: impactedGroups.size,
      averageMessagesPerGroup: impactedGroups.size ? successful / impactedGroups.size : null,
      automaticMessages: sentDeliveries.filter((delivery) => queueMode(itemById.get(id(delivery.queue_item_id))) !== "manual").length,
      manualMessages: sentDeliveries.filter((delivery) => queueMode(itemById.get(id(delivery.queue_item_id))) === "manual").length,
    },
    series: [...seriesMap.values()],
    groups,
    connections,
    products,
    automations,
    templates,
    generationModes,
    marketplaces,
    sales: orders.sort((a, b) => Date.parse(String(b.purchased_at)) - Date.parse(String(a.purchased_at))).slice(0, 50).map((order) => {
      const product = productById.get(id(order.product_id));
      const firstItem = rows.orderItems.find((item) => id(item.order_id) === id(order.id));
      return {
        id: id(order.id),
        product: String(product?.title ?? firstItem?.name ?? "Produto não identificado"),
        marketplace: id(order.marketplace),
        purchasedAt: String(order.purchased_at),
        salesValue: amount(order.sales_value) ?? 0,
        estimatedCommission: amount(order.estimated_commission),
        confirmedCommission: amount(order.confirmed_commission),
        status: order.status as "PENDING" | "CONFIRMED" | "CANCELLED" | "REFUNDED",
        group: rows.groups.find((group) => id(group.id) === id(order.group_id))?.name ?? null,
        automation: ruleById.get(id(order.automation_id))?.name ?? null,
      };
    }),
    formulas: {
      successRate: "sent / (sent + falhas terminais)",
      ctr: "clicks / messages_sent",
      conversionRate: "orders / clicks",
      readRate: "deliveries com ao menos um read receipt / deliveries com ao menos um delivery receipt",
      estimatedCommission: "valor estimado reportado pelo marketplace; fallback futuro: sale_value × commission_rate confiável",
    },
  };
}
