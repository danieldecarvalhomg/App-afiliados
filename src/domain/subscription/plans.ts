export type PlanCode = 'free' | 'essential' | 'advanced' | 'pro' | 'scale' | 'personal';

export const SELF_SERVICE_PLAN_CODES = ['free', 'essential', 'advanced', 'pro', 'scale'] as const;

export type SelfServicePlanCode = (typeof SELF_SERVICE_PLAN_CODES)[number];

export const isSelfServicePlanCode = (value: unknown): value is SelfServicePlanCode =>
  typeof value === 'string' && (SELF_SERVICE_PLAN_CODES as readonly string[]).includes(value);

export type PlanFeature =
  | 'amazon'
  | 'shopee'
  | 'mercado_livre'
  | 'radar'
  | 'group_monitor'
  | 'ai_cta'
  | 'ai_trainer'
  | 'custom_templates'
  | 'scheduling'
  | 'queues'
  | 'monitor_automation'
  | 'landing_pages'
  | 'analytics'
  | 'history_reports';

export type FeatureLevel = 'none' | 'limited' | 'basic' | 'complete' | 'advanced' | 'custom';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  priceMonthly: number | null;
  idealFor: string;
  highlighted?: boolean;
  limits: {
    accountUsers: number | null;
    whatsappConnections: number | null;
    mercadoLivreConversions: number | null;
    monitoredGroups: number | null;
    aiGenerations: number | null;
    aiGenerationsPerProduct: number | null;
    landingPages: number | null;
  };
  features: Record<PlanFeature, FeatureLevel>;
  processingPriority: 'standard' | 'high' | 'maximum';
  support: 'help_center' | 'email' | 'whatsapp' | 'priority' | 'dedicated';
  assistedOnboarding: 'none' | 'optional' | 'included';
  customSetup: boolean;
}

const commonPaid = {
  amazon: 'complete', shopee: 'complete', mercado_livre: 'complete', radar: 'complete',
  group_monitor: 'complete', custom_templates: 'complete', scheduling: 'complete', queues: 'complete',
  landing_pages: 'complete', history_reports: 'complete',
} as const;

export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    code: 'free', name: 'Grátis', priceMonthly: 0, idealFor: 'Testar o AfiliHub',
    limits: { accountUsers: 1, whatsappConnections: 1, mercadoLivreConversions: 0, monitoredGroups: 0, aiGenerations: 0, aiGenerationsPerProduct: 0, landingPages: 0 },
    features: { amazon:'complete', shopee:'complete', mercado_livre:'none', radar:'limited', group_monitor:'none', ai_cta:'none', ai_trainer:'none', custom_templates:'basic', scheduling:'limited', queues:'limited', monitor_automation:'none', landing_pages:'none', analytics:'basic', history_reports:'limited' },
    processingPriority: 'standard', support: 'help_center', assistedOnboarding: 'none', customSetup: false,
  },
  {
    code: 'essential', name: 'Essencial', priceMonthly: 69, idealFor: 'Operação pequena',
    limits: { accountUsers: 1, whatsappConnections: 2, mercadoLivreConversions: 300, monitoredGroups: 2, aiGenerations: 0, aiGenerationsPerProduct: 0, landingPages: 1 },
    features: { ...commonPaid, ai_cta:'none', ai_trainer:'none', monitor_automation:'basic', analytics:'basic' },
    processingPriority: 'standard', support: 'email', assistedOnboarding: 'none', customSetup: false,
  },
  {
    code: 'advanced', name: 'Avançado', priceMonthly: 129, idealFor: 'Afiliado ativo', highlighted: true,
    limits: { accountUsers: 2, whatsappConnections: 3, mercadoLivreConversions: 1_000, monitoredGroups: 10, aiGenerations: 300, aiGenerationsPerProduct: 30, landingPages: 2 },
    features: { ...commonPaid, ai_cta:'complete', ai_trainer:'complete', monitor_automation:'complete', analytics:'complete' },
    processingPriority: 'standard', support: 'whatsapp', assistedOnboarding: 'none', customSetup: false,
  },
  {
    code: 'pro', name: 'Pro', priceMonthly: 219, idealFor: 'Operação profissional',
    limits: { accountUsers: 5, whatsappConnections: 5, mercadoLivreConversions: 2_500, monitoredGroups: 25, aiGenerations: 900, aiGenerationsPerProduct: 60, landingPages: 5 },
    features: { ...commonPaid, ai_cta:'complete', ai_trainer:'complete', monitor_automation:'complete', analytics:'advanced' },
    processingPriority: 'high', support: 'priority', assistedOnboarding: 'none', customSetup: false,
  },
  {
    code: 'scale', name: 'Escala', priceMonthly: 329, idealFor: 'Alto volume',
    limits: { accountUsers: 10, whatsappConnections: 8, mercadoLivreConversions: 5_000, monitoredGroups: 50, aiGenerations: 2_000, aiGenerationsPerProduct: 120, landingPages: 10 },
    features: { ...commonPaid, ai_cta:'complete', ai_trainer:'complete', monitor_automation:'complete', analytics:'advanced' },
    processingPriority: 'high', support: 'priority', assistedOnboarding: 'optional', customSetup: false,
  },
  {
    code: 'personal', name: 'Personal', priceMonthly: null, idealFor: 'Operação sob medida',
    limits: { accountUsers: null, whatsappConnections: null, mercadoLivreConversions: null, monitoredGroups: null, aiGenerations: null, aiGenerationsPerProduct: null, landingPages: null },
    features: { amazon:'complete', shopee:'complete', mercado_livre:'complete', radar:'complete', group_monitor:'complete', ai_cta:'complete', ai_trainer:'complete', custom_templates:'custom', scheduling:'custom', queues:'custom', monitor_automation:'custom', landing_pages:'custom', analytics:'custom', history_reports:'custom' },
    processingPriority: 'maximum', support: 'dedicated', assistedOnboarding: 'included', customSetup: true,
  },
] as const;

export const planByCode = (code: string | null | undefined): PlanDefinition =>
  PLAN_CATALOG.find((plan) => plan.code === code) ?? PLAN_CATALOG[0];

export const planHasFeature = (code: string | null | undefined, feature: PlanFeature): boolean =>
  planByCode(code).features[feature] !== 'none';
