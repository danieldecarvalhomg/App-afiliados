/**
 * AfiliHub — Mock Data
 *
 * Este arquivo contém apenas dados de fallback para desenvolvimento.
 * No ambiente de produção, todos os dados vêm do Supabase.
 *
 * Nenhum array exportado aqui é importado diretamente pelo AppContext —
 * o AppContext inicializa seus estados como arrays vazios e carrega do Supabase.
 *
 * Os dados aqui são mantidos apenas como referência de estrutura de dados.
 */

import { SubscriptionPlan } from '../types';

// Plano de assinatura padrão — usado pelo AppContext como estado inicial
// até que os dados reais do plano sejam carregados do Supabase.
export const DEFAULT_SUBSCRIPTION: SubscriptionPlan = {
  planCode: 'pro',
  name: 'Pro',
  priceMonthly: 0,
  status: 'ativo',
  renewalDate: new Date().toISOString(),
  disparosLimit: 1000,
  disparosUsed: 0,
  canaisLimit: 10,
  canaisUsed: 0,
  iaGenerationsLimit: 1000,
  iaGenerationsUsed: 0,
  iaGenerationsPerProductLimit: 60,
  affiliateConversionsLimit: 2000,
  affiliateConversionsUsed: 0,
  monitoredGroupsLimit: 20,
  monitoredGroupsUsed: 0,
  radarRefreshesLimit: 3000,
  radarRefreshesUsed: 0,
  accountUsersLimit: 5,
  landingPagesLimit: 5,
  billingMode: 'preview',
};
