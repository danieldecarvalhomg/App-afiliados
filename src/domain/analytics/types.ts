export type AnalyticsPeriodPreset = "today" | "7d" | "30d" | "90d" | "custom";

export type AnalyticsGenerationMode =
  | "monitor_passthrough"
  | "cta_template"
  | "manual";

export interface AnalyticsFilters {
  preset: AnalyticsPeriodPreset;
  from?: string;
  to?: string;
  marketplace?: string;
  connectionId?: string;
  groupId?: string;
  automationId?: string;
  productId?: string;
  templateId?: string;
  generationMode?: AnalyticsGenerationMode;
}

export interface AnalyticsMetric {
  value: number | null;
  available: boolean;
  definition: string;
  unavailableReason?: string;
}

export interface MarketplaceAnalyticsCapabilities {
  linksGenerated: boolean;
  productsAdvertised: boolean;
  messagesSent: boolean;
  groups: boolean;
  clicks: boolean;
  uniqueClicks: boolean;
  orders: boolean;
  salesValue: boolean;
  commissionEstimated: boolean;
  commissionConfirmed: boolean;
  conversionRate: boolean;
  cancellations: boolean;
  refunds: boolean;
  lastSales: boolean;
  syncHealth: boolean;
}

export interface AnalyticsBreakdownRow {
  id: string;
  name: string;
  marketplace?: string;
  captured?: number;
  promotions?: number;
  prepared?: number;
  sent: number;
  delivered?: number | null;
  read?: number | null;
  failed: number;
  groups?: number;
  products?: number;
  linksGenerated?: number;
  clicks: number | null;
  ctr: number | null;
  orders: number | null;
  salesValue: number | null;
  estimatedCommission: number | null;
  confirmedCommission: number | null;
  cancellations?: number | null;
  refunds?: number | null;
}

export interface AnalyticsTimePoint {
  date: string;
  captured: number;
  promotions: number;
  prepared: number;
  sent: number;
  failed: number;
  delivered: number | null;
  read: number | null;
  clicks: null;
}

export interface AnalyticsResponse {
  period: {
    preset: AnalyticsPeriodPreset;
    from: string;
    to: string;
    timezone: string;
  };
  appliedFilters: Omit<AnalyticsFilters, "from" | "to">;
  filterOptions: {
    marketplaces: string[];
    connections: Array<{ id: string; name: string }>;
    groups: Array<{ id: string; name: string; connectionId: string }>;
    automations: Array<{ id: string; name: string }>;
    products: Array<{ id: string; name: string; marketplace: string }>;
    templates: Array<{ id: string; name: string }>;
    generationModes: AnalyticsGenerationMode[];
  };
  capabilities: {
    whatsapp: {
      captured: true;
      promotions: true;
      prepared: true;
      sent: true;
      failed: true;
      delivered: boolean;
      read: boolean;
      clicks: false;
    };
    marketplaces: Record<string, MarketplaceAnalyticsCapabilities>;
  };
  overview: {
    captured: AnalyticsMetric;
    promotions: AnalyticsMetric;
    prepared: AnalyticsMetric;
    sent: AnalyticsMetric;
    delivered: AnalyticsMetric;
    read: AnalyticsMetric;
    failed: AnalyticsMetric;
    successRate: AnalyticsMetric;
    activeGroups: AnalyticsMetric;
    productsAdvertised: AnalyticsMetric;
    linksGenerated: AnalyticsMetric;
    clicks: AnalyticsMetric;
    ctr: AnalyticsMetric;
    orders: AnalyticsMetric;
    salesValue: AnalyticsMetric;
    estimatedCommission: AnalyticsMetric;
    confirmedCommission: AnalyticsMetric;
  };
  whatsapp: {
    captured: number;
    promotions: number;
    ignored: number;
    needsReview: number;
    prepared: number;
    sent: number;
    failed: number;
    delivered: number | null;
    read: number | null;
    deliveryRate: number | null;
    readRate: number | null;
    clicks: null;
    ctr: null;
    productsAdvertised: number;
    groupsImpacted: number;
    averageMessagesPerGroup: number | null;
    automaticMessages: number;
    manualMessages: number;
  };
  series: AnalyticsTimePoint[];
  groups: AnalyticsBreakdownRow[];
  connections: AnalyticsBreakdownRow[];
  products: AnalyticsBreakdownRow[];
  automations: AnalyticsBreakdownRow[];
  templates: AnalyticsBreakdownRow[];
  generationModes: AnalyticsBreakdownRow[];
  marketplaces: Array<AnalyticsBreakdownRow & {
    capabilities: MarketplaceAnalyticsCapabilities;
    lastSyncAt: string | null;
    syncStatus: "SYNCED" | "SYNCING" | "DEGRADED" | "FAILED" | "UNAVAILABLE";
    lastErrorCode: string | null;
  }>;
  sales: Array<{
    id: string;
    product: string;
    marketplace: string;
    purchasedAt: string;
    salesValue: number;
    estimatedCommission: number | null;
    confirmedCommission: number | null;
    status: "PENDING" | "CONFIRMED" | "CANCELLED" | "REFUNDED";
    group: string | null;
    automation: string | null;
  }>;
  formulas: {
    successRate: string;
    ctr: string;
    conversionRate: string;
    readRate: string;
    estimatedCommission: string;
  };
}
