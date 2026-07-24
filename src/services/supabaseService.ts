import { supabase } from '../lib/supabase';
import {
  Product,
  QueueConfig,
  QueueItem,
  Campaign,
  AutomationRule,
  Integration,
  ChannelGroup,
  CRMLead,
  SystemLog
} from '../types';

export const supabaseService = {
  // PRODUCTS
  async fetchProducts(): Promise<Product[] | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('Supabase fetchProducts error (will use fallback):', error.message);
        return null;
      }
      if (!data || data.length === 0) return null;

      return data.map((item: any) => ({
        id: item.id,
        title: item.title,
        originalPrice: Number(item.original_price || item.originalPrice || 0),
        price: Number(item.price || 0),
        discountPercent: Number(item.discount_percent || item.discountPercent || 0),
        rating: Number(item.rating || 5),
        reviewsCount: Number(item.reviews_count || item.reviewsCount || 0),
        category: item.category || 'Geral',
        marketplace: item.marketplace || 'Amazon',
        rawUrl: item.raw_url || item.rawUrl || '',
        affiliateUrl: item.affiliate_url || item.affiliateUrl || '',
        couponCode: item.coupon_code || item.couponCode || '',
        image: item.image || '',
        status: item.status || 'ativo',
        isFavorite: Boolean(item.is_favorite ?? item.isFavorite ?? false),
        isArchived: Boolean(item.is_archived ?? item.isArchived ?? false),
        collectionId: item.collection_id || item.collectionId || '',
        hotScore: Number(item.hot_score || item.hotScore || 80),
        createdAt: item.created_at || item.createdAt || new Date().toISOString(),
        updatedAt: item.updated_at || item.updatedAt || new Date().toISOString(),
      }));
    } catch (e) {
      console.error('Error fetching products from Supabase:', e);
      return null;
    }
  },

  async saveProduct(product: Product): Promise<boolean> {
    try {
      const payload = {
        id: product.id,
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
        image: product.image,
        status: product.status,
        is_favorite: product.isFavorite,
        is_archived: product.isArchived,
        hot_score: product.hotScore,
        created_at: product.createdAt,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('products').upsert(payload);
      if (error) {
        console.warn('Could not save product to Supabase:', error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Save product error:', e);
      return false;
    }
  },

  async deleteProduct(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('products').delete().eq('id', id);
      if (error) console.warn('Could not delete product in Supabase:', error.message);
      return !error;
    } catch (e) {
      return false;
    }
  },

  // QUEUE ITEMS
  async fetchQueueItems(): Promise<QueueItem[] | null> {
    try {
      const { data, error } = await supabase.from('queue_items').select('*').order('scheduled_for', { ascending: true });
      if (error || !data || data.length === 0) return null;
      return data.map((item: any) => ({
        id: item.id,
        queueConfigId: item.queue_config_id || item.queueConfigId,
        productId: item.product_id || item.productId,
        productTitle: item.product_title || item.productTitle,
        productImage: item.product_image || item.productImage,
        price: Number(item.price || 0),
        originalPrice: Number(item.original_price || item.originalPrice || 0),
        marketplace: item.marketplace,
        copyText: item.copy_text || item.copyText,
        affiliateUrl: item.affiliate_url || item.affiliateUrl,
        channelIds: Array.isArray(item.channel_ids) ? item.channel_ids : (item.channel_ids ? JSON.parse(item.channel_ids) : []),
        scheduledFor: item.scheduled_for || item.scheduledFor,
        sentAt: item.sent_at || item.sentAt,
        status: item.status,
        priority: Number(item.priority || 1),
        errorMessage: item.error_message || item.errorMessage
      }));
    } catch (e) {
      return null;
    }
  },

  async saveQueueItem(item: QueueItem): Promise<boolean> {
    try {
      const payload = {
        id: item.id,
        queue_config_id: item.queueConfigId,
        product_id: item.productId,
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
        error_message: item.errorMessage
      };
      const { error } = await supabase.from('queue_items').upsert(payload);
      return !error;
    } catch (e) {
      return false;
    }
  },

  // USER ACCOUNTS / LEADS
  async saveUserAccount(name: string, email: string, userId?: string): Promise<boolean> {
    try {
      const payload = {
        id: userId || 'usr-' + Date.now(),
        name: name || email.split('@')[0],
        handle_or_phone: email,
        platform: 'Web',
        tags: ['Novo Cadastro', 'Afiliado VIP'],
        engagement_score: 100,
        total_clicks: 0,
        last_active: new Date().toISOString()
      };
      const { error } = await supabase.from('crm_leads').upsert(payload);
      if (error) console.warn('Could not save user to Supabase:', error.message);
      return !error;
    } catch (e) {
      return false;
    }
  },

  // SYSTEM LOGS
  async saveLog(log: SystemLog): Promise<boolean> {
    try {
      const { error } = await supabase.from('system_logs').insert({
        id: log.id,
        timestamp: log.timestamp,
        level: log.level,
        module: log.module,
        message: log.message,
        details: log.details
      });
      return !error;
    } catch (e) {
      return false;
    }
  }
};
