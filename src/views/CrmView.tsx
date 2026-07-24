import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CRMLead } from '../types';
import { Users, Phone, Send, Tag, Flame, Plus, Search, Trash2, Sparkles, X, Check } from 'lucide-react';

export const CrmView: React.FC = () => {
  const { leads, setLeads, addLog } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [handleOrPhone, setHandleOrPhone] = useState('');
  const [platform, setPlatform] = useState<'Telegram' | 'WhatsApp' | 'Discord'>('Telegram');
  const [tagsInput, setTagsInput] = useState('Tech, Promos');

  const filteredLeads = leads.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.handleOrPhone.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const handleAddLead = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newLead: CRMLead = {
      id: 'lead-' + Date.now(),
      name,
      handleOrPhone: handleOrPhone || '@usuario',
      platform,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      engagementScore: 75,
      totalClicks: 3,
      lastActive: 'Agora mesmo'
    };

    setLeads(prev => [newLead, ...prev]);
    addLog('success', 'CRM VIP', `Novo lead cadastrado: "${newLead.name}" (${newLead.platform})`);
    setIsModalOpen(false);
    setName('');
    setHandleOrPhone('');
  };

  const handleDeleteLead = (id: string) => {
    setLeads(prev => prev.filter(l => l.id !== id));
    addLog('info', 'CRM VIP', `Lead #${id} removido da lista VIP.`);
  };

  const handleBoostScore = (id: string) => {
    setLeads(prev => prev.map(l => l.id === id ? {
      ...l,
      engagementScore: l.engagementScore + 10,
      totalClicks: l.totalClicks + 1,
      lastActive: 'Agora mesmo'
    } : l));
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-violet-400" />
            CRM de Afiliados & Gestão de Contatos VIP
          </h1>
          <p className="text-xs text-slate-400">
            Segmentação de membros engajados dos seus canais de Telegram e WhatsApp com tags e histórico de cliques.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:scale-105 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Novo Lead VIP
        </button>
      </div>

      {/* Search Filter Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por nome, @handle, telefone ou tags de interesse..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
        />
      </div>

      {/* Table of Leads */}
      <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/90 shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-semibold">
            <tr>
              <th className="p-4">Membro / Contato</th>
              <th className="p-4">Plataforma</th>
              <th className="p-4">Tags de Interesse</th>
              <th className="p-4">Score Engajamento</th>
              <th className="p-4">Total Cliques</th>
              <th className="p-4">Última Atividade</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                  Nenhum lead encontrado. Clique em "Novo Lead VIP" para cadastrar!
                </td>
              </tr>
            ) : (
              filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-4 font-bold text-white">
                    {lead.name}
                    <span className="block text-[11px] font-mono text-slate-400 font-normal">{lead.handleOrPhone}</span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      lead.platform === 'Telegram' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}>
                      {lead.platform}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.map((t, idx) => (
                        <span key={idx} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 font-bold text-amber-400">
                    <button
                      onClick={() => handleBoostScore(lead.id)}
                      title="Clique para simular novo engajamento"
                      className="flex items-center gap-1 hover:underline hover:scale-105 transition-all"
                    >
                      <Flame className="w-3.5 h-3.5" />
                      {lead.engagementScore} pts
                    </button>
                  </td>
                  <td className="p-4 font-bold text-emerald-400">{lead.totalClicks} cliques</td>
                  <td className="p-4 text-slate-400">{lead.lastActive}</td>
                  <td className="p-4 text-right space-x-2">
                    <button
                      onClick={() => handleDeleteLead(lead.id)}
                      className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                      title="Remover Lead"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Add Lead */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-400" />
                Novo Lead VIP
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddLead} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome do Membro</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carlos Silva"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Telefone / Handle Telegram</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: @carlos_promos ou (11) 99999-8888"
                  value={handleOrPhone}
                  onChange={e => setHandleOrPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Plataforma Origem</label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Telegram">Telegram</option>
                  <option value="WhatsApp">WhatsApp</option>
                  <option value="Discord">Discord</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Tags de Interesse (separadas por vírgula)</label>
                <input
                  type="text"
                  placeholder="Ex: Tech, Smartphones, Cupons"
                  value={tagsInput}
                  onChange={e => setTagsInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                <Check className="w-4 h-4" />
                Cadastrar Lead
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
