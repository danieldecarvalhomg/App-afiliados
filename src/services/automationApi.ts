import { supabase } from "../lib/supabase";
import { readJsonResponse } from "./apiResponse";
import type {
  AutomationConfiguration,
  AutomationExecution,
  AutomationOptions,
  AutomationReview,
  AutomationRule,
  PreparedSnapshot,
} from "../domain/automation/types";
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}
export class AutomationApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new AutomationApiError(
      "UNAUTHORIZED",
      "Faça login para gerenciar automações.",
    );
  const response = await fetch(`/api/automations${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = await readJsonResponse<Envelope<T>>(response);
  if (!response.ok || !body.success)
    throw new AutomationApiError(
      body.error?.code ?? "AUTOMATION_API_ERROR",
      body.error?.message ?? "Não foi possível concluir a operação.",
    );
  return body.data as T;
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
export const automationApi = {
  list: () => request<AutomationRule[]>("/"),
  get: (id: string) => request<AutomationRule>(`/${id}`),
  options: () => request<AutomationOptions>("/options"),
  create: (input: AutomationConfiguration) =>
    request<AutomationRule>("/", json("POST", input)),
  update: (id: string, input: AutomationConfiguration) =>
    request<AutomationRule>(`/${id}`, json("PUT", input)),
  activate: (id: string, confirmedAutomatic: boolean) =>
    request<AutomationRule>(
      `/${id}/activate`,
      json("POST", { confirmedAutomatic }),
    ),
  pause: (id: string) => request<AutomationRule>(`/${id}/pause`, json("POST")),
  resume: (id: string) =>
    request<AutomationRule>(`/${id}/resume`, json("POST")),
  archive: (id: string) =>
    request<AutomationRule>(`/${id}/archive`, json("POST")),
  reorder: (ids: string[]) =>
    request<AutomationRule[]>("/reorder", json("POST", { ids })),
  dryRun: (id: string, input: { productId: string; fullPreview?: boolean }) =>
    request<any>(`/${id}/dry-run`, json("POST", input)),
  executions: (automationId?: string) =>
    request<AutomationExecution[]>(
      `/executions${automationId ? `?automationId=${encodeURIComponent(automationId)}` : ""}`,
    ),
  deleteExecution: (id: string) =>
    request<{ deleted: true }>(`/executions/${id}`, { method: "DELETE" }),
  reviews: () => request<AutomationReview[]>("/reviews"),
  approveReview: (id: string) =>
    request<{ queueItemId: string }>(`/reviews/${id}/approve`, json("POST")),
  rejectReview: (id: string, reason?: string) =>
    request<{ rejected: true }>(
      `/reviews/${id}/reject`,
      json("POST", { reason }),
    ),
  editReview: (id: string, text: string) =>
    request<PreparedSnapshot>(`/reviews/${id}`, json("PATCH", { text })),
  subscribe(onEvent: () => void, onError?: (error: unknown) => void) {
    const controller = new AbortController();
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) throw new Error("UNAUTHORIZED");
        const response = await fetch("/api/automations/events", {
          headers: { authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!response.ok || !response.body)
          throw new Error("AUTOMATION_REALTIME_UNAVAILABLE");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks)
            if (block.split("\n").some((line) => line.startsWith("data:")))
              onEvent();
        }
      } catch (error) {
        if (!controller.signal.aborted) onError?.(error);
      }
    })();
    return () => controller.abort();
  },
};
