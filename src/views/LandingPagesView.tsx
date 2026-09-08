import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LandingPageItem } from '../types';
import { Globe, Eye, MousePointer, ExternalLink, Plus, Sparkles, Copy, Check, Trash2, X, ArrowLeft } from 'lucide-react';

export const LandingPagesView: React.FC = () => {
  const { landingPages, addLog } = useApp();
  const [pages, setPages] = useState<LandingPageItem[]>(landingPages);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  const handleCopyLink = (lp: LandingPageItem) => {
    navigator.clipboard.writeText(`https://afilihub.com/page/${lp.slug}`);
    setCopiedId(lp.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreatePage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newPage: LandingPageItem = {
      id: 'lp-' + Date.now(),
      title,
      slug: slug.trim() || title.toLowerCase().replace(/\s+/g, '-'),
      views: 0,
      clicks: 0,
      conversionRate: 0,
      activeProductsCount: 1,
      status: 'publicada',
      updatedAt: new Date().toISOString()
    };

    setPages(prev => [newPage, ...prev]);
    addLog('success', 'Landing Pages', `Nova landing page criada: "${newPage.title}" (/page/${newPage.slug})`);
    setIsCreating(false);
    setTitle('');
    setSlug('');
  };

  const handleDeletePage = (id: string) => {
    setPages(prev => prev.filter(p => p.id !== id));
    addLog('info', 'Landing Pages', `Landing page #${id} removida.`);
  };

  if (isCreating) {
    return (
      <div className="space-y-6 pb-12">
        <div className="flex items-center gap-2 text-sm text-[#6B6F7B]">
          <button onClick={() => setIsCreating(false)} className="hover:text-[#0F172A] flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <span>&gt;</span>
          <span>Landing Pages</span>
          <span>&gt;</span>
          <span className="text-[#0F172A]">Nova Página</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E8E9ED] rounded-xl p-6">
          <h2 className="text-lg font-medium text-[#0F172A] mb-6 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#6B6F7B]" />
            Nova Landing Page
          </h2>

          <form onSubmit={handleCreatePage} className="space-y-6">
            <div className="space-y-4">
              <div className="border-b border-[#E8E9ED] pb-2">
                <h3 className="text-sm font-medium text-[#0F172A]">Informações da Página</h3>
              </div>

              <div>
                <label className="text-sm text-[#6B6F7B] block mb-1">Título da Página</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Achadinhos da Semana"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
                />
              </div>

              <div>
                <label className="text-sm text-[#6B6F7B] block mb-1">Slug de URL (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: achadinhos-semana"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  className="w-full bg-[#F8FAFC] border border-[#E8E9ED] rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-[#D4D4D8]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-[#E8E9ED]">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 bg-transparent text-[#6B6F7B] hover:text-[#0F172A] rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[#EDEDED] hover:bg-white text-[#0F172A] rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Criar Landing Page
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A] tracking-tight flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-[#0F172A]" />
            Landing Pages & Links
          </h1>
          <p className="text-sm text-[#6B6F7B] mt-1">
            Crie páginas para bio do Instagram e WhatsApp com links de afiliados.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 rounded-lg bg-[#EDEDED] hover:bg-white text-[#0F172A] text-sm font-medium flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Landing Page
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {pages.length === 0 ? (
          <div className="col-span-full py-16 px-6 text-center space-y-4 bg-[#FFFFFF] rounded-xl border border-[#E8E9ED]">
            <div className="w-14 h-14 rounded-full bg-[#F4F4F6] text-[#0F172A] flex items-center justify-center mx-auto border border-[#E8E9ED]">
              <Globe className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-medium text-[#0F172A]">Nenhuma Landing Page Criada</h3>
              <p className="text-sm text-[#6B6F7B]">
                Crie páginas para links na bio com botões diretos de afiliados.
              </p>
            </div>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 rounded-lg bg-[#EDEDED] hover:bg-white text-[#0F172A] text-sm font-medium inline-flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar Primeira Página
            </button>
          </div>
        ) : (
          pages.map(lp => (
            <div key={lp.id} className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] space-y-4 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[#6B6F7B] font-mono">/page/{lp.slug}</span>
                  <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-[#F4F4F6] text-[#6B6F7B] uppercase">
                    {lp.status}
                  </span>
                </div>

              <h3 className="text-base font-medium text-[#0F172A]">{lp.title}</h3>

              <div className="grid grid-cols-3 gap-2 p-4 rounded-xl bg-[#F8FAFC] border border-[#E8E9ED] text-sm">
                <div>
                  <span className="text-[#9CA3AF] block text-xs mb-1">Visualizações</span>
                  <span className="font-medium text-[#0F172A]">{lp.views.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] block text-xs mb-1">Cliques</span>
                  <span className="font-medium text-[#0F172A]">{lp.clicks.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-[#9CA3AF] block text-xs mb-1">Conversão</span>
                  <span className="font-medium text-emerald-600">{lp.conversionRate}%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-[#E8E9ED]">
              <button
                onClick={() => handleCopyLink(lp)}
                className="px-3 py-1.5 rounded-lg bg-transparent border border-[#E8E9ED] hover:border-[#D4D4D8] text-[#0F172A] text-sm font-medium flex items-center gap-1.5 transition-colors"
              >
                {copiedId === lp.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copiedId === lp.id ? 'Copiado!' : 'Copiar Link'}
              </button>
              <button
                onClick={() => handleDeletePage(lp.id)}
                className="p-1.5 rounded-lg bg-transparent border border-red-200 hover:bg-red-50 text-[#EF4444] transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))
      )}
      </div>
    </div>
  );
};
