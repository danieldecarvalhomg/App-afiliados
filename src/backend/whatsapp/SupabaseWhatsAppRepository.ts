import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppGroup,
  WhatsAppProviderGroup,
} from "../../domain/whatsapp/types";
import type { ConnectionUpdate, WhatsAppRepository } from "./repository";

type Row = Record<string, any>;

function mapConnection(row: Row, groupsCount = 0): WhatsAppConnection {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    phone: row.phone ?? null,
    displayName: row.display_name ?? null,
    status: row.status as WhatsAppConnectionStatus,
    connectedAt: row.connected_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    groupsCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGroup(row: Row): WhatsAppGroup {
  const connection = Array.isArray(row.whatsapp_connections)
    ? row.whatsapp_connections[0]
    : row.whatsapp_connections;
  return {
    id: row.id,
    userId: row.user_id,
    connectionId: row.connection_id,
    externalGroupId: row.external_group_id,
    name: row.name,
    participantsCount: Number(row.participants_count ?? 0),
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at ?? null,
    connectionLabel: connection?.label,
  };
}

export class SupabaseWhatsAppRepository implements WhatsAppRepository {
  constructor(private readonly db: SupabaseClient) {}

  async countConnections(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("whatsapp_connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (error) throw error;
    return count ?? 0;
  }

  async createConnection(
    userId: string,
    label: string,
  ): Promise<WhatsAppConnection> {
    // A função SQL usa advisory lock: duas chamadas simultâneas não conseguem criar a 6ª conexão.
    const { data, error } = await this.db.rpc("create_whatsapp_connection", {
      p_user_id: userId,
      p_label: label,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return mapConnection(row);
  }

  async listConnections(userId: string): Promise<WhatsAppConnection[]> {
    const { data, error } = await this.db
      .from("whatsapp_connections")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const rows = data ?? [];
    const ids = rows.map((row) => row.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const { data: groupRows, error: groupError } = await this.db
        .from("whatsapp_groups")
        .select("connection_id")
        .eq("sync_status", "active")
        .in("connection_id", ids);
      if (groupError) throw groupError;
      for (const group of groupRows ?? []) {
        counts.set(
          group.connection_id,
          (counts.get(group.connection_id) ?? 0) + 1,
        );
      }
    }
    return rows.map((row) => mapConnection(row, counts.get(row.id) ?? 0));
  }

  async getConnection(id: string): Promise<WhatsAppConnection | null> {
    const { data, error } = await this.db
      .from("whatsapp_connections")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await this.db
      .from("whatsapp_groups")
      .select("id", { count: "exact", head: true })
      .eq("connection_id", id)
      .eq("sync_status", "active");
    return mapConnection(data, count ?? 0);
  }

  async updateConnection(id: string, update: ConnectionUpdate): Promise<void> {
    const payload: Row = { updated_at: new Date().toISOString() };
    if (update.status !== undefined) payload.status = update.status;
    if (update.phone !== undefined) payload.phone = update.phone;
    if (update.displayName !== undefined)
      payload.display_name = update.displayName;
    if (update.connectedAt !== undefined)
      payload.connected_at = update.connectedAt;
    if (update.lastSeenAt !== undefined)
      payload.last_seen_at = update.lastSeenAt;
    const { error } = await this.db
      .from("whatsapp_connections")
      .update(payload)
      .eq("id", id);
    if (error) throw error;
  }

  async deleteConnection(id: string): Promise<void> {
    const { error } = await this.db
      .from("whatsapp_connections")
      .delete()
      .eq("id", id);
    if (error) throw error;
  }

  async listRestorableConnections(): Promise<WhatsAppConnection[]> {
    const { data, error } = await this.db
      .from("whatsapp_connections")
      .select("*")
      .in("status", ["connected", "connecting", "reconnecting", "qr_required"]);
    if (error) throw error;
    return (data ?? []).map((row) => mapConnection(row));
  }

  async getEncryptedSession(connectionId: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("whatsapp_auth_sessions")
      .select("encrypted_state")
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (error) throw error;
    return data?.encrypted_state ?? null;
  }

  async saveEncryptedSession(
    connectionId: string,
    encryptedState: string,
  ): Promise<void> {
    const { error } = await this.db.from("whatsapp_auth_sessions").upsert(
      {
        connection_id: connectionId,
        encrypted_state: encryptedState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "connection_id" },
    );
    if (error) throw error;
  }

  async deleteSession(connectionId: string): Promise<void> {
    const { error } = await this.db
      .from("whatsapp_auth_sessions")
      .delete()
      .eq("connection_id", connectionId);
    if (error) throw error;
  }

  async listGroups(
    userId: string,
    connectionId?: string,
  ): Promise<WhatsAppGroup[]> {
    let query = this.db
      .from("whatsapp_groups")
      .select("*, whatsapp_connections!inner(label, user_id)")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (connectionId) query = query.eq("connection_id", connectionId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapGroup);
  }

  async syncGroups(
    userId: string,
    connectionId: string,
    groups: WhatsAppProviderGroup[],
  ): Promise<WhatsAppGroup[]> {
    const now = new Date().toISOString();
    const { error: markError } = await this.db
      .from("whatsapp_groups")
      .update({ sync_status: "unavailable", updated_at: now })
      .eq("user_id", userId)
      .eq("connection_id", connectionId);
    if (markError) throw markError;

    if (groups.length > 0) {
      const rows = groups.map((group) => ({
        user_id: userId,
        connection_id: connectionId,
        external_group_id: group.externalGroupId,
        name: group.name,
        participants_count: group.participantsCount,
        sync_status: "active",
        last_synced_at: now,
        updated_at: now,
      }));
      const { error } = await this.db
        .from("whatsapp_groups")
        .upsert(rows, { onConflict: "connection_id,external_group_id" });
      if (error) throw error;
    }
    return this.listGroups(userId, connectionId);
  }

  async recordEvent(
    userId: string,
    eventType: string,
    connectionId: string,
    data: Record<string, unknown> = {},
  ): Promise<void> {
    await this.db.from("system_events").insert({
      user_id: userId,
      event_type: eventType,
      payload: { connectionId, ...data },
    });
  }

  async recordDeliveryReceipt(input: {
    userId: string;
    connectionId: string;
    externalGroupId: string;
    externalMessageId: string;
    deliveredAt: string | null;
    readAt: string | null;
  }): Promise<boolean> {
    const { data, error } = await this.db.rpc(
      "record_whatsapp_delivery_receipt",
      {
        p_user_id: input.userId,
        p_connection_id: input.connectionId,
        p_external_group_id: input.externalGroupId,
        p_external_message_id: input.externalMessageId,
        p_delivered_at: input.deliveredAt,
        p_read_at: input.readAt,
      },
    );
    if (error) throw error;
    return Boolean(data);
  }

  async markReceiptTrackingStarted(
    userId: string,
    connectionId: string,
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc(
      "mark_whatsapp_receipt_tracking_started",
      { p_user_id: userId, p_connection_id: connectionId },
    );
    if (error) throw error;
    return Boolean(data);
  }

  async recordLog(
    userId: string,
    message: string,
    level: "info" | "warning" | "error" | "success" = "info",
  ): Promise<void> {
    await this.db.from("system_logs").insert({
      user_id: userId,
      module: "WhatsApp",
      level,
      message,
    });
  }
}
