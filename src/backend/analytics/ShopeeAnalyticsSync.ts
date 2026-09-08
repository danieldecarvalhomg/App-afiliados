import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AffiliateProviderCredentials } from "../../domain/affiliate/types";
import { shopeeTrackingSubId } from "../../domain/affiliate/ShopeeTracking";
import { decryptAffiliateCredentials } from "../affiliate/AffiliateCredentialsCrypto";

type Row = Record<string, any>;

export interface ShopeeOrderFact {
  externalOrderId: string;
  externalConversionId: string;
  purchasedAt: string;
  attributedClickAt: string | null;
  externalStatus: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  salesValue: number;
  estimatedCommission: number | null;
  trackingSubId: string | null;
  items: Array<{
    externalItemId: string;
    name: string | null;
    unitPrice: number;
    quantity: number;
    estimatedCommission: number | null;
    attributionType: string | null;
  }>;
}

const number = (value: unknown): number | null => {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const money = (value: unknown) => {
  const parsed = number(value);
  return parsed == null ? null : Math.round(parsed * 100) / 100;
};
const timestamp = (value: unknown) => {
  const parsed = number(value);
  if (parsed == null || parsed <= 0) return null;
  const date = new Date(parsed < 10_000_000_000 ? parsed * 1_000 : parsed);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

export function normalizeShopeeConversionNodes(nodes: unknown[]): ShopeeOrderFact[] {
  const result: ShopeeOrderFact[] = [];
  for (const conversion of nodes as Row[]) {
    const purchasedAt = timestamp(conversion.purchaseTime);
    if (!purchasedAt) continue;
    for (const order of Array.isArray(conversion.orders) ? conversion.orders : []) {
      const externalOrderId = String(order.orderId ?? "").trim();
      const externalStatus = String(order.orderStatus ?? "").toUpperCase();
      if (!externalOrderId || !["UNPAID", "PENDING", "COMPLETED", "CANCELLED"].includes(externalStatus)) continue;
      const items: ShopeeOrderFact["items"] = (Array.isArray(order.items) ? order.items : []).flatMap((item: Row) => {
        const externalItemId = String(item.itemId ?? "").trim();
        const unitPrice = money(item.itemPrice);
        const quantity = Math.trunc(number(item.qty) ?? 0);
        if (!externalItemId || unitPrice == null || unitPrice < 0 || quantity <= 0) return [];
        return [{
          externalItemId,
          name: typeof item.itemName === "string" ? item.itemName.slice(0, 500) : null,
          unitPrice,
          quantity,
          estimatedCommission: money(item.itemTotalCommission),
          attributionType: typeof item.attributionType === "string" ? item.attributionType.slice(0, 80) : null,
        }];
      });
      // Sem itens/preços, o valor vendido seria desconhecido — nunca zero.
      if (!items.length) continue;
      const salesValue = Math.round(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100) / 100;
      const knownItemCommissions = items.map((item) => item.estimatedCommission).filter((value): value is number => value != null);
      result.push({
        externalOrderId,
        externalConversionId: String(conversion.conversionId ?? ""),
        purchasedAt,
        attributedClickAt: timestamp(conversion.clickTime),
        externalStatus,
        status: externalStatus === "COMPLETED" ? "CONFIRMED"
          : externalStatus === "CANCELLED" ? "CANCELLED" : "PENDING",
        salesValue,
        // totalCommission pertence à conversão, que pode conter mais de um
        // pedido. Só a soma dos itens pode ser atribuída a este order sem duplicar.
        estimatedCommission: knownItemCommissions.length === items.length
          ? Math.round(knownItemCommissions.reduce((sum, value) => sum + value, 0) * 100) / 100
          : null,
        trackingSubId: typeof conversion.utmContent === "string"
          ? conversion.utmContent.slice(0, 500) : null,
        items,
      });
    }
  }
  return result;
}

export class ShopeeAnalyticsProvider {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly endpoint = process.env.SHOPEE_AFFILIATE_API_URL ??
      "https://open-api.affiliate.shopee.com.br/graphql",
  ) {}

  private async request(credentials: AffiliateProviderCredentials, query: string) {
    const body = JSON.stringify({ query });
    const timestamp = Math.floor(Date.now() / 1_000);
    const signature = createHash("sha256")
      .update(`${credentials.appId}${timestamp}${body}${credentials.secret}`)
      .digest("hex");
    const response = await this.fetcher(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `SHA256 Credential=${credentials.appId}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      body,
    });
    if (!response.ok) throw new Error(response.status === 429 ? "SHOPEE_ANALYTICS_RATE_LIMITED" : `SHOPEE_ANALYTICS_HTTP_${response.status}`);
    const payload = await response.json() as Row;
    if (payload.errors?.length) {
      const code = payload.errors[0]?.extensions?.code;
      throw new Error(code ? `SHOPEE_ANALYTICS_API_${code}` : "SHOPEE_ANALYTICS_API_ERROR");
    }
    return payload.data?.conversionReport as Row | undefined;
  }

  async listOrders(credentials: AffiliateProviderCredentials, from: Date, to: Date) {
    const nodes: Row[] = [];
    let scrollId: string | null = null;
    for (let page = 0; page < 500; page += 1) {
      const args = [
        `purchaseTimeStart:${Math.floor(from.getTime() / 1_000)}`,
        `purchaseTimeEnd:${Math.floor(to.getTime() / 1_000)}`,
        "limit:500",
        ...(scrollId ? [`scrollId:${JSON.stringify(scrollId)}`] : []),
      ];
      const report = await this.request(credentials,
        `{ conversionReport(${args.join(",")}) { nodes { conversionId purchaseTime clickTime totalCommission utmContent orders { orderId orderStatus items { itemId itemName itemPrice qty itemTotalCommission attributionType } } } pageInfo { hasNextPage scrollId } } }`);
      nodes.push(...(Array.isArray(report?.nodes) ? report.nodes : []));
      if (!report?.pageInfo?.hasNextPage || !report.pageInfo.scrollId) break;
      scrollId = String(report.pageInfo.scrollId);
    }
    return normalizeShopeeConversionNodes(nodes);
  }
}

export class ShopeeAnalyticsSyncService {
  private running = false;
  constructor(
    private readonly db: SupabaseClient,
    private readonly provider = new ShopeeAnalyticsProvider(),
  ) {}

  async syncAll(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const { data, error } = await this.db.from("affiliate_accounts")
        .select("user_id,encrypted_credentials")
        .eq("platform", "shopee").eq("status", "configured")
        .eq("validation_status", "valid").not("encrypted_credentials", "is", null);
      if (error) throw error;
      let completed = 0;
      for (const account of data ?? []) {
        try {
          await this.syncUser(account.user_id, decryptAffiliateCredentials(account.encrypted_credentials));
          completed += 1;
        } catch (syncError) {
          const code = syncError instanceof Error ? syncError.message.slice(0, 120) : "SHOPEE_ANALYTICS_SYNC_FAILED";
          await this.db.from("marketplace_analytics_sync_states").upsert({
            user_id: account.user_id,
            marketplace: "shopee",
            status: "FAILED",
            last_error_code: code,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id,marketplace" });
        }
      }
      return completed;
    } finally {
      this.running = false;
    }
  }

  async syncUser(userId: string, credentials: AffiliateProviderCredentials) {
    const now = new Date();
    await this.db.from("marketplace_analytics_sync_states").upsert({
      user_id: userId, marketplace: "shopee", status: "SYNCING",
      last_sync_at: now.toISOString(), last_error_code: null, updated_at: now.toISOString(),
    }, { onConflict: "user_id,marketplace" });
    const orders = await this.provider.listOrders(
      credentials,
      new Date(now.getTime() - 90 * 86_400_000),
      now,
    );
    const [{ data: conversions, error: conversionError }, { data: products, error: productError }] = await Promise.all([
      this.db.from("affiliate_conversions").select("id").eq("user_id", userId).eq("detected_platform", "shopee"),
      this.db.from("products").select("id,affiliate_conversion_id").eq("user_id", userId),
    ]);
    if (conversionError) throw conversionError;
    if (productError) throw productError;
    const conversionBySubId = new Map<string, string>();
    for (const conversion of conversions ?? []) {
      conversionBySubId.set(shopeeTrackingSubId(conversion.id), conversion.id);
      conversionBySubId.set(conversion.id.toLowerCase(), conversion.id);
    }
    const productByConversion = new Map((products ?? [])
      .filter((item) => item.affiliate_conversion_id)
      .map((item) => [item.affiliate_conversion_id, item.id]));

    for (const order of orders) {
      const tracking = order.trackingSubId?.toLowerCase() ?? "";
      const affiliateConversionId = [...conversionBySubId.entries()]
        .find(([subId]) => tracking.includes(subId))?.[1] ?? null;
      const { data: stored, error } = await this.db.from("marketplace_orders").upsert({
        user_id: userId,
        marketplace: "shopee",
        external_order_id: order.externalOrderId,
        external_conversion_id: order.externalConversionId || null,
        affiliate_conversion_id: affiliateConversionId,
        product_id: affiliateConversionId ? productByConversion.get(affiliateConversionId) ?? null : null,
        purchased_at: order.purchasedAt,
        attributed_click_at: order.attributedClickAt,
        status: order.status,
        external_status: order.externalStatus,
        currency: "BRL",
        sales_value: order.salesValue,
        estimated_commission: order.estimatedCommission,
        confirmed_commission: null,
        tracking_sub_id: order.trackingSubId,
        synced_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: "user_id,marketplace,external_order_id" }).select("id").single();
      if (error) throw error;
      if (order.items.length) {
        const { error: itemError } = await this.db.from("marketplace_order_items").upsert(
          order.items.map((item) => ({
            user_id: userId,
            order_id: stored.id,
            marketplace: "shopee",
            external_item_id: item.externalItemId,
            name: item.name,
            unit_price: item.unitPrice,
            quantity: item.quantity,
            estimated_commission: item.estimatedCommission,
            attribution_type: item.attributionType,
            updated_at: now.toISOString(),
          })),
          { onConflict: "order_id,external_item_id" },
        );
        if (itemError) throw itemError;
      }
    }
    const { error: stateError } = await this.db.from("marketplace_analytics_sync_states").upsert({
      user_id: userId,
      marketplace: "shopee",
      status: "SYNCED",
      last_sync_at: now.toISOString(),
      last_success_at: now.toISOString(),
      last_error_code: null,
      updated_at: now.toISOString(),
    }, { onConflict: "user_id,marketplace" });
    if (stateError) throw stateError;
    return orders.length;
  }
}

export class ShopeeAnalyticsScheduler {
  private timer: NodeJS.Timeout | null = null;
  constructor(
    private readonly service: ShopeeAnalyticsSyncService,
    private readonly intervalMs = 6 * 60 * 60_000,
  ) {}
  start() {
    if (this.timer) return;
    void this.service.syncAll().catch((error) =>
      console.error("[AfiliHub:Analytics:Shopee] Sync inicial falhou.", error));
    this.timer = setInterval(() => void this.service.syncAll().catch((error) =>
      console.error("[AfiliHub:Analytics:Shopee] Sync periódico falhou.", error)), this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
