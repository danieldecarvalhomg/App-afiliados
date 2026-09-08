import { supabase } from "../lib/supabase";
import type {
  WhatsAppConnection,
  WhatsAppGroup,
  WhatsAppRealtimeEvent,
} from "../domain/whatsapp/types";
import { readJsonResponse } from "./apiResponse";

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export class WhatsAppApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new WhatsAppApiError(
      "UNAUTHORIZED",
      "Faça login para gerenciar o WhatsApp.",
    );
  return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`/api/whatsapp${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const payload = await readJsonResponse<ApiResponse<T>>(response);
  if (!response.ok || !payload.success) {
    throw new WhatsAppApiError(
      payload.error?.code ?? "WHATSAPP_API_ERROR",
      payload.error?.message ?? "Falha ao acessar o WhatsApp.",
    );
  }
  return payload.data as T;
}

export const whatsappApi = {
  listConnections: () => request<WhatsAppConnection[]>("/connections"),
  createConnection: (label: string) =>
    request<WhatsAppConnection>("/connections", {
      method: "POST",
      body: JSON.stringify({ label }),
    }),
  getConnection: (connectionId: string) =>
    request<WhatsAppConnection>(`/connections/${connectionId}`),
  getQr: (connectionId: string) =>
    request<{ qr: string | null }>(`/connections/${connectionId}/qr`),
  removeConnection: (connectionId: string) =>
    request<void>(`/connections/${connectionId}`, { method: "DELETE" }),
  connect: (connectionId: string) =>
    request<void>(`/connections/${connectionId}/connect`, { method: "POST" }),
  disconnect: (connectionId: string) =>
    request<void>(`/connections/${connectionId}/disconnect`, {
      method: "POST",
    }),
  listGroups: () => request<WhatsAppGroup[]>("/groups"),
  listConnectionGroups: (connectionId: string) =>
    request<WhatsAppGroup[]>(`/connections/${connectionId}/groups`),
  syncGroups: (connectionId: string) =>
    request<WhatsAppGroup[]>(`/connections/${connectionId}/groups/sync`, {
      method: "POST",
    }),

  subscribe(
    onEvent: (event: WhatsAppRealtimeEvent) => void,
    onError?: (error: unknown) => void,
  ): () => void {
    const controller = new AbortController();
    void (async () => {
      let delay = 1_000;
      while (!controller.signal.aborted) {
        try {
          const token = await accessToken();
          const response = await fetch("/api/whatsapp/events", {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          if (!response.ok || !response.body)
            throw new Error("Canal de eventos indisponível.");
          delay = 1_000;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!controller.signal.aborted) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() ?? "";
            for (const block of blocks) {
              const data = block
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("");
              if (data) onEvent(JSON.parse(data) as WhatsAppRealtimeEvent);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) break;
          onError?.(error);
        }
        if (!controller.signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay = Math.min(delay * 2, 10_000);
        }
      }
    })();
    return () => controller.abort();
  },
};

const INTEGRATIONS_NAVIGATION_KEY = "promofy.integrations.navigation";

export type IntegrationsNavigationIntent =
  | { type: "create-whatsapp" }
  | { type: "whatsapp"; connectionId: string }
  | { type: "shopee" }
  | { type: "generic"; integrationId: string };

export const integrationsNavigation = {
  openWhatsAppComposer(): void {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      INTEGRATIONS_NAVIGATION_KEY,
      JSON.stringify({ type: "create-whatsapp" }),
    );
  },
  openWhatsApp(connectionId: string): void {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      INTEGRATIONS_NAVIGATION_KEY,
      JSON.stringify({ type: "whatsapp", connectionId }),
    );
  },
  openShopee(): void {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      INTEGRATIONS_NAVIGATION_KEY,
      JSON.stringify({ type: "shopee" }),
    );
  },
  openGeneric(integrationId: string): void {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(
      INTEGRATIONS_NAVIGATION_KEY,
      JSON.stringify({ type: "generic", integrationId }),
    );
  },
  consume(): IntegrationsNavigationIntent | null {
    if (typeof window === "undefined") return null;
    const raw = window.sessionStorage.getItem(INTEGRATIONS_NAVIGATION_KEY);
    window.sessionStorage.removeItem(INTEGRATIONS_NAVIGATION_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(
        raw,
      ) as Partial<IntegrationsNavigationIntent> & {
        connectionId?: unknown;
        integrationId?: unknown;
      };
      if (parsed.type === "create-whatsapp") return { type: "create-whatsapp" };
      if (
        parsed.type === "whatsapp" &&
        typeof parsed.connectionId === "string" &&
        parsed.connectionId
      ) {
        return { type: "whatsapp", connectionId: parsed.connectionId };
      }
      if (parsed.type === "shopee") return { type: "shopee" };
      if (
        parsed.type === "generic" &&
        typeof parsed.integrationId === "string" &&
        parsed.integrationId
      ) {
        return { type: "generic", integrationId: parsed.integrationId };
      }
      return null;
    } catch {
      return null;
    }
  },
};
