import type { SupabaseClient } from '@supabase/supabase-js';
import type { MonitoringRepository } from '../../domain/monitoring/MonitoringRepository';
import type { ProductReviewRule, ProductReviewSettings } from '../../domain/monitoring/ReviewSettingsRepository';
import type {
  ActiveMonitorOrigin, CaptureFilters, CapturePage, CapturedMessage,
  CapturedMessageSource, GroupMonitor, PersistCaptureInput, PersistCaptureResult,
  PromotionAnalysis, WhatsAppMessageType,
} from '../../domain/monitoring/types';

type Row = Record<string, any>;

function first(value: any): any { return Array.isArray(value) ? value[0] : value; }
function mapMonitor(row: Row): GroupMonitor {
  const group = first(row.whatsapp_groups) ?? {};
  const connection = first(group.whatsapp_connections) ?? {};
  return {
    id: row.id, userId: row.user_id, groupId: row.group_id, enabled: Boolean(row.enabled),
    reviewRequired: Boolean(row.review_required), lastActivityAt: row.last_activity_at ?? null,
    createdAt: row.created_at, updatedAt: row.updated_at ?? row.created_at,
    groupName: group.name ?? 'Grupo', externalGroupId: group.external_group_id ?? '',
    connectionId: group.connection_id ?? '', connectionLabel: connection.label ?? 'WhatsApp',
  };
}

function mapSource(row: Row): CapturedMessageSource {
  const group = first(row.whatsapp_groups) ?? {};
  const connection = first(row.whatsapp_connections) ?? {};
  return {
    id: row.id, connectionId: row.connection_id, connectionLabel: connection.label ?? 'WhatsApp',
    groupId: row.group_id, groupName: group.name ?? 'Grupo', monitorId: row.monitor_id,
    observedAt: row.observed_at,
  };
}
function mapAnalysis(row: Row): PromotionAnalysis {
  const normalized = row.normalized_result ?? {};
  return {
    id: row.id, isPromotion: row.is_promotion ?? null, confidence: Number(row.confidence ?? 0),
    productName: row.product_name ?? null, price: row.price == null ? null : Number(row.price),
    originalPrice: row.original_price == null ? null : Number(row.original_price),
    discountPercent: row.discount_percent == null ? null : Number(row.discount_percent),
    currency: row.currency ?? null,
    coupon: row.coupon_code || row.coupon_description
      ? { code: row.coupon_code ?? null, description: row.coupon_description ?? null } : null,
    freeShipping: row.free_shipping ?? null, marketplace: row.marketplace ?? 'unknown',
    links: Array.isArray(row.source_links) ? row.source_links : [],
    primaryProductLink: typeof normalized.primaryProductLink === 'string' ? normalized.primaryProductLink : null,
    couponLinks: Array.isArray(normalized.couponLinks) ? normalized.couponLinks.filter((link: unknown): link is string => typeof link === 'string') : [],
    ...(normalized.reason ? { reason: normalized.reason } : {}),
    analysisVersion: 'promotion-v1', provider: row.provider, model: row.model,
    inputTokens: row.input_tokens ?? null, outputTokens: row.output_tokens ?? null,
    processingMs: row.processing_ms ?? null, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function encodeCursor(row: Row): string {
  return Buffer.from(JSON.stringify([row.received_at, row.id]), 'utf8').toString('base64url');
}
function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    return Array.isArray(parsed) && parsed.length === 2 ? [String(parsed[0]), String(parsed[1])] : null;
  } catch { return null; }
}

const MONITOR_SELECT = '*, whatsapp_groups!inner(id,user_id,connection_id,external_group_id,name,whatsapp_connections!inner(id,user_id,label))';

export class SupabaseMonitoringRepository implements MonitoringRepository {
  private readonly fallbackReviewSettings = new Map<string, ProductReviewSettings>();

  constructor(private readonly db: SupabaseClient) {}

  async getReviewRequired(userId: string): Promise<boolean> {
    return (await this.getReviewSettings(userId)).reviewRequired;
  }

  async getReviewSettings(userId: string): Promise<ProductReviewSettings> {
    const cached = this.fallbackReviewSettings.get(userId);
    if (cached) return cached;
    const { data, error } = await this.db.from('profiles').select('settings').eq('id', userId).maybeSingle();
    if (!error) {
      const settings = data?.settings && typeof data.settings === 'object' ? data.settings as Record<string, unknown> : {};
      const result = {
        reviewRequired: settings.monitoringReviewRequired !== false,
        autoApprovalRules: this.readRules(settings.monitoringAutoApprovalRules),
      };
      this.fallbackReviewSettings.set(userId, result);
      return result;
    }
    if (!this.isMissingSettingsColumn(error)) throw error;
    // Compatibilidade durante a aplicação da migration: espelha o modo nas
    // linhas de monitores existentes, mantendo regras e proteção por padrão.
    const fallback = await this.getReviewSettingsFromMonitors(userId);
    this.fallbackReviewSettings.set(userId, fallback);
    return fallback;
  }

  async setReviewRequired(userId: string, required: boolean): Promise<boolean> {
    const current = await this.getReviewSettings(userId);
    await this.setReviewSettings(userId, { ...current, reviewRequired: required });
    return true;
  }

  async setReviewSettings(userId: string, settings: ProductReviewSettings): Promise<ProductReviewSettings> {
    const { data: profile, error: readError } = await this.db.from('profiles').select('settings').eq('id', userId).maybeSingle();
    if (!readError) {
      const previous = profile?.settings && typeof profile.settings === 'object' ? profile.settings as Record<string, unknown> : {};
      const { error } = await this.db.from('profiles').upsert({
        id: userId,
        settings: {
          ...previous,
          monitoringReviewRequired: settings.reviewRequired,
          monitoringAutoApprovalRules: settings.autoApprovalRules,
        },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (error) throw error;
    } else if (!this.isMissingSettingsColumn(readError)) {
      throw readError;
    }
    const { data: monitors, error: monitorReadError } = await this.db.from('group_monitors').select('id,rules')
      .eq('user_id', userId).is('deleted_at', null);
    if (monitorReadError) throw monitorReadError;
    for (const monitor of monitors ?? []) {
      const previousRules = monitor.rules && typeof monitor.rules === 'object' ? monitor.rules as Record<string, unknown> : {};
      const { error: mirrorError } = await this.db.from('group_monitors').update({
        review_required: settings.reviewRequired,
        rules: { ...previousRules, productReviewAutoApprovalRules: settings.autoApprovalRules },
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId).eq('id', monitor.id);
      if (mirrorError) throw mirrorError;
    }
    const persisted = { reviewRequired: settings.reviewRequired, autoApprovalRules: settings.autoApprovalRules };
    this.fallbackReviewSettings.set(userId, persisted);
    return persisted;
  }

  private async getReviewSettingsFromMonitors(userId: string): Promise<ProductReviewSettings> {
    const { data, error } = await this.db.from('group_monitors').select('review_required,rules')
      .eq('user_id', userId).is('deleted_at', null).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    const rules = data?.rules && typeof data.rules === 'object' ? data.rules as Record<string, unknown> : {};
    return {
      reviewRequired: data?.review_required !== false,
      autoApprovalRules: this.readRules(rules.productReviewAutoApprovalRules),
    };
  }

  private readRules(raw: unknown): ProductReviewRule[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is ProductReviewRule => Boolean(
      item && typeof item === 'object' && typeof item.id === 'string'
      && typeof item.name === 'string' && typeof item.enabled === 'boolean'
      && ['all', 'any'].includes(String(item.conditionMode)) && Array.isArray(item.conditions),
    ));
  }

  private isMissingSettingsColumn(error: unknown): boolean {
    const value = error as { code?: string; message?: string } | null;
    return value?.code === '42703' || value?.message?.includes('profiles.settings') === true;
  }

  async listMonitors(userId: string): Promise<GroupMonitor[]> {
    const { data, error } = await this.db.from('group_monitors').select(MONITOR_SELECT)
      .eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapMonitor);
  }

  async getMonitor(userId: string, monitorId: string): Promise<GroupMonitor | null> {
    const { data, error } = await this.db.from('group_monitors').select(MONITOR_SELECT)
      .eq('user_id', userId).eq('id', monitorId).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    return data ? mapMonitor(data) : null;
  }

  async createMonitor(userId: string, groupId: string, reviewRequired: boolean): Promise<GroupMonitor> {
    const now = new Date().toISOString();
    const configured = this.fallbackReviewSettings.get(userId);
    const { data: previousMonitor, error: previousError } = await this.db.from('group_monitors').select('rules')
      .eq('user_id', userId).eq('group_id', groupId).maybeSingle();
    if (previousError) throw previousError;
    const previousRules = previousMonitor?.rules && typeof previousMonitor.rules === 'object'
      ? previousMonitor.rules as Record<string, unknown> : {};
    const { data, error } = await this.db.from('group_monitors').upsert({
      user_id: userId, group_id: groupId, enabled: true, status: 'active',
      review_required: reviewRequired, deleted_at: null, updated_at: now,
      rules: { ...previousRules, productReviewAutoApprovalRules: configured?.autoApprovalRules ?? [] },
      // Colunas legadas ainda são NOT NULL no schema base.
      name: 'WhatsApp', platform: 'WhatsApp', external_id_or_url: '',
    }, { onConflict: 'user_id,group_id' }).select('id').single();
    if (error) throw error;
    const monitor = await this.getMonitor(userId, data.id);
    if (!monitor) throw new Error('MONITOR_NOT_FOUND_AFTER_UPSERT');
    return monitor;
  }

  async updateMonitor(userId: string, monitorId: string, update: { enabled?: boolean; reviewRequired?: boolean }): Promise<GroupMonitor | null> {
    const payload: Row = { updated_at: new Date().toISOString() };
    if (update.enabled !== undefined) { payload.enabled = update.enabled; payload.status = update.enabled ? 'active' : 'paused'; }
    if (update.reviewRequired !== undefined) payload.review_required = update.reviewRequired;
    const { error } = await this.db.from('group_monitors').update(payload).eq('user_id', userId).eq('id', monitorId).is('deleted_at', null);
    if (error) throw error;
    return this.getMonitor(userId, monitorId);
  }

  async deleteMonitor(userId: string, monitorId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const { data, error } = await this.db.from('group_monitors').update({ enabled: false, status: 'paused', deleted_at: now, updated_at: now })
      .eq('user_id', userId).eq('id', monitorId).is('deleted_at', null).select('id');
    if (error) throw error;
    return (data?.length ?? 0) > 0;
  }

  async userOwnsGroup(userId: string, groupId: string): Promise<boolean> {
    const { data, error } = await this.db.from('whatsapp_groups').select('id')
      .eq('user_id', userId).eq('id', groupId).eq('sync_status', 'active').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async findActiveMonitor(userId: string, connectionId: string, externalGroupId: string): Promise<ActiveMonitorOrigin | null> {
    const { data, error } = await this.db.from('group_monitors').select(MONITOR_SELECT)
      .eq('user_id', userId).eq('enabled', true)
      .is('deleted_at', null)
      .eq('whatsapp_groups.connection_id', connectionId)
      .eq('whatsapp_groups.external_group_id', externalGroupId)
      .eq('whatsapp_groups.sync_status', 'active').maybeSingle();
    if (error) throw error;
    return data ? { monitor: mapMonitor(data) } : null;
  }

  async persistCapture(input: PersistCaptureInput): Promise<PersistCaptureResult> {
    const { message } = input;
    const { data, error } = await this.db.rpc('capture_whatsapp_message', {
      p_user_id: input.userId, p_external_message_id: message.externalMessageId || null,
      p_external_group_id: message.externalGroupId, p_sender_external_id: message.senderExternalId ?? null,
      p_message_type: message.type, p_raw_content: message.text ?? '', p_links: message.links,
      p_media_metadata: message.media ?? null, p_message_fingerprint: input.fingerprint,
      p_sent_at: message.sentAt, p_received_at: input.receivedAt, p_connection_id: message.connectionId,
      p_group_id: input.groupId, p_monitor_id: input.monitorId,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('CAPTURE_RPC_EMPTY_RESULT');
    return {
      capturedMessageId: row.captured_message_id,
      duplicate: Boolean(row.duplicate), sourceCreated: Boolean(row.source_created),
    };
  }

  async listCaptures(userId: string, filters: CaptureFilters): Promise<CapturePage> {
    let allowedIds: string[] | null = null;
    if (filters.connectionId || filters.groupId || filters.monitorId) {
      let sourceQuery = this.db.from('captured_message_sources').select('captured_message_id').eq('user_id', userId);
      if (filters.connectionId) sourceQuery = sourceQuery.eq('connection_id', filters.connectionId);
      if (filters.groupId) sourceQuery = sourceQuery.eq('group_id', filters.groupId);
      if (filters.monitorId) sourceQuery = sourceQuery.eq('monitor_id', filters.monitorId);
      const { data, error } = await sourceQuery;
      if (error) throw error;
      allowedIds = [...new Set((data ?? []).map((row) => row.captured_message_id))];
      if (allowedIds.length === 0) return { items: [], nextCursor: null };
    }

    const limit = filters.limit ?? 50;
    let query = this.db.from('captured_messages').select('*').eq('user_id', userId)
      .order('received_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    if (allowedIds) query = query.in('id', allowedIds);
    if (filters.messageType) query = query.eq('message_type', filters.messageType);
    const cursor = decodeCursor(filters.cursor);
    if (cursor) query = query.or(`received_at.lt.${cursor[0]},and(received_at.eq.${cursor[0]},id.lt.${cursor[1]})`);
    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);
    const ids = pageRows.map((row) => row.id);
    const sourcesByMessage = new Map<string, CapturedMessageSource[]>();
    const analysesByMessage = new Map<string, PromotionAnalysis>();
    if (ids.length > 0) {
      const { data: sources, error: sourceError } = await this.db.from('captured_message_sources')
        .select('*, whatsapp_connections!inner(label), whatsapp_groups!inner(name)')
        .eq('user_id', userId).in('captured_message_id', ids).order('observed_at', { ascending: true });
      if (sourceError) throw sourceError;
      for (const source of sources ?? []) {
        const list = sourcesByMessage.get(source.captured_message_id) ?? [];
        list.push(mapSource(source)); sourcesByMessage.set(source.captured_message_id, list);
      }
      const { data: analyses, error: analysisError } = await this.db.from('promotion_analyses')
        .select('*').eq('user_id', userId).in('captured_message_id', ids);
      if (analysisError) throw analysisError;
      for (const analysis of analyses ?? []) analysesByMessage.set(analysis.captured_message_id, mapAnalysis(analysis));
    }
    const items: CapturedMessage[] = pageRows.map((row) => ({
      id: row.id, externalMessageId: row.external_message_id ?? null,
      externalGroupId: row.external_group_id, senderExternalId: row.sender_external_id ?? null,
      messageType: (row.message_type ?? 'unknown') as WhatsAppMessageType,
      rawContent: row.raw_content ?? '', links: Array.isArray(row.links) ? row.links : [],
      mediaMetadata: row.media_metadata ?? null, messageFingerprint: row.message_fingerprint,
      sentAt: row.sent_at ?? row.received_at, receivedAt: row.received_at,
      processingStatus: row.processing_status,
      processingStartedAt: row.processing_started_at ?? null,
      attemptCount: Number(row.attempt_count ?? 0),
      lastErrorCode: row.last_error_code ?? null,
      lastErrorAt: row.last_error_at ?? null,
      reviewStatus: row.review_status ?? 'pending',
      reviewedAt: row.reviewed_at ?? null,
      analysis: analysesByMessage.get(row.id) ?? null,
      sources: sourcesByMessage.get(row.id) ?? [],
    }));
    return { items, nextCursor: rows.length > limit ? encodeCursor(pageRows[pageRows.length - 1]) : null };
  }

  async clearCaptureHistory(userId: string): Promise<number> {
    const { data, error } = await this.db.from('captured_messages')
      .delete().eq('user_id', userId).select('id');
    if (error) throw error;
    return data?.length ?? 0;
  }

  async reviewCapture(userId: string, captureId: string, decision: 'approved' | 'rejected'): Promise<boolean> {
    const { data: current, error: readError } = await this.db.from('captured_messages')
      .select('id,processing_status,review_status').eq('user_id', userId).eq('id', captureId).maybeSingle();
    if (readError) throw readError;
    if (!current || !['promotion_detected','needs_review'].includes(current.processing_status)) return false;
    if (current.review_status === decision) return true;
    if (current.review_status !== 'pending') return false;
    const { data, error } = await this.db.from('captured_messages').update({
      review_status: decision, reviewed_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('id', captureId).eq('review_status', 'pending').select('id').maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async recordEvent(userId: string, eventType: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from('system_events').insert({ user_id: userId, event_type: eventType, payload });
    if (error) throw error;
  }
  async recordLog(userId: string, message: string, level: 'info' | 'warning' | 'error' | 'success' = 'info'): Promise<void> {
    const { error } = await this.db.from('system_logs').insert({ user_id: userId, module: 'Monitoramento', level, message });
    if (error) throw error;
  }
}
