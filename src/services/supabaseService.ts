/**
 * AfiliHub — Supabase CRUD Service
 *
 * Source of truth para todas as entidades persistidas.
 * Cada operação inclui user_id obtido da sessão Supabase (não do frontend).
 * IDs gerados no frontend são UUIDs via crypto.randomUUID().
 */

import { supabase, getCurrentUserId } from "../lib/supabase";
import {
  Product,
  MarketplaceType,
  QueueConfig,
  QueueItem,
  Integration,
  CRMLead,
  CopyTemplate,
  SystemLog,
  MonitoredGroup,
  CapturedMessage,
  LandingPageItem,
  ChannelGroup,
  Campaign,
  AutomationRule,
  SubscriptionPlan,
  ProductCollection,
} from "../types";

export const supabaseService = {
  // ─── PROFILES ───────────────────────────────────────────────────────────────
  async fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) return null;
      return data;
    } catch {
      return null;
    }
  },

  async updateProfile(
    _userId: string,
    updates: {
      full_name?: string;
      avatar_url?: string | null;
      timezone?: string;
      locale?: string;
    },
  ) {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return false;
      const { error } = await supabase
        .from("profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", userId);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── APP STATE ──────────────────────────────────────────────────────────────
  async fetchGroups(): Promise<ChannelGroup[]> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from("whatsapp_groups")
        .select("*")
        .eq("user_id", userId)
        .order("name");
      if (error || !data) return [];
      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        platform: "WhatsApp",
        type: "Grupo",
        membersCount: Number(item.participants_count || 0),
        status: item.sync_status === "active" ? "conectado" : "desconectado",
        dailyLimit: Number(item.daily_limit || 0),
        currentDailyCount: Number(item.current_daily_count || 0),
        assignedQueueId: item.assigned_queue_id || undefined,
      }));
    } catch {
      return [];
    }
  },

  async fetchCampaigns(): Promise<Campaign[]> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from("campaigns")
        .select("*, campaign_destinations(channel_name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error || !data) return [];
      const status: Record<string, Campaign["status"]> = {
        active: "ativa",
        draft: "agendada",
        paused: "pausada",
        completed: "finalizada",
        cancelled: "finalizada",
        archived: "finalizada",
      };
      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        type: item.type || "Disparo Único",
        status: status[item.status] || item.status || "agendada",
        targetChannels: Array.isArray(item.campaign_destinations)
          ? item.campaign_destinations
              .map((destination: any) => destination.channel_name)
              .filter(Boolean)
          : [],
        totalSent: Number(item.total_sent || 0),
        clicks: Number(item.clicks || 0),
        conversions: Number(item.conversions || 0),
        revenue: Number(item.revenue || 0),
        scheduledDate: item.scheduled_date || item.created_at || "",
      }));
    } catch {
      return [];
    }
  },

  async fetchAutomations(): Promise<AutomationRule[]> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const { data, error } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error || !data) return [];
      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        triggerCondition: item.trigger_condition,
        action: item.action,
        status: item.status === "active" ? "ativa" : "pausada",
        triggerCount: Number(item.trigger_count || 0),
        lastTriggered: item.last_triggered_at || "",
      }));
    } catch {
      return [];
    }
  },

  async fetchSubscription(): Promise<SubscriptionPlan | null> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !data) return null;
      return {
        planCode: data.plan_code || 'free',
        name: data.plan_name,
        priceMonthly: Number(data.price_monthly || 0),
        status: data.status,
        renewalDate: data.renewal_date || "",
        disparosLimit: Number(data.dispatch_limit || 0),
        disparosUsed: Number(data.dispatch_used || 0),
        canaisLimit: Number(data.channel_limit || 0),
        canaisUsed: Number(data.channel_used || 0),
        iaGenerationsLimit: Number(data.ai_generation_limit || 0),
        iaGenerationsUsed: Number(data.ai_generation_used || 0),
        iaGenerationsPerProductLimit: data.ai_generation_per_product_limit == null || Number(data.ai_generation_per_product_limit) >= 2147483647
          ? null
          : Number(data.ai_generation_per_product_limit),
        affiliateConversionsLimit: Number(data.affiliate_conversion_limit || 0),
        affiliateConversionsUsed: Number(data.affiliate_conversion_used || 0),
        monitoredGroupsLimit: Number(data.monitored_group_limit || 0),
        monitoredGroupsUsed: Number(data.monitored_group_used || 0),
        radarRefreshesLimit: Number(data.radar_refresh_limit || 0),
        radarRefreshesUsed: Number(data.radar_refresh_used || 0),
        accountUsersLimit: data.account_user_limit == null ? null : Number(data.account_user_limit),
        landingPagesLimit: data.landing_page_limit == null ? null : Number(data.landing_page_limit),
        billingMode: data.billing_mode === 'live' ? 'live' : 'preview',
      };
    } catch {
      return null;
    }
  },

  // ─── PRODUCTS ───────────────────────────────────────────────────────────────
  async fetchProducts(): Promise<Product[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        originalPrice: Number(item.original_price || 0),
        price: Number(item.price || 0),
        discountPercent: Number(item.discount_percent || 0),
        rating: Number(item.rating || 5),
        reviewsCount: Number(item.reviews_count || 0),
        category: item.category || "Geral",
        marketplace:
          (
            {
              amazon: "Amazon",
              shopee: "Shopee",
              mercado_livre: "Mercado Livre",
              aliexpress: "AliExpress",
              magalu: "Magalu",
            } as Record<string, MarketplaceType>
          )[item.marketplace] || "Amazon",
        rawUrl: item.raw_url || "",
        affiliateUrl: item.affiliate_url || "",
        couponCode: item.coupon_code || "",
        couponLink: item.coupon_url || "",
        image: item.image || "",
        status: item.status || "ativo",
        isFavorite: Boolean(item.is_favorite ?? false),
        isArchived: Boolean(item.is_archived ?? false),
        hotScore: Number(item.hot_score || 80),
        createdAt: item.created_at || new Date().toISOString(),
        updatedAt: item.updated_at || new Date().toISOString(),
        sourceType: item.source_type || "manual",
        sourceReferenceId: item.source_reference_id ?? null,
        sourceUrl: item.source_url || item.raw_url || "",
        couponDescription: item.coupon_description || "",
        freeShipping: item.free_shipping ?? null,
        affiliateStatus: item.affiliate_status || "pending_url",
        affiliateConversionId: item.affiliate_conversion_id ?? null,
        observations: item.observations || "",
      }));
    } catch (e) {
      console.error("[AfiliHub:SupabaseService] fetchProducts error:", e);
      return null;
    }
  },

  async saveProduct(product: Product): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: product.id,
        user_id: userId,
        title: product.title,
        original_price: product.originalPrice,
        price: product.price,
        discount_percent: product.discountPercent,
        rating: product.rating,
        reviews_count: product.reviewsCount,
        category: product.category,
        marketplace: product.marketplace,
        raw_url: product.rawUrl,
        affiliate_url: product.affiliateUrl,
        coupon_code: product.couponCode,
        coupon_url: product.couponLink || null,
        image: product.image,
        status: product.status,
        is_favorite: product.isFavorite,
        is_archived: product.isArchived,
        hot_score: product.hotScore,
        source_type: product.sourceType,
        source_reference_id: product.sourceReferenceId ?? null,
        source_url: product.sourceUrl || product.rawUrl || null,
        coupon_description: product.couponDescription || null,
        free_shipping: product.freeShipping ?? null,
        affiliate_status: product.affiliateStatus,
        affiliate_conversion_id: product.affiliateConversionId ?? null,
        observations: product.observations || null,
        created_at: product.createdAt,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("products").upsert(payload);
      if (error)
        console.warn("[AfiliHub:SupabaseService] saveProduct:", error.message);
      return !error;
    } catch (e) {
      console.error("[AfiliHub:SupabaseService] saveProduct error:", e);
      return false;
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── QUEUE CONFIGS ──────────────────────────────────────────────────────────
  async fetchQueueConfigs(): Promise<QueueConfig[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("queue_configs")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        platform: item.platform || "Telegram",
        channelName: item.channel_name || "",
        channelId: item.channel_id || "",
        status: item.status || "ativa",
        intervalMinutes: item.interval_minutes || 15,
        autoShuffle: Boolean(item.auto_shuffle),
        peakHoursOnly: Boolean(item.peak_hours_only),
        daysOfWeek: Array.isArray(item.days_of_week)
          ? item.days_of_week
          : ["seg", "ter", "qua", "qui", "sex", "sab", "dom"],
        timeWindowStart: item.time_window_start || "08:00",
        timeWindowEnd: item.time_window_end || "22:00",
        nextDeliveryTime: item.next_delivery_time || "",
        lastDeliveryTime: item.last_delivery_time || "",
        totalPending: item.total_pending || 0,
        totalSent: item.total_sent || 0,
        totalFailed: item.total_failed || 0,
      }));
    } catch {
      return null;
    }
  },

  async saveQueueConfig(queue: QueueConfig): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: queue.id,
        user_id: userId,
        name: queue.name,
        platform: queue.platform,
        channel_name: queue.channelName,
        channel_id: queue.channelId,
        status: queue.status,
        interval_minutes: queue.intervalMinutes,
        auto_shuffle: queue.autoShuffle,
        peak_hours_only: queue.peakHoursOnly,
        days_of_week: queue.daysOfWeek,
        time_window_start: queue.timeWindowStart,
        time_window_end: queue.timeWindowEnd,
        next_delivery_time: queue.nextDeliveryTime,
        last_delivery_time: queue.lastDeliveryTime,
        total_pending: queue.totalPending,
        total_sent: queue.totalSent,
        total_failed: queue.totalFailed,
      };
      const { error } = await supabase.from("queue_configs").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  async deleteQueueConfig(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("queue_configs")
        .delete()
        .eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── QUEUE ITEMS ─────────────────────────────────────────────────────────────
  async fetchQueueItems(): Promise<QueueItem[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("queue_items")
        .select("*")
        .order("scheduled_for", { ascending: true });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        queueConfigId: item.queue_config_id,
        productId: item.product_id,
        productTitle: item.product_title,
        productImage: item.product_image,
        price: Number(item.price || 0),
        originalPrice: Number(item.original_price || 0),
        marketplace: item.marketplace,
        copyText: item.copy_text,
        affiliateUrl: item.affiliate_url,
        channelIds: Array.isArray(item.channel_ids) ? item.channel_ids : [],
        scheduledFor: item.scheduled_for,
        sentAt: item.sent_at,
        status: item.status,
        priority: Number(item.priority || 1),
        errorMessage: item.error_message,
      }));
    } catch {
      return null;
    }
  },

  async saveQueueItem(item: QueueItem): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: item.id,
        user_id: userId,
        queue_config_id: item.queueConfigId,
        product_id: item.productId || null,
        product_title: item.productTitle,
        product_image: item.productImage,
        price: item.price,
        original_price: item.originalPrice,
        marketplace: item.marketplace,
        copy_text: item.copyText,
        affiliate_url: item.affiliateUrl,
        channel_ids: item.channelIds,
        scheduled_for: item.scheduledFor,
        sent_at: item.sentAt,
        status: item.status,
        priority: item.priority,
        error_message: item.errorMessage,
      };
      const { error } = await supabase.from("queue_items").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  async deleteQueueItem(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("queue_items")
        .delete()
        .eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── GROUP MONITORS (ex-monitored_groups) ────────────────────────────────────
  async fetchMonitoredGroups(): Promise<MonitoredGroup[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("group_monitors")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        platform: item.platform || "Telegram",
        externalIdOrUrl: item.external_id_or_url || "",
        linkedStore: item.linked_store || "Todas as Lojas",
        status: item.status === "active" ? "ativo" : "pausado",
        capturedCount: item.captured_count || 0,
        approvedCount: item.approved_count || 0,
        lastActivity: item.last_activity_at || "",
        rules: item.rules || {
          mandatoryKeywords: [],
          forbiddenKeywords: [],
          enableOCR: true,
          maxPerHour: 30,
          dedupHours: 12,
          reviewRequired: Boolean(item.review_required ?? true),
        },
      }));
    } catch {
      return null;
    }
  },

  async saveMonitoredGroup(group: MonitoredGroup): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: group.id,
        user_id: userId,
        name: group.name,
        platform: group.platform,
        external_id_or_url: group.externalIdOrUrl,
        linked_store: group.linkedStore,
        status: group.status === "ativo" ? "active" : "paused",
        review_required: group.rules?.reviewRequired ?? true,
        captured_count: group.capturedCount,
        approved_count: group.approvedCount,
        last_activity_at: group.lastActivity || null,
        rules: group.rules,
      };
      const { error } = await supabase.from("group_monitors").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  async deleteMonitoredGroup(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("group_monitors")
        .delete()
        .eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── CAPTURED MESSAGES ───────────────────────────────────────────────────────
  async fetchCapturedMessages(): Promise<CapturedMessage[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("captured_messages")
        .select("*")
        .order("received_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        groupId: item.monitor_id || "",
        groupName: item.group_name || "Grupo",
        platform: item.platform || "Telegram",
        rawContent: item.raw_content,
        imageUrl: item.image_url,
        extractedJson: item.extracted_data,
        confidence: Number(item.confidence || 0),
        status: item.status || "Pendente",
        templateUsedId: item.template_used_id,
        finalText: item.final_text,
        createdAt: item.received_at,
      }));
    } catch {
      return null;
    }
  },

  async saveCapturedMessage(msg: CapturedMessage): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: msg.id,
        user_id: userId,
        monitor_id: msg.groupId || null,
        raw_content: msg.rawContent,
        image_url: msg.imageUrl,
        extracted_data: msg.extractedJson,
        confidence: msg.confidence,
        status: (msg.status || "pending").toLowerCase().replace(" ", "_"),
        received_at: msg.createdAt,
      };
      const { error } = await supabase
        .from("captured_messages")
        .upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── COPY TEMPLATES ─────────────────────────────────────────────────────────
  async fetchTemplates(): Promise<CopyTemplate[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("copy_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        category: item.category || "Geral",
        store: item.store || "Todas as Lojas",
        content: item.content || "",
        usageCount: item.usage_count || 0,
        isFavorite: Boolean(item.is_favorite),
        status: item.status || "ativo",
        isDefault: Boolean(item.is_default),
      }));
    } catch {
      return null;
    }
  },

  async saveTemplate(template: CopyTemplate): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: template.id,
        user_id: userId,
        title: template.title,
        category: template.category,
        store: template.store,
        content: template.content,
        usage_count: template.usageCount,
        is_favorite: template.isFavorite,
        status: template.status,
        is_default: template.isDefault,
      };
      const { error } = await supabase.from("copy_templates").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  async deleteTemplate(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("copy_templates")
        .delete()
        .eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── CRM LEADS ───────────────────────────────────────────────────────────────
  async fetchLeads(): Promise<CRMLead[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("crm_leads")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        name: item.name,
        handleOrPhone: item.handle_or_phone || "",
        platform: item.platform || "Telegram",
        tags: Array.isArray(item.tags) ? item.tags : [],
        engagementScore: item.engagement_score || 0,
        totalClicks: item.total_clicks || 0,
        lastActive: item.last_active || "",
      }));
    } catch {
      return null;
    }
  },

  async saveLead(lead: CRMLead): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: lead.id,
        user_id: userId,
        name: lead.name,
        handle_or_phone: lead.handleOrPhone,
        platform: lead.platform,
        tags: lead.tags,
        engagement_score: lead.engagementScore,
        total_clicks: lead.totalClicks,
        last_active: lead.lastActive,
      };
      const { error } = await supabase.from("crm_leads").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  async deleteLead(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from("crm_leads").delete().eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── INTEGRATIONS ─────────────────────────────────────────────────────────────
  // configurationStatus e connectionStatus separados.
  // Salvar config → configurationStatus = 'configured', connectionStatus permanece 'disconnected'.
  async fetchIntegrations(): Promise<Integration[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("integrations")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        key: item.key,
        name: item.name,
        category: item.category,
        logoIconName: item.logo_icon_name || "",
        configurationStatus: item.configuration_status || "not_configured",
        connectionStatus: item.connection_status || "disconnected",
        tagAfiliado: item.tag_afiliado,
        webhookUrl: item.webhook_url,
        lastSync: item.last_sync || "Pendente de configuração",
        description: item.description || "",
        logsCount: item.logs_count || 0,
      }));
    } catch {
      return null;
    }
  },

  async saveIntegration(integration: Integration): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: integration.id,
        user_id: userId,
        key: integration.key,
        name: integration.name,
        category: integration.category,
        logo_icon_name: integration.logoIconName,
        configuration_status: integration.configurationStatus,
        connection_status: integration.connectionStatus,
        tag_afiliado: integration.tagAfiliado,
        webhook_url: integration.webhookUrl,
        last_sync: integration.lastSync,
        description: integration.description,
        logs_count: integration.logsCount,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("integrations").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── PRODUCT COLLECTIONS ────────────────────────────────────────────────────
  async fetchProductCollections(): Promise<ProductCollection[]> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return [];
      const { data: collections, error } = await supabase
        .from("product_collections")
        .select("id,name,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error || !collections?.length) return [];
      const ids = collections.map((collection: any) => collection.id);
      const { data: items, error: itemsError } = await supabase
        .from("product_collection_items")
        .select("collection_id,product_id")
        .eq("user_id", userId)
        .in("collection_id", ids);
      if (itemsError) return [];
      return collections.map((collection: any) => ({
        id: collection.id,
        name: collection.name,
        createdAt: collection.created_at,
        productIds: (items ?? [])
          .filter((item: any) => item.collection_id === collection.id)
          .map((item: any) => item.product_id),
      }));
    } catch {
      return [];
    }
  },

  async saveProductCollection(collection: ProductCollection): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return false;
      const { error } = await supabase.from("product_collections").upsert({
        id: collection.id,
        user_id: userId,
        name: collection.name,
        updated_at: new Date().toISOString(),
      });
      return !error;
    } catch {
      return false;
    }
  },

  async deleteProductCollection(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("product_collections")
        .delete()
        .eq("id", id);
      return !error;
    } catch {
      return false;
    }
  },

  async setProductCollectionProduct(
    collectionId: string,
    productId: string,
    selected: boolean,
  ): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return false;
      if (selected) {
        const { error } = await supabase
          .from("product_collection_items")
          .upsert(
            {
              user_id: userId,
              collection_id: collectionId,
              product_id: productId,
            },
            { onConflict: "collection_id,product_id" },
          );
        return !error;
      }
      const { error } = await supabase
        .from("product_collection_items")
        .delete()
        .eq("collection_id", collectionId)
        .eq("product_id", productId);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── LANDING PAGES ─────────────────────────────────────────────────────────
  async fetchLandingPages(): Promise<LandingPageItem[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("landing_pages")
        .select("*")
        .order("created_at", { ascending: false });
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        slug: item.slug,
        views: item.views || 0,
        clicks: item.clicks || 0,
        conversionRate: Number(item.conversion_rate || 0),
        activeProductsCount: item.active_products_count || 0,
        status: item.status || "rascunho",
        updatedAt: item.updated_at,
      }));
    } catch {
      return null;
    }
  },

  async saveLandingPage(page: LandingPageItem): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const payload = {
        id: page.id,
        user_id: userId,
        title: page.title,
        slug: page.slug,
        views: page.views,
        clicks: page.clicks,
        conversion_rate: page.conversionRate,
        active_products_count: page.activeProductsCount,
        status: page.status,
        updated_at: page.updatedAt,
      };
      const { error } = await supabase.from("landing_pages").upsert(payload);
      return !error;
    } catch {
      return false;
    }
  },

  // ─── SYSTEM LOGS (UI) ──────────────────────────────────────────────────────
  // Logs destinados à interface do usuário.
  // Não incluir stack traces ou detalhes técnicos sensíveis.
  async saveLog(log: SystemLog): Promise<boolean> {
    try {
      const userId = await getCurrentUserId();
      const { error } = await supabase.from("system_logs").insert({
        id: log.id,
        user_id: userId,
        level: log.level,
        module: log.module,
        message: log.message,
        details: log.details,
      });
      return !error;
    } catch {
      return false;
    }
  },

  async fetchLogs(): Promise<SystemLog[] | null> {
    try {
      const userId = await getCurrentUserId();
      let query = supabase
        .from("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (userId) query = query.eq("user_id", userId);

      const { data, error } = await query;
      if (error || !data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        timestamp: item.created_at
          ? new Date(item.created_at).toLocaleString("pt-BR")
          : "",
        level: item.level,
        module: item.module,
        message: item.message,
        details: item.details,
      }));
    } catch {
      return null;
    }
  },
};
