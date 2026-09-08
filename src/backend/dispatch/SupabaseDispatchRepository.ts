import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  WhatsAppConnection,
  WhatsAppGroup,
} from "../../domain/whatsapp/types";
import type { DispatchRepository } from "../../domain/dispatch/DispatchRepository";
import type {
  Campaign,
  CampaignCollection,
  CampaignGroup,
  CampaignStatus,
  ClaimedDelivery,
  CreateCampaignInput,
  CreateCampaignCollectionInput,
  CtaDispatchSource,
  DeliveryContext,
  DispatchContentSnapshot,
  DispatchPresentationSettings,
  QueueDelivery,
  QueueItem,
  QueueProgress,
} from "../../domain/dispatch/types";

type Row = Record<string, any>;

const defaultPresentationSettings = (): DispatchPresentationSettings => ({
  defaultCaption: "",
  watermark: {
    enabled: false,
    text: "",
    position: "bottom-right",
    opacity: 0.72,
  },
});

function presentationSettings(value: unknown): DispatchPresentationSettings {
  const defaults = defaultPresentationSettings();
  const row = value && typeof value === "object" ? (value as Row) : {};
  const mark =
    row.watermark && typeof row.watermark === "object"
      ? (row.watermark as Row)
      : {};
  const positions = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ];
  return {
    defaultCaption:
      typeof row.defaultCaption === "string"
        ? row.defaultCaption
        : defaults.defaultCaption,
    watermark: {
      enabled:
        typeof mark.enabled === "boolean"
          ? mark.enabled
          : defaults.watermark.enabled,
      text: typeof mark.text === "string" ? mark.text : defaults.watermark.text,
      position: positions.includes(mark.position)
        ? mark.position
        : defaults.watermark.position,
      opacity:
        typeof mark.opacity === "number"
          ? mark.opacity
          : defaults.watermark.opacity,
    },
  } as DispatchPresentationSettings;
}

const zeroProgress = (): QueueProgress => ({
  total: 0,
  sent: 0,
  failed: 0,
  pending: 0,
  uncertain: 0,
});

function scalarId(data: unknown): string | null {
  const value = Array.isArray(data) ? data[0] : data;
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    typeof (value as Row).id === "string"
  )
    return (value as Row).id;
  return null;
}

function mapConnection(row: Row, groupsCount = 0): WhatsAppConnection {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    phone: row.phone ?? null,
    displayName: row.display_name ?? null,
    status: row.status,
    connectedAt: row.connected_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    groupsCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGroup(row: Row): WhatsAppGroup {
  return {
    id: row.id,
    userId: row.user_id,
    connectionId: row.connection_id,
    externalGroupId: row.external_group_id,
    name: row.name,
    participantsCount: Number(row.participants_count ?? 0),
    syncStatus: row.sync_status,
    lastSyncedAt: row.last_synced_at ?? null,
  };
}

function mapCampaignGroup(row: Row, group: Row): CampaignGroup {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    userId: row.user_id,
    whatsappGroupId: group.id,
    name: group.name,
    externalGroupId: group.external_group_id,
    participantsCount: Number(group.participants_count ?? 0),
    syncStatus: group.sync_status,
    createdAt: row.created_at,
  };
}

function normalizeSnapshot(
  value: unknown,
  fallback?: { sourceUrl?: string | null; productTitle?: string | null },
): DispatchContentSnapshot {
  const row = value && typeof value === "object" ? (value as Row) : {};
  const legacyText = typeof row.text === "string" ? row.text : "";
  return {
    text: legacyText,
    caption:
      typeof row.caption === "string"
        ? row.caption
        : row.primaryMediaAssetId
          ? legacyText
          : null,
    primaryMediaAssetId:
      typeof row.primaryMediaAssetId === "string"
        ? row.primaryMediaAssetId
        : null,
    hasMedia: Boolean(row.hasMedia ?? row.primaryMediaAssetId),
    watermark: presentationSettings({ watermark: row.watermark }).watermark,
    affiliateUrl:
      typeof row.affiliateUrl === "string" ? row.affiliateUrl : null,
    sourceUrl:
      typeof row.sourceUrl === "string"
        ? row.sourceUrl
        : (fallback?.sourceUrl ?? null),
    productId: typeof row.productId === "string" ? row.productId : null,
    productTitle:
      typeof row.productTitle === "string"
        ? row.productTitle
        : (fallback?.productTitle ?? null),
    ctaGenerationId:
      typeof row.ctaGenerationId === "string" ? row.ctaGenerationId : null,
    templateId: typeof row.templateId === "string" ? row.templateId : null,
    templateVersion: Number.isInteger(row.templateVersion)
      ? Number(row.templateVersion)
      : null,
    generatedAt:
      typeof row.generatedAt === "string"
        ? row.generatedAt
        : new Date(0).toISOString(),
  };
}

function progressFor(rows: Row[]): QueueProgress {
  const value = zeroProgress();
  value.total = rows.length;
  for (const row of rows) {
    if (row.status === "sent") value.sent++;
    else if (row.status === "failed") value.failed++;
    else if (row.status === "uncertain") value.uncertain++;
    else if (!["cancelled", "skipped"].includes(row.status)) value.pending++;
  }
  return value;
}

function mapQueue(
  row: Row,
  campaign: Campaign,
  progress: QueueProgress,
  productFallback?: { sourceUrl?: string | null; productTitle?: string | null },
): QueueItem {
  const destinationSnapshot = Array.isArray(row.destination_snapshot)
    ? row.destination_snapshot
    : campaign.groups.map((group) => ({
        whatsappGroupId: group.whatsappGroupId,
        name: group.name,
        externalGroupId: group.externalGroupId,
      }));
  const config =
    row.queue_config_snapshot && typeof row.queue_config_snapshot === "object"
      ? (row.queue_config_snapshot as Row)
      : {};
  return {
    id: row.id,
    userId: row.user_id,
    campaignId: campaign.id,
    campaignName: campaign.name,
    connectionId: campaign.connectionId,
    connectionLabel: campaign.connectionLabel,
    sourceType: row.source_type,
    sourceReferenceId: row.source_reference_id ?? null,
    contentSnapshot: normalizeSnapshot(row.content_snapshot, productFallback),
    destinationSnapshot: destinationSnapshot.map((value: Row) => ({
      whatsappGroupId: value.whatsappGroupId ?? value.whatsapp_group_id ?? "",
      name: value.name ?? "Grupo",
      externalGroupId: value.externalGroupId ?? value.external_group_id ?? "",
    })),
    queueConfigSnapshot: {
      mode: config.mode ?? campaign.mode,
      intervalBetweenItemsSeconds: Number(
        config.intervalBetweenItemsSeconds ??
          config.interval_between_items_seconds ??
          campaign.intervalBetweenItemsSeconds,
      ),
      timezone: config.timezone ?? campaign.timezone,
      allowedStartTime: String(
        config.allowedStartTime ??
          config.allowed_start_time ??
          campaign.allowedStartTime,
      ).slice(0, 5),
      allowedEndTime: String(
        config.allowedEndTime ??
          config.allowed_end_time ??
          campaign.allowedEndTime,
      ).slice(0, 5),
      allowedDays:
        config.allowedDays ?? config.allowed_days ?? campaign.allowedDays,
      fixedSlots:
        config.fixedSlots ?? config.fixed_slots ?? campaign.fixedSlots,
    },
    position: Number(row.position ?? 0),
    scheduledAt: row.scheduled_at,
    nextExecutionAt: row.next_execution_at ?? row.scheduled_at ?? null,
    manualRequestedAt: row.manual_requested_at ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDelivery(row: Row, group?: Row): QueueDelivery {
  return {
    id: row.id,
    userId: row.user_id,
    queueItemId: row.queue_item_id,
    campaignId: row.campaign_id,
    connectionId: row.connection_id,
    whatsappGroupId: row.whatsapp_group_id,
    groupName: group?.name ?? "Grupo indisponível",
    externalGroupId: group?.external_group_id ?? "",
    status: row.status,
    scheduledAt: row.scheduled_at,
    nextAttemptAt: row.next_attempt_at ?? null,
    attemptCount: Number(row.attempt_count ?? 0),
    lastErrorCode: row.last_error_code ?? null,
    lastErrorAt: row.last_error_at ?? null,
    claimedAt: row.claimed_at ?? null,
    claimedBy: row.claimed_by ?? null,
    sendingStartedAt: row.sending_started_at ?? null,
    sentAt: row.sent_at ?? null,
    externalMessageId: row.external_message_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function lastHttpUrl(text: string): string | null {
  const matches = text.match(/https?:\/\/[^\s<>]+/gi) ?? [];
  const raw = matches.at(-1)?.replace(/[),.;!?\]}]+$/g, "");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export class SupabaseDispatchRepository implements DispatchRepository {
  constructor(private readonly db: SupabaseClient) {}

  private async campaignCollectionRows(
    userId: string,
    ids?: string[],
  ): Promise<CampaignCollection[]> {
    let query = this.db
      .from("campaign_collections")
      .select("*")
      .eq("user_id", userId);
    if (ids) {
      if (!ids.length) return [];
      query = query.in("id", ids);
    }
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];

    const collectionIds = rows.map((row) => row.id);
    const connectionIds = [...new Set(rows.map((row) => row.connection_id))];
    const [{ data: destinations, error: destinationError }, { data: connections, error: connectionError }] = await Promise.all([
      this.db
        .from("campaign_collection_destinations")
        .select("*")
        .in("collection_id", collectionIds)
        .order("created_at"),
      this.db
        .from("whatsapp_connections")
        .select("id,label")
        .eq("user_id", userId)
        .in("id", connectionIds),
    ]);
    if (destinationError) throw destinationError;
    if (connectionError) throw connectionError;
    const groupIds = [...new Set((destinations ?? []).map((row) => row.whatsapp_group_id))];
    const groupsResult = groupIds.length
      ? await this.db.from("whatsapp_groups").select("*").eq("user_id", userId).in("id", groupIds)
      : { data: [] as Row[], error: null };
    if (groupsResult.error) throw groupsResult.error;
    const groupById = new Map((groupsResult.data ?? []).map((row) => [row.id, row]));
    const connectionById = new Map((connections ?? []).map((row) => [row.id, row]));

    return rows.map((row): CampaignCollection => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      connectionId: row.connection_id,
      connectionLabel: connectionById.get(row.connection_id)?.label ?? "Conexão indisponível",
      groups: (destinations ?? [])
        .filter((item) => item.collection_id === row.id)
        .flatMap((item) => {
          const group = groupById.get(item.whatsapp_group_id);
          return group
            ? [mapCampaignGroup({ ...item, campaign_id: row.id }, group)]
            : [];
        }),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? row.created_at,
    }));
  }

  listCampaignCollections(userId: string) {
    return this.campaignCollectionRows(userId);
  }

  async getCampaignCollection(userId: string, id: string) {
    return (await this.campaignCollectionRows(userId, [id]))[0] ?? null;
  }

  async createCampaignCollection(userId: string, input: CreateCampaignCollectionInput) {
    const { data, error } = await this.db.rpc("create_campaign_collection", {
      p_user_id: userId,
      p_name: input.name,
      p_connection_id: input.connectionId,
      p_group_ids: input.groupIds,
    });
    if (error) throw error;
    const id = scalarId(data);
    const value = id ? await this.getCampaignCollection(userId, id) : null;
    if (!value) throw new Error("CAMPAIGN_CREATE_FAILED");
    return value;
  }

  async updateCampaignCollection(userId: string, id: string, input: CreateCampaignCollectionInput) {
    const { data, error } = await this.db.rpc("update_campaign_collection", {
      p_user_id: userId,
      p_collection_id: id,
      p_name: input.name,
      p_connection_id: input.connectionId,
      p_group_ids: input.groupIds,
    });
    if (error) throw error;
    return scalarId(data) ? this.getCampaignCollection(userId, id) : null;
  }

  private async campaignRows(
    userId: string,
    ids?: string[],
  ): Promise<Campaign[]> {
    let query = this.db
      .from("campaigns")
      .select("*")
      .eq("user_id", userId)
      .not("connection_id", "is", null);
    if (ids) {
      if (!ids.length) return [];
      query = query.in("id", ids);
    }
    const { data, error } = await query.order("created_at", {
      ascending: false,
    });
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];
    const campaignIds = rows.map((row) => row.id);
    const connectionIds = [...new Set(rows.map((row) => row.connection_id))];
    const [
      { data: destinations, error: destinationError },
      { data: connections, error: connectionError },
      queueResult,
    ] = await Promise.all([
      this.db
        .from("campaign_destinations")
        .select("*")
        .in("campaign_id", campaignIds)
        .not("whatsapp_group_id", "is", null)
        .order("created_at"),
      this.db
        .from("whatsapp_connections")
        .select("*")
        .eq("user_id", userId)
        .in("id", connectionIds),
      this.db
        .from("queue_items")
        .select(
          "id,campaign_id,status,position,next_execution_at,started_at,completed_at",
        )
        .eq("user_id", userId)
        .in("campaign_id", campaignIds),
    ]);
    if (destinationError) throw destinationError;
    if (connectionError) throw connectionError;
    if (queueResult.error) throw queueResult.error;
    const groupIds = [
      ...new Set((destinations ?? []).map((row) => row.whatsapp_group_id)),
    ];
    const groupsResult = groupIds.length
      ? await this.db
          .from("whatsapp_groups")
          .select("*")
          .eq("user_id", userId)
          .in("id", groupIds)
      : { data: [] as Row[], error: null };
    if (groupsResult.error) throw groupsResult.error;
    const groupById = new Map(
      (groupsResult.data ?? []).map((row) => [row.id, row]),
    );
    const connectionById = new Map(
      (connections ?? []).map((row) => [row.id, row]),
    );
    return rows.map((row): Campaign => {
      const connection = connectionById.get(row.connection_id);
      const queueItems = (queueResult.data ?? []).filter(
        (item) => item.campaign_id === row.id,
      );
      const activeItems = queueItems.filter(
        (item) =>
          !["completed", "partially_failed", "failed", "cancelled"].includes(
            item.status,
          ),
      );
      const current = activeItems.find((item) => item.started_at) ?? null;
      const next =
        [...activeItems]
          .filter((item) => item.next_execution_at)
          .sort((a, b) => Number(a.position) - Number(b.position))[0] ?? null;
      const interval = Number(
        row.interval_between_items_seconds ??
          row.default_interval_seconds ??
          30,
      );
      return {
        id: row.id,
        userId: row.user_id,
        name: row.name,
        connectionId: row.connection_id,
        connectionLabel: connection?.label ?? "Conexão indisponível",
        status: row.status,
        defaultIntervalSeconds: Number(row.default_interval_seconds ?? 30),
        intervalBetweenItemsSeconds: interval,
        timezone: row.timezone ?? "America/Sao_Paulo",
        mode: row.mode ?? "continuous",
        allowedStartTime: String(row.allowed_start_time ?? "00:00").slice(0, 5),
        allowedEndTime: String(row.allowed_end_time ?? "23:59").slice(0, 5),
        allowedDays: Array.isArray(row.allowed_days)
          ? row.allowed_days.map(Number)
          : [1, 2, 3, 4, 5, 6, 7],
        fixedSlots: Array.isArray(row.fixed_slots)
          ? row.fixed_slots.map((value: unknown) => String(value).slice(0, 5))
          : [],
        groups: (destinations ?? [])
          .filter((item) => item.campaign_id === row.id)
          .flatMap((item) => {
            const group = groupById.get(item.whatsapp_group_id);
            return group ? [mapCampaignGroup(item, group)] : [];
          }),
        pendingItems: activeItems.length,
        historyItems: queueItems.length - activeItems.length,
        currentItemId: current?.id ?? null,
        nextExecutionAt:
          current?.next_execution_at ?? next?.next_execution_at ?? null,
        lastItemCompletedAt: row.last_item_completed_at ?? null,
        lastDispatchedAt: row.last_dispatched_at ?? null,
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at,
      };
    });
  }

  listCampaigns(userId: string) {
    return this.campaignRows(userId);
  }

  async getCampaign(userId: string, id: string) {
    return (await this.campaignRows(userId, [id]))[0] ?? null;
  }

  async createCampaign(
    userId: string,
    input: CreateCampaignInput & {
      defaultIntervalSeconds: number;
      timezone: string;
    },
  ) {
    const { data, error } = await this.db.rpc("create_dispatch_queue", {
      p_user_id: userId,
      p_name: input.name,
      p_connection_id: input.connectionId,
      p_group_ids: input.groupIds,
      p_interval_seconds: input.defaultIntervalSeconds,
      p_timezone: input.timezone,
      p_mode: input.mode ?? "continuous",
      p_allowed_start_time: input.allowedStartTime ?? "00:00",
      p_allowed_end_time: input.allowedEndTime ?? "23:59",
      p_allowed_days: input.allowedDays ?? [1, 2, 3, 4, 5, 6, 7],
      p_fixed_slots: input.fixedSlots ?? [],
    });
    if (error) throw error;
    const id = scalarId(data);
    const value = id ? await this.getCampaign(userId, id) : null;
    if (!value) throw new Error("CAMPAIGN_CREATE_FAILED");
    return value;
  }

  async updateCampaign(
    userId: string,
    id: string,
    input: Partial<CreateCampaignInput>,
  ) {
    const current = await this.getCampaign(userId, id);
    if (!current) return null;
    const { data, error } = await this.db.rpc("update_dispatch_queue", {
      p_user_id: userId,
      p_campaign_id: id,
      p_name: input.name ?? current.name,
      p_connection_id: input.connectionId ?? current.connectionId,
      p_group_ids:
        input.groupIds ?? current.groups.map((group) => group.whatsappGroupId),
      p_interval_seconds:
        input.defaultIntervalSeconds ?? current.defaultIntervalSeconds,
      p_timezone: input.timezone ?? current.timezone,
      p_mode: input.mode ?? current.mode,
      p_allowed_start_time: input.allowedStartTime ?? current.allowedStartTime,
      p_allowed_end_time: input.allowedEndTime ?? current.allowedEndTime,
      p_allowed_days: input.allowedDays ?? current.allowedDays,
      p_fixed_slots: input.fixedSlots ?? current.fixedSlots,
    });
    if (error) throw error;
    return scalarId(data) ? this.getCampaign(userId, id) : null;
  }

  async setCampaignStatus(userId: string, id: string, status: CampaignStatus) {
    const { data, error } = await this.db.rpc("set_dispatch_campaign_status", {
      p_user_id: userId,
      p_campaign_id: id,
      p_status: status,
    });
    if (error) throw error;
    return scalarId(data) ? this.getCampaign(userId, id) : null;
  }

  cancelCampaign(userId: string, id: string) {
    return this.setCampaignStatus(userId, id, "cancelled");
  }

  async getConnection(userId: string, id: string) {
    const { data, error } = await this.db
      .from("whatsapp_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { count } = await this.db
      .from("whatsapp_groups")
      .select("id", { head: true, count: "exact" })
      .eq("user_id", userId)
      .eq("connection_id", id)
      .eq("sync_status", "active");
    return mapConnection(data, count ?? 0);
  }

  async getGroups(userId: string, connectionId: string, ids?: string[]) {
    let query = this.db
      .from("whatsapp_groups")
      .select("*")
      .eq("user_id", userId)
      .eq("connection_id", connectionId);
    if (ids) {
      if (!ids.length) return [];
      query = query.in("id", ids);
    }
    const { data, error } = await query.order("name");
    if (error) throw error;
    return (data ?? []).map(mapGroup);
  }

  async getCtaDispatchSource(
    userId: string,
    generationId: string,
  ): Promise<CtaDispatchSource | null> {
    const { data: generation, error } = await this.db
      .from("cta_history")
      .select(
        "id,user_id,product_id,template_id,final_text,publishable,generation_status,structure_snapshot,created_at",
      )
      .eq("id", generationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!generation) return null;
    const { data: product, error: productError } = await this.db
      .from("products")
      .select("id,title,source_url,raw_url,primary_media_asset_id")
      .eq("id", generation.product_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (productError) throw productError;
    if (!product) return null;
    let manuallySelectedMediaId: string | null = null;
    if (product.primary_media_asset_id) {
      const { data: media, error: mediaError } = await this.db
        .from("product_media_assets")
        .select("id,selection_status")
        .eq("id", product.primary_media_asset_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (mediaError) throw mediaError;
      if (media?.selection_status === "manual_selected")
        manuallySelectedMediaId = media.id;
    }
    let presentation = defaultPresentationSettings();
    if (generation.template_id) {
      const { data: sourceTemplate, error: templateError } = await this.db
        .from("cta_templates")
        .select("presentation_settings")
        .eq("id", generation.template_id)
        .eq("user_id", userId)
        .maybeSingle();
      const presentationMissing =
        templateError &&
        (templateError.code === "42703" ||
          templateError.code === "PGRST204" ||
          templateError.message?.includes("presentation_settings"));
      if (templateError && !presentationMissing) throw templateError;
      if (presentationMissing) {
        const { data: version, error: versionError } = await this.db
          .from("cta_template_versions")
          .select("template_snapshot")
          .eq("template_id", generation.template_id)
          .eq("user_id", userId)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (versionError) throw versionError;
        presentation = presentationSettings(
          version?.template_snapshot?.presentation,
        );
      } else
        presentation = presentationSettings(
          sourceTemplate?.presentation_settings,
        );
    }
    const snapshot =
      generation.structure_snapshot &&
      typeof generation.structure_snapshot === "object"
        ? (generation.structure_snapshot as Row)
        : {};
    const sourceVersion = Number(
      snapshot.sourceVersion ?? snapshot.templateVersion,
    );
    return {
      generationId: generation.id,
      productId: product.id,
      productTitle: product.title,
      finalText: generation.final_text,
      publishable:
        Boolean(generation.publishable) &&
        generation.generation_status === "valid",
      affiliateUrl: lastHttpUrl(generation.final_text),
      sourceUrl: product.source_url ?? product.raw_url ?? null,
      primaryMediaAssetId: manuallySelectedMediaId,
      templateId: generation.template_id ?? null,
      templateVersion:
        Number.isInteger(sourceVersion) && sourceVersion > 0
          ? sourceVersion
          : null,
      presentation,
      generatedAt: generation.created_at,
    };
  }

  async ownsMediaAsset(userId: string, assetId: string) {
    const { data, error } = await this.db
      .from("product_media_assets")
      .select("id")
      .eq("id", assetId)
      .eq("user_id", userId)
      .eq("analysis_status", "completed")
      .not("storage_path", "is", null)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  async enqueue(
    userId: string,
    input: {
      campaignId: string;
      whatsappGroupId: string | null;
      sourceType: string;
      sourceReferenceId: string | null;
      snapshot: DispatchContentSnapshot;
      scheduledAt: string;
      placement: "end" | "next";
      idempotencyKey: string;
    },
  ) {
    const procedure = input.whatsappGroupId
      ? "enqueue_dispatch_queue_item_for_group"
      : "enqueue_dispatch_queue_item";
    const parameters = {
      p_user_id: userId,
      p_campaign_id: input.campaignId,
      p_source_type: input.sourceType,
      p_source_reference_id: input.sourceReferenceId,
      p_snapshot: input.snapshot,
      p_scheduled_at: input.scheduledAt,
      p_idempotency_key: input.idempotencyKey,
      p_placement: input.placement,
      ...(input.whatsappGroupId
        ? { p_whatsapp_group_id: input.whatsappGroupId }
        : {}),
    };
    const { data, error } = await this.db.rpc(procedure, parameters);
    if (error) throw error;
    const id = scalarId(data);
    const value = id ? await this.getQueueItem(userId, id) : null;
    if (!value) throw new Error("QUEUE_CREATE_FAILED");
    return value;
  }

  private async hydrateQueue(
    userId: string,
    rows: Row[],
  ): Promise<QueueItem[]> {
    if (!rows.length) return [];
    const campaignIds = [
      ...new Set(rows.map((row) => row.campaign_id).filter(Boolean)),
    ];
    const itemIds = rows.map((row) => row.id);
    const productIds = [
      ...new Set(
        rows
          .map((row) => {
            const snapshot =
              row.content_snapshot && typeof row.content_snapshot === "object"
                ? (row.content_snapshot as Row)
                : {};
            return row.product_id ?? snapshot.productId ?? null;
          })
          .filter(
            (value): value is string =>
              typeof value === "string" && value.length > 0,
          ),
      ),
    ];
    const [campaigns, deliveryResult] = await Promise.all([
      this.campaignRows(userId, campaignIds),
      this.db
        .from("queue_deliveries")
        .select("queue_item_id,status")
        .eq("user_id", userId)
        .in("queue_item_id", itemIds),
    ]);
    if (deliveryResult.error) throw deliveryResult.error;
    const productResult = productIds.length
      ? await this.db
          .from("products")
          .select("id,title,source_url,raw_url")
          .eq("user_id", userId)
          .in("id", productIds)
      : { data: [] as Row[], error: null };
    if (productResult.error) throw productResult.error;
    const productById = new Map(
      (productResult.data ?? []).map((product) => [product.id, product]),
    );
    const campaignById = new Map(
      campaigns.map((campaign) => [campaign.id, campaign]),
    );
    return rows.flatMap((row) => {
      const campaign = campaignById.get(row.campaign_id);
      if (!campaign) return [];
      const snapshot =
        row.content_snapshot && typeof row.content_snapshot === "object"
          ? (row.content_snapshot as Row)
          : {};
      const product = productById.get(row.product_id ?? snapshot.productId);
      return [
        mapQueue(
          row,
          campaign,
          progressFor(
            (deliveryResult.data ?? []).filter(
              (delivery) => delivery.queue_item_id === row.id,
            ),
          ),
          product
            ? {
                sourceUrl: product.source_url ?? product.raw_url ?? null,
                productTitle: product.title ?? null,
              }
            : undefined,
        ),
      ];
    });
  }

  async listQueue(userId: string, status?: string, campaignId?: string) {
    let query = this.db
      .from("queue_items")
      .select("*")
      .eq("user_id", userId)
      .not("campaign_id", "is", null)
      .order("created_at", { ascending: false });
    if (status) query = query.eq("status", status);
    if (campaignId)
      query = query
        .eq("campaign_id", campaignId)
        .order("position", { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return this.hydrateQueue(userId, data ?? []);
  }

  async getQueueItem(userId: string, id: string) {
    const { data, error } = await this.db
      .from("queue_items")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .not("campaign_id", "is", null)
      .maybeSingle();
    if (error) throw error;
    return data ? ((await this.hydrateQueue(userId, [data]))[0] ?? null) : null;
  }

  async listDeliveries(userId: string, itemId: string) {
    const { data, error } = await this.db
      .from("queue_deliveries")
      .select("*")
      .eq("user_id", userId)
      .eq("queue_item_id", itemId)
      .order("created_at");
    if (error) throw error;
    const rows = data ?? [];
    if (!rows.length) return [];
    const groupIds = [...new Set(rows.map((row) => row.whatsapp_group_id))];
    const { data: groups, error: groupError } = await this.db
      .from("whatsapp_groups")
      .select("*")
      .eq("user_id", userId)
      .in("id", groupIds);
    if (groupError) throw groupError;
    const byId = new Map((groups ?? []).map((row) => [row.id, row]));
    return rows.map((row) => mapDelivery(row, byId.get(row.whatsapp_group_id)));
  }

  private async queueAction(
    userId: string,
    id: string,
    rpc: string,
    args: Row,
  ) {
    const { data, error } = await this.db.rpc(rpc, {
      p_user_id: userId,
      p_queue_item_id: id,
      ...args,
    });
    if (error) throw error;
    return scalarId(data) ? this.getQueueItem(userId, id) : null;
  }

  setQueuePaused(userId: string, id: string, paused: boolean) {
    return this.queueAction(userId, id, "set_dispatch_queue_paused", {
      p_paused: paused,
    });
  }

  cancelQueueItem(userId: string, id: string) {
    return this.queueAction(userId, id, "cancel_dispatch_queue_item", {});
  }

  retryQueueItem(userId: string, id: string, includeUncertain: boolean) {
    return this.queueAction(userId, id, "retry_dispatch_queue_item", {
      p_include_uncertain: includeUncertain,
    });
  }

  async reorderQueueItems(
    userId: string,
    campaignId: string,
    itemIds: string[],
  ) {
    const { error } = await this.db.rpc("reorder_dispatch_queue_items", {
      p_user_id: userId,
      p_campaign_id: campaignId,
      p_item_ids: itemIds,
    });
    if (error) throw error;
    return this.listQueue(userId, undefined, campaignId);
  }

  async requestQueueNext(userId: string, campaignId: string) {
    const { data, error } = await this.db.rpc("request_dispatch_queue_next", {
      p_user_id: userId,
      p_campaign_id: campaignId,
    });
    if (error) throw error;
    const id = scalarId(data);
    return id ? this.getQueueItem(userId, id) : null;
  }

  async retryDelivery(
    userId: string,
    deliveryId: string,
    includeUncertain: boolean,
  ) {
    const { data, error } = await this.db.rpc("retry_dispatch_delivery", {
      p_user_id: userId,
      p_delivery_id: deliveryId,
      p_include_uncertain: includeUncertain,
    });
    if (error) throw error;
    const id = scalarId(data);
    if (!id) return null;
    const { data: row, error: loadError } = await this.db
      .from("queue_deliveries")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (loadError) throw loadError;
    if (!row) return null;
    const groups = await this.getGroups(userId, row.connection_id, [
      row.whatsapp_group_id,
    ]);
    return mapDelivery(
      row,
      groups[0]
        ? {
            id: groups[0].id,
            name: groups[0].name,
            external_group_id: groups[0].externalGroupId,
          }
        : undefined,
    );
  }

  async claimNext(
    workerId: string,
    staleBefore: string,
  ): Promise<ClaimedDelivery | null> {
    const { data, error } = await this.db.rpc("claim_next_queue_delivery", {
      p_worker_id: workerId,
      p_stale_before: staleBefore,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const { data: group, error: groupError } = await this.db
      .from("whatsapp_groups")
      .select("*")
      .eq("id", row.whatsapp_group_id)
      .eq("user_id", row.user_id)
      .maybeSingle();
    if (groupError) throw groupError;
    return mapDelivery(row, group ?? undefined);
  }

  async loadDeliveryContext(
    deliveryId: string,
  ): Promise<DeliveryContext | null> {
    const { data: row, error } = await this.db
      .from("queue_deliveries")
      .select("*")
      .eq("id", deliveryId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return null;
    const [item, campaign, deliveries, connection, groups] = await Promise.all([
      this.getQueueItem(row.user_id, row.queue_item_id),
      this.getCampaign(row.user_id, row.campaign_id),
      this.listDeliveries(row.user_id, row.queue_item_id),
      this.getConnection(row.user_id, row.connection_id),
      this.getGroups(row.user_id, row.connection_id, [row.whatsapp_group_id]),
    ]);
    const delivery = deliveries.find((value) => value.id === deliveryId);
    const group = groups[0];
    if (!item || !campaign || !delivery || !connection || !group) return null;
    return {
      delivery,
      item,
      campaign,
      connectionStatus: connection.status,
      groupSyncStatus: group.syncStatus,
    };
  }

  async markSending(deliveryId: string, workerId: string) {
    const { data, error } = await this.db.rpc("mark_dispatch_sending", {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
    });
    if (error) throw error;
    return Boolean(Array.isArray(data) ? data[0] : data);
  }

  async markSent(
    deliveryId: string,
    workerId: string,
    externalMessageId: string,
  ) {
    const { error } = await this.db.rpc("mark_dispatch_sent", {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
      p_external_message_id: externalMessageId,
    });
    if (error) throw error;
  }

  private async release(
    deliveryId: string,
    workerId: string,
    status: "retry_wait" | "failed" | "uncertain",
    errorCode: string,
    nextAttemptAt: string | null,
  ) {
    const { error } = await this.db.rpc("release_dispatch_delivery", {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
      p_status: status,
      p_error_code: errorCode,
      p_next_attempt_at: nextAttemptAt,
    });
    if (error) throw error;
  }

  markRetry(
    deliveryId: string,
    workerId: string,
    errorCode: string,
    nextAttemptAt: string,
  ) {
    return this.release(
      deliveryId,
      workerId,
      "retry_wait",
      errorCode,
      nextAttemptAt,
    );
  }
  markFailed(deliveryId: string, workerId: string, errorCode: string) {
    return this.release(deliveryId, workerId, "failed", errorCode, null);
  }
  markUncertain(deliveryId: string, workerId: string, errorCode: string) {
    return this.release(deliveryId, workerId, "uncertain", errorCode, null);
  }

  async deferDisconnected(deliveryId: string, workerId: string) {
    const { error } = await this.db.rpc("defer_disconnected_delivery", {
      p_delivery_id: deliveryId,
      p_worker_id: workerId,
    });
    if (error) throw error;
  }

  async recoverStale(staleBefore: string) {
    const { data, error } = await this.db.rpc("recover_stale_dispatch", {
      p_stale_before: staleBefore,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      recovered: Number(row?.recovered ?? 0),
      uncertain: Number(row?.uncertain ?? 0),
    };
  }

  async recordEvent(
    userId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const { error } = await this.db
      .from("system_events")
      .insert({ user_id: userId, event_type: eventType, payload });
    if (error) throw error;
  }
}
