import React from 'react';
import { useApp } from '../context/AppContext';
import { Building2, ShieldCheck, CreditCard, Flame, Users, CheckCircle2 } from 'lucide-react';

export const TeamSubscriptionView: React.FC = () => {
  const { subscription } = useApp();

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <Building2 className="w-6 h-6 text-indigo-400" />
          Gestão de Equipe & Plano de Assinatura
        </h1>
        <p className="text-xs text-slate-400">
          Gerencie permissões da sua equipe de copilotos e monitore limites de disparos e gerações de IA.
        </p>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
              {subscription.status}
            </span>
            <h2 className="text-lg font-bold text-white mt-1">{subscription.name}</h2>
            <p className="text-xs text-slate-400">Renovação programada para {subscription.renewalDate}</p>
          </div>
          <span className="text-xl font-extrabold text-emerald-400">R$ {subscription.priceMonthly.toFixed(2)}/mês</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-slate-400">Disparos em Filas:</span>
            <div className="text-base font-bold text-white">{subscription.disparosUsed} / {subscription.disparosLimit}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(subscription.disparosUsed / subscription.disparosLimit) * 100}%` }}></div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-slate-400">Gerações de IA Gemini:</span>
            <div className="text-base font-bold text-white">{subscription.iaGenerationsUsed} / {subscription.iaGenerationsLimit}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(subscription.iaGenerationsUsed / subscription.iaGenerationsLimit) * 100}%` }}></div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
            <span className="text-slate-400">Canais Conectados:</span>
            <div className="text-base font-bold text-white">{subscription.canaisUsed} / {subscription.canaisLimit}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${(subscription.canaisUsed / subscription.canaisLimit) * 100}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
