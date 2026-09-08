import React, { useState } from 'react';
import { AlertCircle, Building2, Check, CheckCircle2, LoaderCircle, Minus, Sparkles } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  PLAN_CATALOG,
  isSelfServicePlanCode,
  planByCode,
  type FeatureLevel,
  type PlanDefinition,
  type SelfServicePlanCode,
} from '../domain/subscription/plans';
import { changeSubscriptionPlan } from '../services/accountApi';

const number = (value: number | null) => value == null ? 'Sob medida' : value.toLocaleString('pt-BR');
const price = (plan: PlanDefinition) => plan.priceMonthly == null ? 'A partir de R$ 499' : plan.priceMonthly === 0 ? 'R$ 0' : `R$ ${plan.priceMonthly}`;
const level = (value: FeatureLevel) => ({ none: 'Não incluído', limited: 'Limitado', basic: 'Básico', complete: 'Incluído', advanced: 'Avançado', custom: 'Sob medida' }[value]);
const support = { help_center: 'Central de ajuda', email: 'E-mail', whatsapp: 'WhatsApp', priority: 'Prioritário', dedicated: 'Dedicado' } as const;
const priority = { standard: 'Padrão', high: 'Alta', maximum: 'Máxima' } as const;

const Feature: React.FC<{ value: FeatureLevel; label: string }> = ({ value, label }) => (
  <li className="flex items-center justify-between gap-3 text-xs">
    <span className="text-[#6B6F7B]">{label}</span>
    <span className={`flex items-center gap-1 text-right ${value === 'none' ? 'text-[#9CA3AF]' : 'text-[#D4D4D8]'}`}>
      {value === 'none' ? <Minus className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
      {level(value)}
    </span>
  </li>
);

interface PlanCardProps {
  plan: PlanDefinition;
  current: boolean;
  changing: SelfServicePlanCode | null;
  onSelect: (plan: PlanDefinition) => void;
}

const PlanCard: React.FC<PlanCardProps> = ({ plan, current, changing, onSelect }) => {
  const selectable = isSelfServicePlanCode(plan.code);
  const isChanging = changing === plan.code;
  return (
    <article className={`relative rounded-2xl border p-5 ${plan.highlighted ? 'border-violet-500/70 bg-violet-500/[0.06]' : 'border-[#E8E9ED] bg-[#FFFFFF]'} ${current ? 'ring-1 ring-emerald-400/70' : ''}`}>
      {plan.highlighted && <span className="absolute right-4 top-4 rounded-full bg-violet-500/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300">Mais escolhido</span>}
      <div className="pr-20">
        <p className="text-xs text-[#9CA3AF]">{plan.idealFor}</p>
        <h3 className="mt-1 text-lg font-semibold text-[#0F172A]">{plan.name}</h3>
        <p className="mt-3 text-2xl font-semibold text-[#0F172A]">{price(plan)}<span className="text-xs font-normal text-[#9CA3AF]">{plan.priceMonthly === 0 || plan.priceMonthly == null ? '' : ' / mês'}</span></p>
      </div>

      {current ? (
        <div className="mt-4 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-medium text-emerald-600">Plano atual</div>
      ) : selectable ? (
        <button type="button" onClick={() => onSelect(plan)} disabled={changing !== null} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-2 text-xs font-medium text-violet-200 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-50">
          {isChanging && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {isChanging ? 'Alterando plano...' : `Mudar para ${plan.name}`}
        </button>
      ) : (
        <div className="mt-4 w-full rounded-lg border border-[#303036] bg-[#F4F4F6] px-3 py-2 text-center text-xs font-medium text-[#6B6F7B]">Plano sob consulta</div>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
        <div><dt className="text-[#9CA3AF]">Usuários</dt><dd className="mt-1 text-[#0F172A]">{number(plan.limits.accountUsers)}</dd></div>
        <div><dt className="text-[#9CA3AF]">WhatsApps</dt><dd className="mt-1 text-[#0F172A]">{number(plan.limits.whatsappConnections)}</dd></div>
        <div><dt className="text-[#9CA3AF]">Conversões ML</dt><dd className="mt-1 text-[#0F172A]">{plan.limits.mercadoLivreConversions === 0 ? '—' : `${number(plan.limits.mercadoLivreConversions)}/mês`}</dd></div>
        <div><dt className="text-[#9CA3AF]">Grupos</dt><dd className="mt-1 text-[#0F172A]">{plan.limits.monitoredGroups === 0 ? '—' : number(plan.limits.monitoredGroups)}</dd></div>
        <div><dt className="text-[#9CA3AF]">Gerações IA</dt><dd className="mt-1 text-[#0F172A]">{plan.limits.aiGenerations === 0 ? '—' : `${number(plan.limits.aiGenerations)}/mês`}</dd></div>
        <div><dt className="text-[#9CA3AF]">IA por produto</dt><dd className="mt-1 text-[#0F172A]">{plan.limits.aiGenerationsPerProduct === 0 ? '—' : `${number(plan.limits.aiGenerationsPerProduct)}/mês`}</dd></div>
        <div><dt className="text-[#9CA3AF]">Landing pages</dt><dd className="mt-1 text-[#0F172A]">{plan.limits.landingPages === 0 ? '—' : number(plan.limits.landingPages)}</dd></div>
      </dl>
      <ul className="mt-5 space-y-2 border-t border-[#E8E9ED] pt-4">
        <Feature label="Amazon e Shopee" value={plan.features.amazon} />
        <Feature label="Mercado Livre" value={plan.features.mercado_livre} />
        <Feature label="Radar de Ofertas" value={plan.features.radar} />
        <Feature label="Monitor de Grupos" value={plan.features.group_monitor} />
        <Feature label="CTA e Treinador IA" value={plan.features.ai_cta} />
        <Feature label="Templates" value={plan.features.custom_templates} />
        <Feature label="Agendamento e filas" value={plan.features.scheduling} />
        <Feature label="Automação do Monitor" value={plan.features.monitor_automation} />
        <Feature label="Analytics" value={plan.features.analytics} />
      </ul>
      <div className="mt-4 border-t border-[#E8E9ED] pt-4 text-xs text-[#6B6F7B]">
        <p>Prioridade: <span className="text-[#D4D4D8]">{priority[plan.processingPriority]}</span></p>
        <p className="mt-1">Suporte: <span className="text-[#D4D4D8]">{support[plan.support]}</span></p>
        {plan.assistedOnboarding !== 'none' && <p className="mt-1">Onboarding: <span className="text-[#D4D4D8]">{plan.assistedOnboarding === 'included' ? 'Incluído' : 'Opcional'}</span></p>}
      </div>
    </article>
  );
};

export const TeamSubscriptionView: React.FC = () => {
  const { subscription, refreshSubscription, addLog } = useApp();
  const current = planByCode(subscription.planCode);
  const [changing, setChanging] = useState<SelfServicePlanCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usage = (used: number, limit: number) => limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const meters = [
    ['Conversões Mercado Livre', subscription.affiliateConversionsUsed, subscription.affiliateConversionsLimit],
    ['Gerações de IA', subscription.iaGenerationsUsed, subscription.iaGenerationsLimit],
    ['WhatsApps conectados', subscription.canaisUsed, subscription.canaisLimit],
    ['Grupos monitorados', subscription.monitoredGroupsUsed, subscription.monitoredGroupsLimit],
  ] as const;

  async function selectPlan(plan: PlanDefinition) {
    if (!isSelfServicePlanCode(plan.code) || changing) return;
    const confirmed = window.confirm(`Mudar do plano ${current.name} para o plano ${plan.name}? Seus dados serão preservados e os novos limites serão aplicados imediatamente.`);
    if (!confirmed) return;
    setChanging(plan.code);
    setNotice(null);
    setError(null);
    try {
      await changeSubscriptionPlan(plan.code);
      await refreshSubscription();
      setNotice(`Plano ${plan.name} ativado. Seus limites já foram atualizados.`);
      addLog('success', 'Assinatura', `Plano alterado de ${current.name} para ${plan.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o plano.');
    } finally {
      setChanging(null);
    }
  }

  return <div className="space-y-7 pb-12">
    <header>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-[#0F172A]"><Building2 className="h-6 w-6" />Planos & Assinatura</h1>
      <p className="mt-1 text-sm text-[#6B6F7B]">Compare os planos, altere seu acesso e acompanhe os limites da operação.</p>
    </header>

    <section className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm text-violet-100">
      <div className="flex gap-3"><Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-300" /><div><p className="font-medium">Catálogo em pré-lançamento</p><p className="mt-1 text-violet-200/80">Você pode mudar de plano para testar os recursos. Nenhum checkout, renovação ou cobrança automática está ativo.</p></div></div>
    </section>

    {notice && <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}
    {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

    <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8E9ED] pb-4">
        <div><span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-600">{subscription.billingMode === 'preview' ? 'Acesso pré-lançamento' : subscription.status}</span><h2 className="mt-2 text-lg font-medium text-[#0F172A]">Plano {current.name}</h2><p className="text-sm text-[#6B6F7B]">Preço de tabela: {price(current)} — cobrança desativada</p><p className="mt-1 text-xs text-[#6B6F7B]">Limite de IA por produto: {subscription.iaGenerationsPerProductLimit == null ? 'sob medida' : `${subscription.iaGenerationsPerProductLimit.toLocaleString('pt-BR')}/mês`}</p></div>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{meters.map(([label, used, limit]) => <div key={label} className="rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4"><p className="text-xs text-[#6B6F7B]">{label}</p><p className="mt-2 text-base font-medium text-[#0F172A]">{used.toLocaleString('pt-BR')} / {limit.toLocaleString('pt-BR')}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F4F4F6]"><div className="h-full rounded-full bg-violet-500" style={{ width: `${usage(used, limit)}%` }} /></div></div>)}</div>
    </section>

    <section>
      <div className="mb-4"><h2 className="text-lg font-semibold text-[#0F172A]">Planos disponíveis</h2><p className="text-sm text-[#9CA3AF]">A troca é imediata durante o pré-lançamento. Seus dados e o consumo já realizado são preservados.</p></div>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{PLAN_CATALOG.map((plan) => <PlanCard key={plan.code} plan={plan} current={plan.code === subscription.planCode} changing={changing} onSelect={(selected) => void selectPlan(selected)} />)}</div>
    </section>
  </div>;
};
