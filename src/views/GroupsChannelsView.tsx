import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ChannelGroup } from '../types';
import { Send, MessageSquare, Disc, Users, Plus, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';

export const GroupsChannelsView: React.FC = () => {
  const { groups, setGroups, queues, addLog } = useApp();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupPlatform, setNewGroupPlatform] = useState<'Telegram' | 'WhatsApp' | 'Discord'>('Telegram');

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName) return;
    const newGroup: ChannelGroup = {
      id: 'chan-' + Date.now(),
      name: newGroupName,
      platform: newGroupPlatform,
      type: newGroupPlatform === 'Telegram' ? 'Canal' : 'Grupo',
      membersCount: 1500,
      status: 'conectado',
      dailyLimit: 50,
      currentDailyCount: 0
    };
    setGroups(prev => [...prev, newGroup]);
    setIsAddModalOpen(false);
    setNewGroupName('');
    addLog('success', 'Grupos', `Novo canal/grupo adicionado: ${newGroup.name}`);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Send className="w-6 h-6 text-cyan-400" />
            Gestão de Grupos & Canais de Transmissão
          </h1>
          <p className="text-xs text-slate-400">
            Conecte e atribua filas de disparo para seus canais no Telegram, WhatsApp, Discord, Instagram e Facebook.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Vincular Novo Canal / Grupo
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {groups.length === 0 ? (
          <div className="col-span-full py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
            <div className="w-14 h-14 rounded-3xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto border border-cyan-500/20">
              <Send className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-white">Nenhum Canal ou Grupo Vinculado</h3>
              <p className="text-xs text-slate-400">
                Conecte seus canais do Telegram, grupos do WhatsApp ou Discord para enviar ofertas em tempo real.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Vincular Primeiro Canal
            </button>
          </div>
        ) : (
          groups.map(grp => (
            <div key={grp.id} className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {grp.platform} • {grp.type}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Conectado
                </span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{grp.name}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  {grp.membersCount.toLocaleString('pt-BR')} membros ativos
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Limite Diário de Disparos:</span>
                  <span className="font-bold text-white">{grp.currentDailyCount} / {grp.dailyLimit}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full"
                    style={{ width: `${Math.min(100, (grp.currentDailyCount / grp.dailyLimit) * 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-bold text-white">Adicionar Grupo / Canal</h2>
            <form onSubmit={handleAddGroup} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">Nome do Canal / Grupo:</label>
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Ex: @promos_tech_vip"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-1">Plataforma:</label>
                <select
                  value={newGroupPlatform}
                  onChange={(e) => setNewGroupPlatform(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="Telegram">Telegram</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Discord">Discord</option>
                </select>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-xs">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
