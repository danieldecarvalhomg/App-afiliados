import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Campaign, AutomationRule } from '../types';
import { Megaphone, Zap, Plus, Play, Pause, TrendingUp, CheckCircle, Clock, Trash2, X, Check } from 'lucide-react';

export const CampaignsAutomationsView: React.FC = () => {
  const { campaigns, automations, addLog } = useApp();
  const [activeTab, setActiveTab] = useState<'campanhas' | 'automacoes'>('campanhas');
  const [campaignList, setCampaignList] = useState<Campaign[]>(campaigns);
  const [automationList, setAutomationList] = useState<AutomationRule[]>(automations);

  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isAutomationModalOpen, setIsAutomationModalOpen] = useState(false);

  // Campaign Form State
  const [campName, setCampName] = useState('');
  const [campType, setCampType] = useState<any>('Disparo Único');

  // Automation Form State
  const [autoName, setAutoName] = useState('');
  const [triggerCondition, setTriggerCondition] = useState('Desconto > 30% em Eletrônicos');
  const [autoAction, setAutoAction] = useState('Publicar no Telegram & WhatsApp');

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campName.trim()) return;

    const newCamp: Campaign = {
      id: 'camp-' + Date.now(),
      name: campName,
      type: campType,
      status: 'ativa',
      targetChannels: ['Telegram VIP', 'WhatsApp Promos'],
      totalSent: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      scheduledDate: new Date().toISOString()
    };

    setCampaignList(prev => [newCamp, ...prev]);
    addLog('success', 'Campanhas', `Nova campanha criada: "${newCamp.name}"`);
    setIsCampaignModalOpen(false);
    setCampName('');
  };

  const handleCreateAutomation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!autoName.trim()) return;

    const newAuto: AutomationRule = {
      id: 'auto-' + Date.now(),
      name: autoName,
      triggerCondition,
      action: autoAction,
      status: 'ativa',
      triggerCount: 0,
      lastTriggered: 'Nunca'
    };

    setAutomationList(prev => [newAuto, ...prev]);
    addLog('success', 'Automação', `Nova regra de automação criada: "${newAuto.name}"`);
    setIsAutomationModalOpen(false);
    setAutoName('');
  };

  const handleToggleCampaignStatus = (id: string) => {
    setCampaignList(prev => prev.map(c => c.id === id ? {
      ...c,
      status: c.status === 'ativa' ? 'pausada' : 'ativa'
    } : c));
  };

  const handleToggleAutomationStatus = (id: string) => {
    setAutomationList(prev => prev.map(a => a.id === id ? {
      ...a,
      status: a.status === 'ativa' ? 'pausada' : 'ativa'
    } : a));
  };

  const handleDeleteCampaign = (id: string) => {
    setCampaignList(prev => prev.filter(c => c.id !== id));
    addLog('info', 'Campanhas', `Campanha #${id} removida.`);
  };

  const handleDeleteAutomation = (id: string) => {
    setAutomationList(prev => prev.filter(a => a.id !== id));
    addLog('info', 'Automação', `Regra #${id} removida.`);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-indigo-400" />
            Campanhas & Automações Inteligentes
          </h1>
          <p className="text-xs text-slate-400">
            Crie disparos em massa agendados ou configure gatilhos automáticos de queda de preço e novos cupons.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveTab('campanhas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'campanhas' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Campanhas ({campaignList.length})
            </button>
            <button
              onClick={() => setActiveTab('automacoes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'automacoes' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Regras de Gatilho ({automationList.length})
            </button>
          </div>

          {activeTab === 'campanhas' ? (
            <button
              onClick={() => setIsCampaignModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              Nova Campanha
            </button>
          ) : (
            <button
              onClick={() => setIsAutomationModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" />
              Nova Regra
            </button>
          )}
        </div>
      </div>

      {activeTab === 'campanhas' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaignList.length === 0 ? (
            <div className="col-span-full py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
              <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
                <Megaphone className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">Nenhuma Campanha Cadastrada</h3>
                <p className="text-xs text-slate-400">
                  Crie campanhas de disparo em massa para promover suas ofertas nos canais vinculados.
                </p>
              </div>
              <button
                onClick={() => setIsCampaignModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar Primeira Campanha
              </button>
            </div>
          ) : (
            campaignList.map(camp => (
              <div key={camp.id} className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 space-y-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {camp.type}
                    </span>
                    <button
                      onClick={() => handleToggleCampaignStatus(camp.id)}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border capitalize transition-all ${
                        camp.status === 'ativa' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {camp.status}
                    </button>
                  </div>

                  <h3 className="text-sm font-bold text-white">{camp.name}</h3>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Disparos:</span>
                      <span className="font-bold text-white">{camp.totalSent}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Cliques:</span>
                      <span className="font-bold text-indigo-400">{camp.clicks}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Conversões:</span>
                      <span className="font-bold text-emerald-400">{camp.conversions}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Receita:</span>
                      <span className="font-bold text-emerald-400">R$ {camp.revenue.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end">
                  <button
                    onClick={() => handleDeleteCampaign(camp.id)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors text-xs flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {automationList.length === 0 ? (
            <div className="py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
              <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                <Zap className="w-7 h-7" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">Nenhuma Regra de Automação Cadastrada</h3>
                <p className="text-xs text-slate-400">
                  Configure regras automáticas de queda de preço, novos cupons ou ofertas relâmpago.
                </p>
              </div>
              <button
                onClick={() => setIsAutomationModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Criar Primeira Regra
              </button>
            </div>
          ) : (
            automationList.map(auto => (
              <div key={auto.id} className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">{auto.name}</h3>
                    <button
                      onClick={() => handleToggleAutomationStatus(auto.id)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase transition-all ${
                        auto.status === 'ativa' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {auto.status}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    <strong className="text-indigo-300">Gatilho:</strong> {auto.triggerCondition} → <strong className="text-emerald-300">Ação:</strong> {auto.action}
                  </p>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 text-xs text-slate-400">
                  <div>
                    <span>Disparado <strong className="text-white">{auto.triggerCount} vezes</strong></span>
                    <span className="block text-[10px] text-slate-500">Último disparo: {auto.lastTriggered}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteAutomation(auto.id)}
                    className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Campaign Modal */}
      {isCampaignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-indigo-400" />
                Nova Campanha de Afiliados
              </h3>
              <button onClick={() => setIsCampaignModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Nome da Campanha</label>
                <input
                  type="text"
                  value={campName}
                  onChange={e => setCampName(e.target.value)}
                  placeholder="ex: Ofertas Relâmpago Fim de Semana"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Tipo de Disparo</label>
                <select
                  value={campType}
                  onChange={e => setCampType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Disparo Único">Disparo Único Instantâneo</option>
                  <option value="Agendado">Agendado com Data & Hora</option>
                  <option value="Recorrente">Recorrente Diário</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCampaignModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md"
                >
                  Criar Campanha
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Automation Modal */}
      {isAutomationModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-400" />
                Nova Regra de Automação
              </h3>
              <button onClick={() => setIsAutomationModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAutomation} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Nome da Regra</label>
                <input
                  type="text"
                  value={autoName}
                  onChange={e => setAutoName(e.target.value)}
                  placeholder="ex: Auto Disparo Ofertas > 40% OFF"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Condição de Gatilho</label>
                <input
                  type="text"
                  value={triggerCondition}
                  onChange={e => setTriggerCondition(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-medium">Ação Automática</label>
                <input
                  type="text"
                  value={autoAction}
                  onChange={e => setAutoAction(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAutomationModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
                >
                  Criar Regra
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
