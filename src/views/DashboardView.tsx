import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  DollarSign,
  MousePointer,
  CheckCircle,
  TrendingUp,
  ShoppingBag,
  Megaphone,
  Zap,
  Send,
  Flame,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  Filter,
  Sparkles,
  ChevronRight,
  BarChart2,
  Calendar,
  Boxes,
  Plus
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { products, queueItems, queues, campaigns, automations, logs, setActiveTab } = useApp();
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');

  const userName = localStorage.getItem('user_profile_name') || 'Afiliado';
  const pendingCount = queueItems.filter(i => i.status === 'pendente').length;
  const activeQueuesCount = queues.filter(q => q.status === 'ativa').length;
  const activeAutomationsCount = automations.filter(a => a.status === 'ativa').length;

  return (
    <div className="space-y-8 pb-12">
      {/* Greeting & Quick Header Actions */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bem-vindo, {userName}</h1>
          <p className="text-slate-400 text-sm mt-1">Seu painel de automação de afiliados está ativo e pronto para uso.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('produtos')}
            className="px-4 py-2 bg-indigo-600 rounded-lg text-xs font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition-all flex items-center gap-2"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            + Nova Oferta
          </button>
          <button
            onClick={() => setActiveTab('ia')}
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-all flex items-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Criar com IA
          </button>
        </div>
      </div>

      {products.length === 0 && (
        <div className="p-8 rounded-3xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/40 border border-slate-800 space-y-4 relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Primeiros Passos
              </span>
              <h2 className="text-lg font-bold text-white">Tudo Pronto para Começar Suas Vendas!</h2>
              <p className="text-xs text-slate-400 max-w-2xl">
                Comece cadastrando a sua primeira oferta ou colando o link do produto para que a nossa Inteligência Artificial gere os textos e agende as postagens nos seus canais.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('produtos')}
              className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all shrink-0"
            >
              Cadastrar 1ª Oferta
            </button>
          </div>
        </div>
      )}

      {/* Key Stats Grid - ZERO values for first-time user */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Receita Estimada */}
        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl backdrop-blur-md hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Receita Estimada</div>
            <span className="text-slate-500 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-semibold">0.0%</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">R$ 0,00</div>
          <div className="text-[10px] text-slate-500 mt-2">Vs. R$ 0,00 (mês anterior)</div>
        </div>

        {/* Total Cliques */}
        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl backdrop-blur-md hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Cliques</div>
            <span className="text-slate-500 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-semibold">0.0%</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">0</div>
          <div className="text-[10px] text-slate-500 mt-2">Nenhum clique registrado</div>
        </div>

        {/* Conversão (CTR) */}
        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl backdrop-blur-md hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Conversão (CTR)</div>
            <span className="text-slate-500 text-[10px] bg-slate-800 px-1.5 py-0.5 rounded font-semibold">0.0%</span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">0.00%</div>
          <div className="w-full h-1 bg-white/5 rounded-full mt-3 overflow-hidden">
            <div className="w-0 h-full bg-indigo-500"></div>
          </div>
        </div>

        {/* Automações Ativas */}
        <div className="p-5 bg-white/[0.03] border border-white/5 rounded-2xl backdrop-blur-md hover:border-white/10 transition-all">
          <div className="flex justify-between items-start">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Automações Ativas</div>
            <span className="flex h-2 w-2 rounded-full bg-slate-600 mt-1"></span>
          </div>
          <div className="text-2xl font-bold text-white mt-2">{activeAutomationsCount} / {automations.length}</div>
          <div className="text-[10px] text-slate-500 mt-2">{pendingCount} agendadas para disparo</div>
        </div>
      </div>

      {/* Main Row: Queue & Integrations Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Queue Monitor & Growth Bar Section */}
        <div className="lg:col-span-8 bg-white/[0.02] border border-white/5 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h3 className="font-bold text-lg text-white">Monitoramento de Filas Inteligentes</h3>
              <p className="text-xs text-slate-400">Desempenho de automação e filas de disparo em tempo real.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-bold text-indigo-300 rounded-full">STATUS ATIVO</span>
            </div>
          </div>

          {/* Queue Items List or Empty State */}
          {queues.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
              <Boxes className="w-8 h-8 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-white">Nenhuma fila de disparo criada ainda</h4>
                <p className="text-[11px] text-slate-400">Crie filas de envio para automatizar postagens no Telegram e WhatsApp.</p>
              </div>
              <button
                onClick={() => setActiveTab('filas')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Criar Primeira Fila
              </button>
            </div>
          ) : (
            <div className="space-y-3 z-10">
              <div className="grid grid-cols-5 text-[10px] uppercase font-bold text-slate-500 px-4 border-b border-white/5 pb-2">
                <div className="col-span-2">NOME DA FILA</div>
                <div>STATUS</div>
                <div>PENDENTE</div>
                <div className="text-right">AÇÃO</div>
              </div>

              {queues.map((q) => (
                <div
                  key={q.id}
                  className="grid grid-cols-5 items-center px-4 py-3 bg-white/[0.03] rounded-xl hover:bg-white/[0.05] transition-colors border border-transparent hover:border-white/10"
                >
                  <div className="col-span-2 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                      {(q.platform || q.channelName || 'Fila').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">{q.name}</div>
                      <div className="text-[9px] text-slate-500">Intervalo: {q.intervalMinutes}m • {q.channelName}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${q.status === 'ativa' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                    <span className="text-[10px] text-emerald-400 uppercase font-bold">{q.status}</span>
                  </div>

                  <div className="text-xs font-mono text-slate-200">
                    {queueItems.filter(i => i.queueConfigId === q.id && i.status === 'pendente').length} itens
                  </div>

                  <div className="text-right">
                    <button
                      onClick={() => setActiveTab('filas')}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider"
                    >
                      GERENCIAR
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Volume Chart Graphic Placeholder (Clean 0 Disparos) */}
          <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase font-bold">Volume de Disparos por Horário</span>
            <span className="text-xs font-mono text-slate-400">0 disparos / hr</span>
          </div>
        </div>

        {/* Right Side Widgets */}
        <div className="lg:col-span-4 space-y-6">
          {/* Marketplaces Quick Status */}
          <div className="p-6 bg-white/[0.02] border border-white/5 rounded-3xl space-y-4">
            <h3 className="font-bold text-sm text-white">Marketplaces & Integrações</h3>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="font-bold text-slate-300">Amazon Brasil</span>
                <button onClick={() => setActiveTab('integracoes')} className="text-[10px] text-indigo-400 font-bold">Configurar</button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="font-bold text-slate-300">Mercado Livre</span>
                <button onClick={() => setActiveTab('integracoes')} className="text-[10px] text-indigo-400 font-bold">Configurar</button>
              </div>
              <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                <span className="font-bold text-slate-300">Shopee Oficial</span>
                <button onClick={() => setActiveTab('integracoes')} className="text-[10px] text-indigo-400 font-bold">Configurar</button>
              </div>
            </div>
          </div>

          {/* AI Strategy Suggestion Box */}
          <div className="p-6 bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/20 rounded-3xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Destaque IA do Dia</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              "Cadastre suas ofertas no catálogo para que o motor de Inteligência Artificial sugira horários de pico e gere copies otimizadas."
            </p>
            <button
              onClick={() => setActiveTab('ia')}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all"
            >
              CRIAR COM IA
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
