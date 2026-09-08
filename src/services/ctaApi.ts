import type {
  CtaAssistantResult,
  CtaConversationMessage,
  CtaCopyLibraryItem,
  CtaExample,
  CtaFacts,
  CtaGeneration,
  CtaGenerationRequest,
  CtaMemoryView,
  CtaProfile,
  CtaRule,
  CtaStructureOperation,
  CtaTemplate,
  CtaTemplatePreview,
  CtaTrainingReview,
  MessageTemplateDocument,
} from "../domain/cta/types";
import { supabase } from "../lib/supabase";
import { readJsonResponse } from "./apiResponse";
interface Payload<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
export class CtaApiError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export interface CtaProductAiGenerationUsage {
  used: number;
  limit: number | null;
  usagePeriodStart: string;
}
async function request<T>(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token)
    throw new CtaApiError(
      "UNAUTHORIZED",
      "Faça login para usar o CTA Intelligence.",
    );
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const payload = await readJsonResponse<Payload<T>>(response);
  if (!response.ok || !payload.success)
    throw new CtaApiError(
      payload.error?.code ?? "CTA_API_ERROR",
      payload.error?.message ?? "Falha no CTA Intelligence.",
    );
  return payload.data as T;
}
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
export const ctaApi = {
  profile: () => request<CtaProfile>("/api/cta/profile"),
  updateProfile: (patch: Partial<CtaProfile>) =>
    request<CtaProfile>("/api/cta/profile", json("PATCH", patch)),
  undoPreferences: () =>
    request<CtaProfile | null>("/api/cta/preferences/undo", json("POST")),
  rules: () => request<CtaRule[]>("/api/cta/rules"),
  addRule: (input: { ruleType: string; value: string }) =>
    request<CtaRule>("/api/cta/rules", json("POST", input)),
  deleteRule: (id: string) =>
    request<boolean>(`/api/cta/rules/${id}`, json("DELETE")),
  assistant: (message: string) =>
    request<CtaAssistantResult>(
      "/api/cta/assistant/message",
      json("POST", { message }),
    ),
  conversation: () =>
    request<CtaConversationMessage[]>("/api/cta/conversation"),
  history: () => request<CtaGeneration[]>("/api/cta/history"),
  resetMemory: () =>
    request<{ reset: boolean }>("/api/cta/memory", json("DELETE")),
  examples: () => request<CtaExample[]>("/api/cta/examples"),
  addExample: (input: {
    text: string;
    sentiment: "positive" | "negative" | "reference";
  }) => request<boolean>("/api/cta/examples", json("POST", input)),
  deleteExample: (id: string) =>
    request<boolean>(`/api/cta/examples/${id}`, json("DELETE")),
  templates: () => request<CtaTemplate[]>("/api/cta/templates"),
  template: (id: string) => request<CtaTemplate>(`/api/cta/templates/${id}`),
  createTemplate: (input: Partial<CtaTemplate> & { name: string }) =>
    request<CtaTemplate>("/api/cta/templates", json("POST", input)),
  updateTemplate: (id: string, patch: Partial<CtaTemplate>) =>
    request<CtaTemplate | null>(
      `/api/cta/templates/${id}`,
      json("PATCH", patch),
    ),
  deleteTemplate: (id: string) =>
    request<boolean>(`/api/cta/templates/${id}`, json("DELETE")),
  duplicateTemplate: (id: string) =>
    request<CtaTemplate | null>(
      `/api/cta/templates/${id}/duplicate`,
      json("POST"),
    ),
  setDefaultTemplate: (id: string) =>
    request<CtaTemplate | null>(
      `/api/cta/templates/${id}/set-default`,
      json("POST"),
    ),
  updateTemplateStructure: (id: string, operations: CtaStructureOperation[]) =>
    request<CtaTemplate | null>(
      `/api/cta/templates/${id}/structure`,
      json("PATCH", { operations }),
    ),
  previewTemplate: (
    id: string,
    input: {
      productId?: string;
      facts?: CtaFacts;
      instruction?: string;
      blocks?: CtaTemplate["blocks"];
      document?: MessageTemplateDocument;
      dsl?: string;
    },
  ) =>
    request<CtaTemplatePreview>(
      `/api/cta/templates/${id}/preview`,
      json("POST", input),
    ),
  parseTemplate: (dsl: string) =>
    request<{ document: MessageTemplateDocument; dsl: string }>(
      "/api/cta/templates/parse",
      json("POST", { dsl }),
    ),
  serializeTemplate: (document: MessageTemplateDocument) =>
    request<{ document: MessageTemplateDocument; dsl: string }>(
      "/api/cta/templates/serialize",
      json("POST", { document }),
    ),
  structuralPreview: (document: MessageTemplateDocument) =>
    request<{ text: string }>(
      "/api/cta/templates/structural-preview",
      json("POST", { document }),
    ),
  copy: () => request<CtaCopyLibraryItem[]>("/api/cta/copy"),
  createCopy: (
    input: Omit<
      CtaCopyLibraryItem,
      "id" | "userId" | "createdAt" | "updatedAt"
    >,
  ) => request<CtaCopyLibraryItem>("/api/cta/copy", json("POST", input)),
  updateCopy: (id: string, patch: Partial<CtaCopyLibraryItem>) =>
    request<CtaCopyLibraryItem | null>(
      `/api/cta/copy/${id}`,
      json("PATCH", patch),
    ),
  deleteCopy: (id: string) =>
    request<boolean>(`/api/cta/copy/${id}`, json("DELETE")),
  generate: (productId: string, input: CtaGenerationRequest) =>
    request<CtaGeneration[]>(
      `/api/cta/products/${productId}/generate`,
      json("POST", input),
    ),
  productAiGenerationUsage: (productId: string) =>
    request<CtaProductAiGenerationUsage | null>(
      `/api/cta/products/${productId}/ai-usage`,
    ),
  testCta: (productId: string, input: CtaGenerationRequest) =>
    request<Array<{ text: string; angle: string | null }>>(
      `/api/cta/products/${productId}/test-cta`,
      json("POST", input),
    ),
  regenerate: (productId: string, input: CtaGenerationRequest) =>
    request<CtaGeneration[]>(
      `/api/cta/products/${productId}/regenerate`,
      json("POST", input),
    ),
  regenerateCta: (generationId: string, instruction?: string) =>
    request<CtaGeneration>(
      `/api/cta/generations/${generationId}/regenerate-cta`,
      json("POST", { instruction }),
    ),
  originalMessage: (productId: string) =>
    request<CtaGeneration>(
      `/api/cta/products/${productId}/original-message`,
      json("POST"),
    ),
  edit: (id: string, finalText: string) =>
    request<CtaGeneration | null>(
      `/api/cta/generations/${id}`,
      json("PATCH", { finalText }),
    ),
  learnFromEdit: (id: string, ctaText: string) =>
    request<{ learned: boolean }>(
      `/api/cta/generations/${id}/learn-edit`,
      json("POST", { ctaText }),
    ),
  analyzeTraining: (source: string) =>
    request<CtaTrainingReview>("/api/cta/training/analyze", json("POST", { source })),
  applyTraining: (sourceId: string) =>
    request<{ applied: boolean; memoryVersion: number; items: number }>(
      `/api/cta/training/${sourceId}/apply`,
      json("POST"),
    ),
  learnedMemory: () => request<CtaMemoryView>("/api/cta/memory/learned"),
  deleteMemoryItem: (id: string) =>
    request<boolean>(`/api/cta/memory/items/${id}`, json("DELETE")),
};
