import React from 'react';
import { useApp } from '../context/AppContext';
import { BarChart3, TrendingUp, MousePointer, DollarSign, PieChart, ShoppingBag } from 'lucide-react';

export const AnalyticsView: React.FC = () => {
  const { products } = useApp();

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
          Analytics Deep Dive & Funil de Conversão
        </h1>
        <p className="text-xs text-slate-400">
          Relatórios detalhados de desempenho por canal, marketplace e categoria de produto.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-400">Telegram CTR Médio</span>
          <h2 className="text-2xl font-bold text-white">0.00%</h2>
          <span className="text-xs text-slate-500">Sem disparos realizados</span>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-400">WhatsApp Taxa de Leitura</span>
          <h2 className="text-2xl font-bold text-white">0.00%</h2>
          <span className="text-xs text-slate-500">Aguardando envios</span>
        </div>

        <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
          <span className="text-xs font-semibold text-slate-400">Comissão Média por Venda</span>
          <h2 className="text-2xl font-bold text-white">R$ 0,00</h2>
          <span className="text-xs text-slate-500">Sem vendas registradas</span>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
        <h2 className="text-base font-bold text-white">Desempenho por Marketplace de Origem</h2>
        <p className="text-xs text-slate-400">
          {products.length === 0 ? 'Cadastre seus produtos e ative os disparos para monitorar o desempenho por marketplace.' : 'Acompanhe a distribuição de cliques e comissões.'}
        </p>
        <div className="space-y-3 pt-2">
          {[
            { name: 'Amazon Brasil', share: 0, color: 'bg-amber-500' },
            { name: 'Mercado Livre', share: 0, color: 'bg-yellow-400' },
            { name: 'Shopee', share: 0, color: 'bg-orange-500' },
            { name: 'AliExpress', share: 0, color: 'bg-rose-500' },
          ].map((m, idx) => (
            <div key={idx} className="space-y-1 text-xs">
              <div className="flex justify-between font-bold text-slate-200">
                <span>{m.name}</span>
                <span>{m.share}% das vendas</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden">
                <div className={`h-full ${m.color} rounded-full`} style={{ width: `${m.share}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
