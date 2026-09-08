import { supabase } from "../lib/supabase";
import type {
  AnalyticsFilters,
  AnalyticsResponse,
} from "../domain/analytics/types";

export type { AnalyticsFilters, AnalyticsResponse } from "../domain/analytics/types";

export async function getAnalyticsOverview(
  filters: AnalyticsFilters = { preset: "30d" },
): Promise<AnalyticsResponse> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("UNAUTHORIZED");
  const params = new URLSearchParams({ preset: filters.preset });
  for (const [key, value] of Object.entries(filters)) {
    if (key !== "preset" && value) params.set(key, String(value));
  }
  const response = await fetch(`/api/analytics/overview?${params.toString()}`, {
    headers: { authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
  });
  const payload = await response.json() as {
    success: boolean;
    data?: AnalyticsResponse;
    error?: { message?: string };
  };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? "Falha ao carregar Analytics.");
  }
  return payload.data;
}
