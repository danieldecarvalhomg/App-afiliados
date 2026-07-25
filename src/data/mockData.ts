import {
  Product,
  QueueConfig,
  QueueItem,
  Campaign,
  AutomationRule,
  Integration,
  ChannelGroup,
  CRMLead,
  CopyTemplate,
  LandingPageItem,
  SystemLog,
  SubscriptionPlan
} from '../types';

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_QUEUES: QueueConfig[] = [];

export const INITIAL_QUEUE_ITEMS: QueueItem[] = [];

export const INITIAL_INTEGRATIONS: Integration[] = [
  {
    id: 'int-amazon',
    key: 'amazon',
    name: 'Amazon Brasil',
    category: 'marketplace',
    logoIconName: 'ShoppingBag',
    status: 'desconectado',
    tagAfiliado: '',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Sincronização automática de preços, estoque e conversão de links de associados Amazon.',
    logsCount: 0,
  },
  {
    id: 'int-ml',
    key: 'mercadolivre',
    name: 'Mercado Livre',
    category: 'marketplace',
    logoIconName: 'Package',
    status: 'desconectado',
    tagAfiliado: '',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Gerador de links e cupons automáticos do Programa de Afiliados Mercado Livre.',
    logsCount: 0,
  },
  {
    id: 'int-shopee',
    key: 'shopee',
    name: 'Shopee Afiliados',
    category: 'marketplace',
    logoIconName: 'ShoppingBasket',
    status: 'desconectado',
    tagAfiliado: '',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Encurtador de links e rastreador de comissões da Shopee.',
    logsCount: 0,
  },
  {
    id: 'int-tg',
    key: 'telegram',
    name: 'Telegram Bot API',
    category: 'social',
    logoIconName: 'Send',
    status: 'desconectado',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Bot de alta performance para disparo de ofertas em canais e grupos de Telegram.',
    logsCount: 0,
  },
  {
    id: 'int-wa',
    key: 'whatsapp',
    name: 'WhatsApp Business API / Web',
    category: 'social',
    logoIconName: 'MessageSquare',
    status: 'desconectado',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Instância para envios programados em comunidades e grupos de WhatsApp.',
    logsCount: 0,
  },
  {
    id: 'int-ali',
    key: 'aliexpress',
    name: 'AliExpress Portals',
    category: 'marketplace',
    logoIconName: 'Globe',
    status: 'desconectado',
    tagAfiliado: '',
    apiKey: '',
    lastSync: 'Pendente de configuração',
    description: 'Integração oficial de ofertas e cupons da AliExpress Global.',
    logsCount: 0,
  },
  {
    id: 'int-dc',
    key: 'discord',
    name: 'Discord Webhooks',
    category: 'social',
    logoIconName: 'Disc',
    status: 'desconectado',
    apiKey: '',
    lastSync: 'Não configurado',
    description: 'Envio automatizado de ofertas em servidores de Discord via Webhooks.',
    logsCount: 0,
  }
];

export const INITIAL_GROUPS: ChannelGroup[] = [];

export const INITIAL_CAMPAIGNS: Campaign[] = [];

export const INITIAL_AUTOMATIONS: AutomationRule[] = [];

export const INITIAL_TEMPLATES: CopyTemplate[] = [
  {
    id: 'tpl-1',
    title: 'Oferta Padrão Universal',
    category: 'Geral',
    store: 'Todas as Lojas',
    content: `{cta}

🔥 *{produto}*
[se preco_original]
De ~R$ {preco_original}~ por
[fim]
💰 *R$ {preco}* [se condicoes_pagamento]({condicoes_pagamento})[fim]

[se cupom]
🎟️ Cupom: *{cupom}*
[fim]
[se frete_gratis]
🚚 *Frete Grátis!*
[fim]

🛒 Acesse agora:
{link}`,
    usageCount: 42,
    status: 'ativo',
    isDefault: true,
  },
  {
    id: 'tpl-2',
    title: 'Oferta Relâmpago Amazon',
    category: 'Amazon',
    store: 'Amazon',
    content: `🚨 *OFERTA ESPECIAL AMAZON*

*{produto}*

[se preco_original]
De ~R$ {preco_original}~ por
[fim]
Por apenas: *R$ {preco}*
[se frete_gratis]
📦 Frete Grátis Prime!
[fim]

👇 Garanta antes que acabe:
{link}`,
    usageCount: 18,
    status: 'ativo',
    isDefault: true,
  },
  {
    id: 'tpl-3',
    title: 'Achadinho Shopee com Cupom',
    category: 'Shopee',
    store: 'Shopee',
    content: `🧡 *ACHADINHO SHOPEE*

{produto}
[se cupom_desconto]
🔥 *{cupom_desconto} OFF!*
[fim]
Por apenas: *R$ {preco}*

[se cupom]
🎟️ Resgate o cupom: *{cupom}*
[fim]

🔗 Clique para ver:
{link}`,
    usageCount: 29,
    status: 'ativo',
    isDefault: true,
  }
];

export const INITIAL_LANDING_PAGES: LandingPageItem[] = [];

export const INITIAL_LEADS: CRMLead[] = [];

export const INITIAL_LOGS: SystemLog[] = [];

export const INITIAL_SUBSCRIPTION: SubscriptionPlan = {
  planName: 'Plano Pro Afiliados',
  status: 'ativo',
  monthlyRate: 149.00,
  renewalDate: '2026-08-24',
  channelsLimit: 50,
  channelsUsed: 0,
  aiGenerationsLimit: 10000,
  aiGenerationsUsed: 0,
  teamMembersLimit: 5,
  teamMembersUsed: 1,
  features: [
    'Disparos ilimitados via Telegram & WhatsApp',
    'Gerador de Copies ilimitado com Gemini IA',
    'Conexão com Banco de Dados em Nuvem',
    'Rastreamento avançado de cliques e comissões'
  ]
};

export const INITIAL_MONITORED_GROUPS: MonitoredGroup[] = [
  {
    id: 'grp-1',
    name: 'Radar de Ofertas Tech (Telegram)',
    platform: 'Telegram',
    externalIdOrUrl: 'https://t.me/radar_ofertas_br',
    linkedStore: 'Todas as Lojas',
    status: 'ativo',
    capturedCount: 12,
    approvedCount: 9,
    lastActivity: 'Há 5 min',
    rules: {
      mandatoryKeywords: [],
      forbiddenKeywords: ['esgotado', 'vazio'],
      minPrice: 10,
      enableOCR: true,
      maxPerHour: 30,
      dedupHours: 12,
      autoApproveConfidence: 0.7
    }
  },
  {
    id: 'grp-2',
    name: 'Achados da Shopee VIP (WhatsApp)',
    platform: 'WhatsApp',
    externalIdOrUrl: 'https://chat.whatsapp.com/achados-shopee-vip',
    linkedStore: 'Shopee',
    status: 'ativo',
    capturedCount: 8,
    approvedCount: 7,
    lastActivity: 'Há 18 min',
    rules: {
      mandatoryKeywords: [],
      forbiddenKeywords: [],
      minPrice: 5,
      enableOCR: true,
      maxPerHour: 20,
      dedupHours: 24,
      autoApproveConfidence: 0.65
    }
  }
];

export const INITIAL_CAPTURED_MESSAGES: CapturedMessage[] = [
  {
    id: 'cap-1',
    groupId: 'grp-1',
    groupName: 'Radar de Ofertas Tech (Telegram)',
    platform: 'Telegram',
    rawContent: '🔥 GENTE CORRE! Air Fryer Philips Walita 4.1L De R$ 499 por apenas R$ 279,90 no PIX com frete grátis! Usar cupom WALITA10 https://amzn.to/airfryer-deal',
    extractedJson: {
      produto: 'Air Fryer Philips Walita 4.1L',
      loja: 'Amazon',
      preco: '279.90',
      preco_original: '499.00',
      cupom: 'WALITA10',
      cupom_desconto: '10% OFF',
      cupom_link: null,
      link: 'https://amzn.to/airfryer-deal',
      condicoes_pagamento: 'no PIX com desconto',
      preco_unitario: null,
      preco_recorrencia: null,
      frete_gratis: true,
      internacional: false,
      pix: true,
      confianca: 0.94
    },
    confidence: 0.94,
    status: 'Pendente',
    templateUsedId: 'tpl-2',
    finalText: `🚨 *OFERTA ESPECIAL AMAZON*\n\n*Air Fryer Philips Walita 4.1L*\n\nDe ~R$ 499.00~ por\nPor apenas: *R$ 279.90*\n📦 Frete Grátis Prime!\n\n👇 Garanta antes que acabe:\nhttps://amzn.to/airfryer-deal`,
    createdAt: 'Há 5 min'
  }
];
