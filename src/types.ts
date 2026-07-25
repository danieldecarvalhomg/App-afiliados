export type MarketplaceType = 'Amazon' | 'Mercado Livre' | 'Shopee' | 'AliExpress' | 'Magalu' | 'Hotmart' | 'Kiwify' | 'Braip';

export type ChannelPlatform = 'Telegram' | 'WhatsApp' | 'Discord' | 'Facebook' | 'Instagram' | 'Pinterest';

export type ProductStatus = 'ativo' | 'pausado' | 'esgotado' | 'link_quebrado';

export interface Product {
  id: string;
  title: string;
  originalPrice: number;
  price: number;
  discountPercent: number;
  rating: number;
  reviewsCount: number;
  category: string;
  marketplace: MarketplaceType;
  rawUrl: string;
  affiliateUrl: string;
  couponCode?: string;
  image: string;
  status: ProductStatus;
  isFavorite: boolean;
  isArchived: boolean;
  collectionId?: string;
  hotScore: number; // 0 - 100
  createdAt: string;
  updatedAt: string;
}

export type QueueStatus = 'pendente' | 'enviando' | 'enviado' | 'falhou' | 'pausado';

export interface QueueItem {
  id: string;
  queueConfigId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  price: number;
  originalPrice?: number;
  marketplace: MarketplaceType;
  copyText: string;
  affiliateUrl: string;
  channelIds: string[]; // Destination channel IDs
  scheduledFor: string;
  sentAt?: string;
  status: QueueStatus;
  priority: number; // 1 = highest
  errorMessage?: string;
}

export interface QueueConfig {
  id: string;
  name: string;
  platform: ChannelPlatform;
  channelName: string;
  channelId: string;
  status: 'ativa' | 'pausada';
  intervalMinutes: number;
  autoShuffle: boolean;
  peakHoursOnly: boolean;
  daysOfWeek: string[]; // ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom']
  timeWindowStart: string; // "08:00"
  timeWindowEnd: string; // "22:00"
  nextDeliveryTime: string;
  lastDeliveryTime: string;
  totalPending: number;
  totalSent: number;
  totalFailed: number;
}

export interface Campaign {
  id: string;
  name: string;
  type: 'Disparo Único' | 'Recorrente' | 'Automação' | 'Black Friday' | 'Cupom Relâmpago';
  status: 'ativa' | 'agendada' | 'finalizada' | 'pausada';
  targetChannels: string[];
  totalSent: number;
  clicks: number;
  conversions: number;
  revenue: number;
  scheduledDate: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  triggerCondition: string;
  action: string;
  status: 'ativa' | 'pausada';
  triggerCount: number;
  lastTriggered: string;
}

export interface Integration {
  id: string;
  key: string; // 'amazon', 'mercadolivre', 'shopee', 'telegram', 'whatsapp', etc
  name: string;
  category: 'marketplace' | 'social';
  logoIconName: string;
  status: 'conectado' | 'desconectado' | 'requer_atencao';
  tagAfiliado?: string;
  apiKey?: string;
  webhookUrl?: string;
  lastSync: string;
  description: string;
  logsCount: number;
}

export interface ChannelGroup {
  id: string;
  name: string;
  platform: ChannelPlatform;
  type: 'Grupo' | 'Canal' | 'Página' | 'Direct';
  membersCount: number;
  status: 'conectado' | 'desconectado' | 'limite_atingido';
  dailyLimit: number;
  currentDailyCount: number;
  assignedQueueId?: string;
}

export interface CRMLead {
  id: string;
  name: string;
  handleOrPhone: string;
  platform: ChannelPlatform;
  tags: string[];
  engagementScore: number;
  totalClicks: number;
  lastActive: string;
}

export interface CopyTemplate {
  id: string;
  title: string;
  category: string;
  store: 'Todas as Lojas' | 'Amazon' | 'Mercado Livre' | 'Shopee' | 'AliExpress' | string;
  content: string;
  usageCount: number;
  isFavorite?: boolean;
  status: 'ativo' | 'inativo';
  isDefault: boolean;
}

export interface LandingPageItem {
  id: string;
  title: string;
  slug: string;
  views: number;
  clicks: number;
  conversionRate: number;
  activeProductsCount: number;
  status: 'publicada' | 'rascunho';
  updatedAt: string;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  module: string;
  message: string;
  details?: string;
}

export interface SubscriptionPlan {
  name: string;
  priceMonthly: number;
  status: 'ativo' | 'pendente' | 'cancelado';
  renewalDate: string;
  disparosLimit: number;
  disparosUsed: number;
  canaisLimit: number;
  canaisUsed: number;
  iaGenerationsLimit: number;
  iaGenerationsUsed: number;
}
