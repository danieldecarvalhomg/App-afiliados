import type { CaptureFilters, CapturePage, GroupMonitor } from '../domain/monitoring/types';
import type { OfferReviewResult } from '../domain/monitoring/OfferReviewService';
import type { ProductReviewSettings } from '../domain/monitoring/ReviewSettingsRepository';
import { supabase } from '../lib/supabase';
import { readJsonResponse } from './apiResponse';
import { notifyProductCatalogChanged } from './productCatalogEvents';

interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string }; }
export class MonitoringApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new MonitoringApiError('UNAUTHORIZED', 'Faça login para acessar o monitoramento.');
  return data.session.access_token;
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/monitoring${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}`, ...init.headers },
  });
  const payload = await readJsonResponse<ApiResponse<T>>(response);
  if (!response.ok || !payload.success) throw new MonitoringApiError(payload.error?.code ?? 'MONITORING_API_ERROR', payload.error?.message ?? 'Falha no monitoramento.');
  return payload.data as T;
}
export const monitoringApi = {
  getReviewSettings: () => request<ProductReviewSettings>('/review-settings'),
  updateReviewSettings: (settings: ProductReviewSettings) => request<ProductReviewSettings>('/review-settings', {
    method: 'PATCH', body: JSON.stringify(settings),
  }),
  listMonitors: () => request<GroupMonitor[]>('/monitors'),
  createMonitor: (groupId: string, reviewRequired: boolean) => request<GroupMonitor>('/monitors', {
    method: 'POST', body: JSON.stringify({ groupId, reviewRequired }),
  }),
  updateMonitor: (id: string, update: { enabled?: boolean; reviewRequired?: boolean }) => request<GroupMonitor>(`/monitors/${id}`, {
    method: 'PATCH', body: JSON.stringify(update),
  }),
  deleteMonitor: (id: string) => request<void>(`/monitors/${id}`, { method: 'DELETE' }),
  reprocessCapture: (id: string) => request<void>(`/captures/${id}/reprocess`, { method: 'POST' }),
  reviewCapture: async (id: string, decision: 'approved' | 'rejected') => {
    const result = await request<OfferReviewResult>(`/captures/${id}/review`, {
      method: 'POST', body: JSON.stringify({ decision }),
    });
    if (result.productId) notifyProductCatalogChanged();
    return result;
  },
  listCaptures: (filters: CaptureFilters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== undefined && value !== '') params.set(key, String(value));
    const query = params.size ? `?${params}` : '';
    return request<CapturePage>(`/captures${query}`);
  },
  clearCaptureHistory: () => request<{ deletedCount: number }>('/captures', { method: 'DELETE' }),
};
