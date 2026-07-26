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

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'feed-1',
    title: 'Smart TV 55" 4K UHD Samsung Crystal UHD 55CU7700',
    originalPrice: 3499.00,
    price: 2199.00,
    discountPercent: 37,
    rating: 4.8,
    reviewsCount: 1420,
    category: 'Eletrônicos',
    marketplace: 'Amazon',
    rawUrl: 'https://www.amazon.com.br/dp/B0C399S899',
    affiliateUrl: 'https://www.amazon.com.br/dp/B0C399S899?tag=affiflow-20',
    couponCode: 'TV55AMZ',
    image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: true,
    isArchived: false,
    hotScore: 98,
    priceDropAlert: true,
    priceDropAmount: 400.00,
    stockStatus: 'relampago',
    freeShipping: true,
    pixDiscount: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed-2',
    title: 'Fone de Ouvido Bluetooth JBL Tune 520BT Sem Fio',
    originalPrice: 299.00,
    price: 179.90,
    discountPercent: 40,
    rating: 4.7,
    reviewsCount: 890,
    category: 'Eletrônicos',
    marketplace: 'Shopee',
    rawUrl: 'https://shopee.com.br/jbl-tune-520bt',
    affiliateUrl: 'https://shope.ee/890123jbl?smtt=0.0.9',
    couponCode: 'SHOPEEJBL10',
    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 92,
    priceDropAlert: true,
    priceDropAmount: 50.00,
    stockStatus: 'poucas_unidades',
    freeShipping: true,
    pixDiscount: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed-3',
    title: 'Fritadeira Elétrica Air Fryer Oven Mondial 12L 1800W',
    originalPrice: 699.90,
    price: 449.00,
    discountPercent: 36,
    rating: 4.9,
    reviewsCount: 2310,
    category: 'Casa',
    marketplace: 'Mercado Livre',
    rawUrl: 'https://www.mercadolivre.com.br/air-fryer-mondial',
    affiliateUrl: 'https://mercadolivre.com.br/sec/airfryer-aff',
    couponCode: 'MLOVEN20',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: true,
    isArchived: false,
    hotScore: 95,
    priceDropAlert: false,
    stockStatus: 'normal',
    freeShipping: true,
    pixDiscount: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed-4',
    title: 'Smartphone Samsung Galaxy S23 5G 256GB 8GB RAM',
    originalPrice: 4999.00,
    price: 2999.00,
    discountPercent: 40,
    rating: 4.8,
    reviewsCount: 3100,
    category: 'Eletrônicos',
    marketplace: 'Magalu',
    rawUrl: 'https://www.magazineluizafam.com.br/galaxy-s23',
    affiliateUrl: 'https://www.magazinevoce.com.br/magazineluiza/p/s23-256gb',
    couponCode: 'MAGAS23',
    image: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 96,
    priceDropAlert: true,
    priceDropAmount: 300.00,
    stockStatus: 'relampago',
    freeShipping: true,
    pixDiscount: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed-5',
    title: 'Console PlayStation 5 Slim Edição Digital + 2 Jogos',
    originalPrice: 4299.00,
    price: 3599.00,
    discountPercent: 16,
    rating: 4.9,
    reviewsCount: 1850,
    category: 'Games',
    marketplace: 'Amazon',
    rawUrl: 'https://www.amazon.com.br/dp/B0CL5KPS5',
    affiliateUrl: 'https://www.amazon.com.br/dp/B0CL5KPS5?tag=affiflow-20',
    couponCode: '',
    image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 99,
    priceDropAlert: false,
    stockStatus: 'poucas_unidades',
    freeShipping: true,
    pixDiscount: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 22).toISOString(),
    updatedAt: new Date().toISOString()
  },
  {
    id: 'feed-6',
    title: 'Smartwatch Anker Soundcore Motion Boom HD 30W',
    originalPrice: 599.00,
    price: 249.00,
    discountPercent: 58,
    rating: 4.7,
    reviewsCount: 540,
    category: 'Eletrônicos',
    marketplace: 'AliExpress',
    rawUrl: 'https://pt.aliexpress.com/item/100500.html',
    affiliateUrl: 'https://s.click.aliexpress.com/e/_dZanker',
    couponCode: 'ALIEX30',
    image: 'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 88,
    priceDropAlert: true,
    priceDropAmount: 80.00,
    stockStatus: 'normal',
    freeShipping: true,
    pixDiscount: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    updatedAt: new Date().toISOString()
  }
];

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
