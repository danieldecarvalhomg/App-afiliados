/**
 * AfiliHub — Tipos de domínio do frontend
 *
 * Tipos usados ativamente pelos componentes React e pelo AppContext.
 * Tipos de domínio puro (WhatsApp, CTA, Affiliate, Monitoring)
 * estão em src/domain/ e são importados de lá quando necessário.
 */

export type MarketplaceType =
  | 'Amazon'
  | 'Mercado Livre'
  | 'Shopee'
  | 'AliExpress'
  | 'Magalu'
  | 'Hotmart'
  | 'Kiwify'
  | 'Braip';

export type ChannelPlatform =
  | 'Telegram'
  | 'WhatsApp'
  | 'Discord'
  | 'Facebook'
  | 'Instagram'
  | 'Pinterest';

export type ProductStatus = 'ativo' | 'pausado' | 'esgotado' | 'link_quebrado';

export interface Product {
  id: string;           // UUID
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
  couponLink?: string;
  image: string;
  status: ProductStatus;
  isFavorite: boolean;
  isArchived: boolean;
  collectionId?: string;
  hotScore: number;
  createdAt: string;
  updatedAt: string;
  sourceType: 'whatsapp' | 'marketplace_radar' | 'manual';
  sourceReferenceId?: string | null;
  sourceUrl?: string;
  couponDescription?: string;
  freeShipping?: boolean | null;
  affiliateStatus: 'pending_url' | 'pending' | 'resolving' | 'resolved' | 'converting' | 'awaiting_companion' | 'converted' | 'invalid_url' | 'resolution_failed' | 'conversion_failed' | 'unsupported_platform' | 'affiliate_account_not_configured';
  affiliateConversionId?: string | null;
  observations?: string;
}

export type QueueStatus = 'pendente' | 'enviando' | 'enviado' | 'falhou' | 'pausado';

export interface QueueItem {
  id: string;           // UUID
  queueConfigId: string;
  productId: string;
  productTitle: string;
  productImage: string;
  price: number;
  originalPrice?: number;
  marketplace: MarketplaceType;
  copyText: string;
  affiliateUrl: string;
  channelIds: string[];
  scheduledFor: string;
  sentAt?: string;
  status: QueueStatus;
  priority: number;
  errorMessage?: string;
}

export interface QueueConfig {
  id: string;           // UUID
  name: string;
  platform: ChannelPlatform;
  channelName: string;
  channelId: string;
  status: 'ativa' | 'pausada';
  intervalMinutes: number;
  autoShuffle: boolean;
  peakHoursOnly: boolean;
  daysOfWeek: string[];
  timeWindowStart: string;
  timeWindowEnd: string;
  nextDeliveryTime: string;
  lastDeliveryTime: string;
  totalPending: number;
  totalSent: number;
  totalFailed: number;
}

export interface Campaign {
  id: string;           // UUID
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
  id: string;           // UUID
  name: string;
  triggerCondition: string;
  action: string;
  status: 'ativa' | 'pausada';
  triggerCount: number;
  lastTriggered: string;
}

/**
 * Integração com marketplace ou canal social.
 *
 * configurationStatus: se o usuário configurou as credenciais
 *   - 'not_configured': nenhuma credencial salva
 *   - 'configured':     credenciais salvas (não implica conexão ativa)
 *
 * connectionStatus: status real da conexão (requer implementação backend)
 *   - 'disconnected': sem conexão ativa (padrão no Bloco 1)
 *   - 'connected':    conexão ativa e operacional
 *   - 'error':        erro na conexão
 *
 * Salvar configuração → configurationStatus = 'configured', connectionStatus permanece 'disconnected'
 * A conexão real virá do backend no bloco correspondente.
 */
export type IntegrationConfigStatus = 'not_configured' | 'configured';
export type IntegrationConnectionStatus = 'disconnected' | 'connected' | 'error';

export interface Integration {
  id: string;           // UUID
  key: string;
  name: string;
  category: 'marketplace' | 'social';
  logoIconName: string;
  configurationStatus: IntegrationConfigStatus;
  connectionStatus: IntegrationConnectionStatus;
  tagAfiliado?: string;
  webhookUrl?: string;
  lastSync: string;
  description: string;
  logsCount: number;
}

export interface ChannelGroup {
  id: string;           // UUID
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
  id: string;           // UUID
  name: string;
  handleOrPhone: string;
  platform: ChannelPlatform;
  tags: string[];
  engagementScore: number;
  totalClicks: number;
  lastActive: string;
}

export interface ProductCollection {
  id: string;
  name: string;
  productIds: string[];
  createdAt?: string;
}

export interface CopyTemplate {
  id: string;           // UUID
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
  id: string;           // UUID
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
  id: string;           // UUID
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'success';
  module: string;
  message: string;
  details?: string;
}

export interface SubscriptionPlan {
  planCode: import('./domain/subscription/plans').PlanCode;
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
  iaGenerationsPerProductLimit: number | null;
  affiliateConversionsLimit: number;
  affiliateConversionsUsed: number;
  monitoredGroupsLimit: number;
  monitoredGroupsUsed: number;
  radarRefreshesLimit: number;
  radarRefreshesUsed: number;
  accountUsersLimit: number | null;
  landingPagesLimit: number | null;
  billingMode: 'preview' | 'live';
}

export interface GroupRules {
  mandatoryKeywords: string[];
  forbiddenKeywords: string[];
  minPrice?: number;
  maxPrice?: number;
  enableOCR: boolean;
  maxPerHour: number;
  dedupHours: number;
  reviewRequired: boolean;  // substitui autoApproveConfidence — revisão ON/OFF
}

export interface MonitoredGroup {
  id: string;           // UUID
  name: string;
  platform: 'WhatsApp' | 'Telegram';
  externalIdOrUrl: string;
  linkedStore: 'Todas as Lojas' | 'Amazon' | 'Mercado Livre' | 'Shopee' | 'AliExpress' | string;
  status: 'ativo' | 'pausado';
  capturedCount: number;
  approvedCount: number;
  lastActivity: string;
  rules: GroupRules;
}

export interface ExtractedDataJSON {
  produto: string;
  loja: string;
  preco: string;
  preco_original: string | null;
  cupom: string | null;
  cupom_desconto: string | null;
  cupom_link: string | null;
  link: string;
  condicoes_pagamento: string | null;
  preco_unitario: string | null;
  preco_recorrencia: string | null;
  frete_gratis: boolean;
  internacional: boolean;
  pix: boolean;
  confianca: number;
}

export interface CapturedMessage {
  id: string;           // UUID
  groupId: string;
  groupName: string;
  platform: 'WhatsApp' | 'Telegram';
  rawContent: string;
  imageUrl?: string;
  extractedJson: ExtractedDataJSON | null;
  confidence: number;
  status: 'Pendente' | 'Aprovada' | 'Rejeitada' | 'Falhou na extração';
  templateUsedId?: string;
  finalText?: string;
  createdAt: string;
}
