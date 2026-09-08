import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { CRMLead } from '../types';
import { Users, Flame, Plus, Search, Trash2, ArrowLeft } from 'lucide-react';

export const CrmView: React.FC = () => {
  const { leads, addLead, updateLead, deleteLead } = useApp();
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

  const handleAddLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const newLead: Omit<CRMLead, 'id'> = {
      name,
      handleOrPhone: handleOrPhone || '@usuario',
      platform,
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      engagementScore: 75,
      totalClicks: 3,
      lastActive: 'Agora mesmo'
    };

    const saved = await addLead(newLead);
    if (!saved) return;
    setIsModalOpen(false);
    setName('');
    setHandleOrPhone('');
  };

  const handleDeleteLead = async (id: string) => {
    await deleteLead(id);
  };

  const handleBoostScore = async (id: string) => {
    const lead = leads.find(item => item.id === id);
    if (!lead) return;
    await updateLead(id, {
      engagementScore: lead.engagementScore + 10,
      totalClicks: lead.totalClicks + 1,
      lastActive: 'Agora mesmo',
    });
  };

  if (isModalOpen) {
    return (
      <div className="space-y-6 pb-12 text-[#0F172A]">
        <div className="flex items-center gap-2 text-xs text-[#9CA3AF] mb-4">
          <button onClick={() => setIsModalOpen(false)} className="hover:text-[#0F172A] flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
          <span>/</span>
          <span>CRM</span>
          <span>/</span>
          <span className="text-[#0F172A]">Novo Lead</span>
        </div>

        <div className="pb-4 border-b border-[#E8E9ED]">
          <h2 className="text-xl font-medium text-[#0F172A]">Cadastrar Novo Lead</h2>
        </div>

        <form onSubmit={handleAddLead} className="space-y-6 max-w-2xl">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-[#0F172A] border-b border-[#E8E9ED] pb-2">Informações do Contato</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[#6B6F7B]">Nome do Membro</label>
              <input
                type="text"
                required
                placeholder="Ex: Carlos Silva"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[#6B6F7B]">Telefone / Handle Telegram</label>
              <input
                type="text"
                required
                placeholder="Ex: @carlos_promos ou (11) 99999-8888"
                value={handleOrPhone}
                onChange={e => setHandleOrPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[#6B6F7B]">Plataforma Origem</label>
              <select
                value={platform}
                onChange={e => setPlatform(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
              >
                <option value="Telegram">Telegram</option>
                <option value="WhatsApp">WhatsApp</option>
                <option value="Discord">Discord</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-[#6B6F7B]">Tags de Interesse (separadas por vírgula)</label>
              <input
                type="text"
                placeholder="Ex: Tech, Smartphones, Cupons"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#F8FAFC] border border-[#E8E9ED] text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-[#E8E9ED]">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-transparent text-[#6B6F7B] hover:text-[#0F172A] text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#EDEDED] text-[#0F172A] hover:bg-white text-sm font-medium transition-colors"
            >
              Cadastrar Lead
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <Users className="w-6 h-6 text-[#0F172A]" />
            CRM de Afiliados
          </h1>
          <p className="text-sm text-[#6B6F7B] mt-1">
            Segmentação de membros engajados dos seus canais com tags e histórico de cliques.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-lg bg-[#EDEDED] hover:bg-white text-[#0F172A] text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Novo Lead
        </button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-[#9CA3AF] absolute left-4 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por nome, @handle, telefone ou tags..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg pl-11 pr-4 py-3 text-sm text-[#0F172A] placeholder-[#9CA3AF] focus:outline-none focus:border-[#D4D4D8] transition-colors"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#F8FAFC] text-[#9CA3AF] border-b border-[#E8E9ED] font-medium">
            <tr>
              <th className="p-4 font-medium">Membro / Contato</th>
              <th className="p-4 font-medium">Plataforma</th>
              <th className="p-4 font-medium">Tags</th>
              <th className="p-4 font-medium">Engajamento</th>
              <th className="p-4 font-medium">Cliques</th>
              <th className="p-4 font-medium">Última Atividade</th>
              <th className="p-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E9ED]">
            {filteredLeads.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[#9CA3AF] text-sm">
                  Nenhum lead encontrado. Clique em "Novo Lead" para cadastrar.
                </td>
              </tr>
            ) : (
              filteredLeads.map(lead => (
                <tr key={lead.id} className="hover:bg-[#F4F4F6] transition-colors">
                  <td className="p-4 font-medium text-[#0F172A]">
                    {lead.name}
                    <span className="block text-xs text-[#9CA3AF] font-normal">{lead.handleOrPhone}</span>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 rounded-md text-xs font-medium bg-[#F4F4F6] text-[#6B6F7B]">
                      {lead.platform}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-1">
                      {lead.tags.map((t, idx) => (
                        <span key={idx} className="px-2 py-1 rounded-md text-xs bg-[#F4F4F6] border border-[#E8E9ED] text-[#6B6F7B]">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-4 font-medium text-[#0F172A]">
                    <button
                      onClick={() => handleBoostScore(lead.id)}
                      title="Simular engajamento"
                      className="flex items-center gap-1 hover:text-[#6B6F7B] transition-colors"
                    >
                      <Flame className="w-4 h-4 text-[#9CA3AF]" />
                      {lead.engagementScore} pts
                    </button>
                  </td>
                  <td className="p-4 text-[#6B6F7B]">{lead.totalClicks}</td>
                  <td className="p-4 text-[#9CA3AF]">{lead.lastActive}</td>
                  <td className="p-4 text-right">
                    <button
                      onClick={() => handleDeleteLead(lead.id)}
                      className="p-2 rounded-lg bg-transparent text-[#9CA3AF] hover:text-[#EF4444] hover:bg-red-50 transition-colors"
                      title="Remover"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
