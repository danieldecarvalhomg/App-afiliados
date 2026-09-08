import type { SupabaseClient } from '@supabase/supabase-js';

export type MercadoLivreRemoteStatus = 'NEEDS_LOGIN' | 'CONNECTING' | 'READY' | 'ERROR' | 'REVOKED';
export interface MercadoLivreRemoteSession {
  userId: string;
  contextId: string;
  status: MercadoLivreRemoteStatus;
  activeSessionId: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorCode: string | null;
}

const map = (row: Record<string, any>): MercadoLivreRemoteSession => ({
  userId: row.user_id,
  contextId: row.context_id,
  status: row.status,
  activeSessionId: row.active_session_id ?? null,
  lastCheckedAt: row.last_checked_at ?? null,
  lastSuccessAt: row.last_success_at ?? null,
  lastErrorCode: row.last_error_code ?? null,
});

export class MercadoLivreRemoteSessionRepository {
  constructor(private readonly db: SupabaseClient) {}

  async get(userId: string): Promise<MercadoLivreRemoteSession | null> {
    const { data, error } = await this.db.from('mercado_livre_remote_sessions').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return data ? map(data) : null;
  }

  async create(userId: string, contextId: string): Promise<MercadoLivreRemoteSession> {
    const { data, error } = await this.db.from('mercado_livre_remote_sessions').upsert({
      user_id: userId,
      context_id: contextId,
      status: 'NEEDS_LOGIN',
      active_session_id: null,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select('*').single();
    if (error) throw error;
    return map(data);
  }

  async update(userId: string, patch: {
    status: MercadoLivreRemoteStatus;
    activeSessionId?: string | null;
    errorCode?: string | null;
    success?: boolean;
  }): Promise<MercadoLivreRemoteSession> {
    const now = new Date().toISOString();
    const values: Record<string, unknown> = {
      status: patch.status,
      last_checked_at: now,
      last_error_code: patch.errorCode ?? null,
      updated_at: now,
    };
    if ('activeSessionId' in patch) values.active_session_id = patch.activeSessionId ?? null;
    if (patch.success) values.last_success_at = now;
    const { data, error } = await this.db.from('mercado_livre_remote_sessions').update(values).eq('user_id', userId).select('*').single();
    if (error) throw error;
    return map(data);
  }

  async findCachedAffiliateLink(userId: string, itemKey: string, trackingLabel: string): Promise<string | null> {
    const now = new Date().toISOString();
    const { data, error } = await this.db
      .from('mercado_livre_affiliate_link_cache')
      .select('affiliate_url')
      .eq('user_id', userId)
      .eq('item_key', itemKey)
      .eq('tracking_label', trackingLabel)
      .gt('expires_at', now)
      .maybeSingle();
    if (error) {
      // Compatibilidade durante rollout: a conversão continua funcionando
      // mesmo antes de a migration do cache chegar a todos os ambientes.
      if ((error as { code?: string }).code === '42P01') return null;
      throw error;
    }
    if (!data?.affiliate_url) return null;
    void this.db.from('mercado_livre_affiliate_link_cache').update({ last_used_at: now })
      .eq('user_id', userId).eq('item_key', itemKey).eq('tracking_label', trackingLabel)
      .then(() => undefined, () => undefined);
    return String(data.affiliate_url);
  }

  async saveCachedAffiliateLink(input: {
    userId: string;
    itemKey: string;
    trackingLabel: string;
    sourceUrl: string;
    affiliateUrl: string;
    expiresAt: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.db.from('mercado_livre_affiliate_link_cache').upsert({
      user_id: input.userId,
      item_key: input.itemKey,
      tracking_label: input.trackingLabel,
      source_url: input.sourceUrl,
      affiliate_url: input.affiliateUrl,
      expires_at: input.expiresAt,
      last_used_at: now,
      updated_at: now,
    }, { onConflict: 'user_id,item_key,tracking_label' });
    if (error && (error as { code?: string }).code !== '42P01') throw error;
  }
}
