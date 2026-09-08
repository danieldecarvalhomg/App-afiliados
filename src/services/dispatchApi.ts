import { supabase } from '../lib/supabase';
import type {
  Campaign,
  CampaignCollection,
  CreateCampaignInput,
  CreateCampaignCollectionInput,
  CreateQueueInput,
  QueueDelivery,
  QueueItem,
  QueuePreview,
  CreateDispatchQueueInput,
  DispatchWatermarkSettings,
} from '../domain/dispatch/types';
import { readJsonResponse } from './apiResponse';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

export interface QueueItemDetail extends QueueItem {
  deliveries: QueueDelivery[];
}
export interface DispatchQueueDetail extends Campaign { items: QueueItem[] }

export type DispatchEventType =
  | 'queue.item.updated'
  | 'dispatch.started'
  | 'dispatch.sent'
  | 'dispatch.retry'
  | 'dispatch.failed'
  | 'dispatch.uncertain'
  | 'campaign.progress.updated';

export interface DispatchRealtimeEvent {
  type: DispatchEventType | string;
  queueItemId?: string;
  campaignId?: string;
  deliveryId?: string;
  data?: Record<string, unknown>;
}

export type DispatchStreamState = 'connecting' | 'connected' | 'disconnected';

export class DispatchApiError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'DispatchApiError';
  }
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new DispatchApiError('UNAUTHORIZED', 'Faça login para gerenciar campanhas e filas.');
  return token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const payload = await readJsonResponse<ApiEnvelope<T>>(response);
  if (!response.ok || !payload?.success) {
    throw new DispatchApiError(
      payload?.error?.code ?? 'DISPATCH_API_ERROR',
      payload?.error?.message ?? 'Não foi possível concluir a operação de disparo.',
    );
  }
  return payload.data as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function subscribeDispatch(
  onEvent: (event: DispatchRealtimeEvent) => void,
  onState?: (state: DispatchStreamState) => void,
): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const connect = async (): Promise<void> => {
    if (stopped) return;
    onState?.('connecting');
    controller = new AbortController();
    try {
      const token = await accessToken();
      const response = await fetch('/api/dispatch/events', {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new Error('Canal de eventos indisponível.');
      attempt = 0;
      onState?.('connected');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) throw new Error('Canal de eventos encerrado.');
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const data = block.split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('');
          if (!data) continue;
          try {
            onEvent(JSON.parse(data) as DispatchRealtimeEvent);
          } catch {
            // Um evento malformado não derruba a assinatura inteira.
          }
        }
      }
    } catch (error) {
      if (stopped || (error instanceof DOMException && error.name === 'AbortError')) return;
      onState?.('disconnected');
      attempt += 1;
      const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempt - 1, 5)));
      reconnectTimer = setTimeout(() => void connect(), delay);
    }
  };

  void connect();
  return () => {
    stopped = true;
    controller?.abort();
    if (reconnectTimer) clearTimeout(reconnectTimer);
  };
}

export const dispatchApi = {
  listCampaigns: () => request<CampaignCollection[]>('/api/campaigns'),
  getCampaign: (id: string) => request<CampaignCollection>(`/api/campaigns/${encodeURIComponent(id)}`),
  createCampaign: (input: CreateCampaignCollectionInput) => request<CampaignCollection>('/api/campaigns', json('POST', input)),
  updateCampaign: (id: string, input: CreateCampaignCollectionInput) => request<CampaignCollection>(`/api/campaigns/${encodeURIComponent(id)}`, json('PATCH', input)),

  listQueues: () => request<Campaign[]>('/api/queues'),
  getQueue: (id: string) => request<DispatchQueueDetail>(`/api/queues/${encodeURIComponent(id)}`),
  createQueue: (input: CreateDispatchQueueInput) => request<Campaign>('/api/queues', json('POST', input)),
  updateQueue: (id: string, input: Partial<CreateDispatchQueueInput>) => request<Campaign>(`/api/queues/${encodeURIComponent(id)}`, json('PATCH', input)),
  pauseQueue: (id: string) => request<Campaign>(`/api/queues/${encodeURIComponent(id)}/pause`, json('POST')),
  resumeQueue: (id: string) => request<Campaign>(`/api/queues/${encodeURIComponent(id)}/resume`, json('POST')),
  archiveQueue: (id: string) => request<Campaign>(`/api/queues/${encodeURIComponent(id)}/archive`, json('POST')),
  reorderQueue: (id: string, itemIds: string[]) => request<QueueItem[]>(`/api/queues/${encodeURIComponent(id)}/reorder`, json('POST', { itemIds })),
  sendNext: (id: string) => request<QueueItem>(`/api/queues/${encodeURIComponent(id)}/send-next`, json('POST')),

  listQueue: (status?: string) => request<QueueItem[]>(`/api/queue${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  previewQueue: (input: CreateQueueInput) => request<QueuePreview>('/api/queue/preview', json('POST', input)),
  createQueueItem: (input: CreateQueueInput) => request<QueueItem>('/api/queue', json('POST', input)),
  getQueueItem: (id: string) => request<QueueItemDetail>(`/api/queue/${encodeURIComponent(id)}`),
  listDeliveries: (id: string) => request<QueueDelivery[]>(`/api/queue/${encodeURIComponent(id)}/deliveries`),
  pauseQueueItem: (id: string) => request<QueueItem>(`/api/queue/${encodeURIComponent(id)}/pause`, json('POST')),
  resumeQueueItem: (id: string) => request<QueueItem>(`/api/queue/${encodeURIComponent(id)}/resume`, json('POST')),
  cancelQueueItem: (id: string) => request<QueueItem>(`/api/queue/${encodeURIComponent(id)}/cancel`, json('POST')),
  retryQueueItem: (id: string, includeUncertain = false) => request<QueueItem>(`/api/queue/${encodeURIComponent(id)}/retry-failed`, json('POST', { includeUncertain })),
  retryDelivery: (id: string, includeUncertain = false) => request<QueueDelivery>(`/api/deliveries/${encodeURIComponent(id)}/retry`, json('POST', { includeUncertain })),
  subscribe: subscribeDispatch,
};

const QUEUE_INTENT_KEY = 'promofy.dispatch.queue-intent';
const QUEUE_ITEM_INTENT_KEY = 'promofy.dispatch.queue-item-intent';
const CAMPAIGN_INTENT_KEY = 'promofy.dispatch.campaign-intent';

export const dispatchNavigation = {
  openQueueComposer(generationId: string, presentation?: { captionMode?: 'message' | 'fixed' | 'custom'; caption?: string | null; watermark?: Partial<DispatchWatermarkSettings> }): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(QUEUE_INTENT_KEY, JSON.stringify({ generationId, ...presentation }));
  },
  consumeQueueComposer(): ({ generationId: string; captionMode?: 'message' | 'fixed' | 'custom'; caption?: string | null; watermark?: Partial<DispatchWatermarkSettings> }) | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(QUEUE_INTENT_KEY);
    window.sessionStorage.removeItem(QUEUE_INTENT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { generationId?: unknown; captionMode?: 'message' | 'fixed' | 'custom'; caption?: string | null; watermark?: Partial<DispatchWatermarkSettings> };
      return typeof parsed.generationId === 'string' && parsed.generationId
        ? { generationId: parsed.generationId, captionMode: parsed.captionMode, caption: parsed.caption, watermark: parsed.watermark }
        : null;
    } catch {
      return null;
    }
  },
  openQueueItem(queueItemId: string): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(QUEUE_ITEM_INTENT_KEY, queueItemId);
  },
  consumeQueueItem(): string | null {
    if (typeof window === 'undefined') return null;
    const queueItemId = window.sessionStorage.getItem(QUEUE_ITEM_INTENT_KEY);
    window.sessionStorage.removeItem(QUEUE_ITEM_INTENT_KEY);
    return queueItemId || null;
  },
  openCampaign(campaignId: string): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(CAMPAIGN_INTENT_KEY, JSON.stringify({ type: 'detail', campaignId }));
  },
  openCampaignComposer(): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(CAMPAIGN_INTENT_KEY, JSON.stringify({ type: 'create' }));
  },
  consumeCampaignIntent(): { type: 'create' } | { type: 'detail'; campaignId: string } | null {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(CAMPAIGN_INTENT_KEY);
    window.sessionStorage.removeItem(CAMPAIGN_INTENT_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { type?: unknown; campaignId?: unknown };
      if (parsed.type === 'create') return { type: 'create' };
      if (parsed.type === 'detail' && typeof parsed.campaignId === 'string' && parsed.campaignId) {
        return { type: 'detail', campaignId: parsed.campaignId };
      }
      return null;
    } catch {
      return null;
    }
  },
};
