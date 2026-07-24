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
    title: 'Oferta Relâmpago com Cupom',
    category: 'Desconto Relâmpago',
    templateText: '🔥 *OFERTA IMPERDÍVEL: {PRODUTO}*\n\nDe ~R$ {PRECO_DE}~ por apenas *R$ {PRECO_POR}*!\n🎟️ Cupom: *{CUPOM}*\n\n🛒 Garanta o seu link com desconto:\n{LINK}',
    usageCount: 0,
  },
  {
    id: 'tpl-2',
    title: 'Baixou Mais! Menor Preço do Ano',
    category: 'Queda de Preço',
    templateText: '🚨 *BAIXOU MAIS! MENOR PREÇO DO ANO*\n\n{PRODUTO}\n\nApenas *R$ {PRECO_POR}* em até 10x sem juros!\n\n👇 Clique para comprar:\n{LINK}',
    usageCount: 0,
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
