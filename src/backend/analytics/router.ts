import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnalyticsFilters,
  AnalyticsGenerationMode,
  AnalyticsPeriodPreset,
} from "../../domain/analytics/types";
import { getAuthUser } from "../middleware/auth";
import {
  buildAnalyticsResponse,
  type AnalyticsDataSet,
  type AnalyticsRow,
} from "./aggregation";

const PAGE_SIZE = 1_000;
const MAX_RANGE_DAYS = 366;
const presets = new Set<AnalyticsPeriodPreset>(["today", "7d", "30d", "90d", "custom"]);
const generationModes = new Set<AnalyticsGenerationMode>(["monitor_passthrough", "cta_template", "manual"]);

const stringQuery = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

function validTimezone(value: unknown) {
  const candidate = stringQuery(value) ?? "America/Sao_Paulo";
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return "America/Sao_Paulo";
  }
}

function localDate(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Converte meia-noite civil do usuário para UTC sem assumir offset fixo. */
function localMidnightUtc(date: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  let guess = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const represented = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    const target = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess);
}

export function resolveAnalyticsPeriod(
  query: Request["query"],
  timezone: string,
  now = new Date(),
) {
  const requestedPreset = stringQuery(query.preset) as AnalyticsPeriodPreset | undefined;
  const preset = requestedPreset && presets.has(requestedPreset) ? requestedPreset : "30d";
  const today = localDate(now, timezone);
  let fromDate = today;
  let toDate = today;
  if (preset === "7d") fromDate = shiftDate(today, -6);
  if (preset === "30d") fromDate = shiftDate(today, -29);
  if (preset === "90d") fromDate = shiftDate(today, -89);
  if (preset === "custom") {
    const rawFrom = stringQuery(query.from);
    const rawTo = stringQuery(query.to);
    if (!rawFrom || !rawTo) throw new Error("ANALYTICS_CUSTOM_PERIOD_REQUIRED");
    const parsedFrom = new Date(rawFrom);
    const parsedTo = new Date(rawTo);
    if (Number.isNaN(parsedFrom.getTime()) || Number.isNaN(parsedTo.getTime())) throw new Error("ANALYTICS_PERIOD_INVALID");
    fromDate = /^\d{4}-\d{2}-\d{2}$/u.test(rawFrom) ? rawFrom : localDate(parsedFrom, timezone);
    toDate = /^\d{4}-\d{2}-\d{2}$/u.test(rawTo) ? rawTo : localDate(parsedTo, timezone);
  }
  const from = localMidnightUtc(fromDate, timezone);
  const to = new Date(localMidnightUtc(shiftDate(toDate, 1), timezone).getTime() - 1);
  const rangeDays = (to.getTime() - from.getTime()) / 86_400_000;
  if (from > to || rangeDays > MAX_RANGE_DAYS) throw new Error("ANALYTICS_PERIOD_INVALID");
  return { preset, from: from.toISOString(), to: to.toISOString(), timezone };
}

async function fetchOwnedRows(
  admin: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  configure?: (query: any) => any,
): Promise<AnalyticsRow[]> {
  const result: AnalyticsRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query: any = admin.from(table).select(columns).eq("user_id", userId);
    if (configure) query = configure(query);
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    result.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return result;
}

async function optionalRows(
  label: string,
  query: Promise<AnalyticsRow[]>,
  userId: string,
) {
  try {
    return await query;
  } catch (error) {
    console.error("[AfiliHub:Analytics] Fonte isolada indisponível.", {
      source: label,
      userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    return [];
  }
}

async function rowsWithColumnFallback(
  admin: SupabaseClient,
  table: string,
  columns: string,
  fallbackColumns: string,
  userId: string,
  configure?: (query: any) => any,
  fallbackConfigure?: (query: any) => any,
) {
  try {
    return await fetchOwnedRows(admin, table, columns, userId, configure);
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "42703" && code !== "PGRST204") throw error;
    return fetchOwnedRows(admin, table, fallbackColumns, userId, fallbackConfigure ?? configure);
  }
}

function parseFilters(req: Request, preset: AnalyticsPeriodPreset): AnalyticsFilters {
  const generationMode = stringQuery(req.query.generationMode) as AnalyticsGenerationMode | undefined;
  return {
    preset,
    marketplace: stringQuery(req.query.marketplace),
    connectionId: stringQuery(req.query.connectionId),
    groupId: stringQuery(req.query.groupId),
    automationId: stringQuery(req.query.automationId),
    productId: stringQuery(req.query.productId),
    templateId: stringQuery(req.query.templateId),
    generationMode: generationMode && generationModes.has(generationMode) ? generationMode : undefined,
  };
}

export function createAnalyticsRouter(admin: SupabaseClient) {
  const router = Router();

  router.get("/overview", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
      });
    }

    try {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("timezone")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      const timezone = validTimezone(profile?.timezone);
      const period = resolveAnalyticsPeriod(req.query, timezone);
      const filters = parseFilters(req, period.preset);
      const from = period.from;
      const to = period.to;

      const [
        connections,
        groups,
        captures,
        captureSources,
        analyses,
        products,
        conversions,
        automationRules,
        automationExecutions,
        preparedSnapshots,
        queueItems,
        deliveries,
        templates,
        ctaHistory,
        discoveryRuns,
        orders,
        orderItems,
        marketplaceSyncStates,
      ] = await Promise.all([
        rowsWithColumnFallback(admin, "whatsapp_connections", "id,user_id,label,display_name,phone,status,receipt_tracking_started_at", "id,user_id,label,display_name,phone,status", user.id),
        fetchOwnedRows(admin, "whatsapp_groups", "id,user_id,connection_id,name,sync_status", user.id),
        fetchOwnedRows(admin, "captured_messages", "id,user_id,processing_status,review_status,received_at", user.id,
          (query) => query.gte("received_at", from).lte("received_at", to)),
        fetchOwnedRows(admin, "captured_message_sources", "id,user_id,captured_message_id,connection_id,group_id,monitor_id,observed_at", user.id,
          (query) => query.gte("observed_at", from).lte("observed_at", to)),
        fetchOwnedRows(admin, "promotion_analyses", "id,user_id,captured_message_id,is_promotion,marketplace,created_at", user.id),
        fetchOwnedRows(admin, "products", "id,user_id,title,marketplace,source_type,source_reference_id,affiliate_conversion_id,affiliate_status,created_at", user.id),
        optionalRows("affiliate_conversions", fetchOwnedRows(admin, "affiliate_conversions", "id,user_id,status,detected_platform,source_type,source_reference_id,created_at,converted_at", user.id,
          (query) => query.lte("created_at", to).or(`created_at.gte.${from},converted_at.gte.${from}`)), user.id),
        fetchOwnedRows(admin, "automation_rules", "id,user_id,name,status", user.id),
        fetchOwnedRows(admin, "automation_executions", "id,user_id,automation_id,event_type,source_type,source_reference_id,status,prepared_snapshot_id,queue_item_id,created_at,updated_at", user.id,
          (query) => query.lte("created_at", to).gte("created_at", from)),
        fetchOwnedRows(admin, "automation_prepared_snapshots", "id,user_id,execution_id,product_id,source_type,source_reference_id,template_id,template_version,cta_generation_id,prepared_at,superseded_at", user.id,
          (query) => query.lte("prepared_at", to).gte("prepared_at", from)),
        fetchOwnedRows(admin, "queue_items", "id,user_id,product_id,source_type,source_reference_id,content_snapshot,affiliate_url,created_at", user.id,
          (query) => query.lte("created_at", to)),
        rowsWithColumnFallback(admin, "queue_deliveries", "id,user_id,queue_item_id,connection_id,whatsapp_group_id,status,attempt_count,sent_at,delivered_at,read_at,last_error_at,created_at,updated_at", "id,user_id,queue_item_id,connection_id,whatsapp_group_id,status,attempt_count,sent_at,last_error_at,created_at,updated_at", user.id,
          (query) => query.lte("created_at", to).or(`created_at.gte.${from},sent_at.gte.${from},delivered_at.gte.${from},read_at.gte.${from},last_error_at.gte.${from}`),
          (query) => query.lte("created_at", to).or(`created_at.gte.${from},sent_at.gte.${from},last_error_at.gte.${from}`)),
        optionalRows("cta_templates", fetchOwnedRows(admin, "cta_templates", "id,user_id,name", user.id), user.id),
        optionalRows("cta_history", fetchOwnedRows(admin, "cta_history", "id,user_id,generation_mode,template_id,created_at", user.id,
          (query) => query.lte("created_at", to)), user.id),
        optionalRows("marketplace_sync", fetchOwnedRows(admin, "marketplace_discovery_runs", "id,user_id,marketplace,status,last_error_code,completed_at,updated_at", user.id), user.id),
        optionalRows("marketplace_orders", fetchOwnedRows(admin, "marketplace_orders", "id,user_id,marketplace,external_order_id,affiliate_conversion_id,product_id,prepared_message_id,queue_item_id,delivery_id,group_id,automation_id,template_id,template_version,cta_generation_id,purchased_at,attributed_click_at,status,external_status,currency,sales_value,estimated_commission,confirmed_commission,tracking_sub_id,synced_at,updated_at", user.id,
          (query) => query.gte("purchased_at", from).lte("purchased_at", to)), user.id),
        optionalRows("marketplace_order_items", fetchOwnedRows(admin, "marketplace_order_items", "id,user_id,order_id,marketplace,external_item_id,name,unit_price,quantity,estimated_commission,attribution_type", user.id), user.id),
        optionalRows("marketplace_analytics_sync_states", fetchOwnedRows(admin, "marketplace_analytics_sync_states", "user_id,marketplace,status,last_sync_at,last_success_at,last_error_code,updated_at", user.id), user.id),
      ]);

      const rows: AnalyticsDataSet = {
        connections,
        groups,
        captures,
        captureSources,
        analyses,
        products,
        conversions,
        automationRules,
        automationExecutions,
        preparedSnapshots,
        queueItems,
        deliveries,
        templates,
        ctaHistory,
        discoveryRuns,
        orders,
        orderItems,
        marketplaceSyncStates,
      };
      return res.json({
        success: true,
        data: buildAnalyticsResponse({ userId: user.id, timezone, period, filters, rows }),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (["ANALYTICS_CUSTOM_PERIOD_REQUIRED", "ANALYTICS_PERIOD_INVALID"].includes(code)) {
        return res.status(400).json({
          success: false,
          error: { code, message: "Período de Analytics inválido." },
        });
      }
      console.error("[AfiliHub:Analytics] Falha ao consultar dados.", {
        userId: user.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      return res.status(500).json({
        success: false,
        error: {
          code: "ANALYTICS_QUERY_FAILED",
          message: "Não foi possível carregar os dados reais de Analytics.",
        },
      });
    }
  });

  return router;
}
