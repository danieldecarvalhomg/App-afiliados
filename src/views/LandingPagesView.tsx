import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { LandingPageItem } from '../types';
import { Globe, Eye, MousePointer, ExternalLink, Plus, Sparkles, Copy, Check, Trash2, X } from 'lucide-react';

export const LandingPagesView: React.FC = () => {
  const { landingPages, addLog } = useApp();
  const [pages, setPages] = useState<LandingPageItem[]>(landingPages);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  const handleCopyLink = (lp: LandingPageItem) => {
    navigator.clipboard.writeText(`https://affiflow.ai/page/${lp.slug}`);
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
      status: 'ativa',
      createdAt: new Date().toISOString()
    };

    setPages(prev => [newPage, ...prev]);
    addLog('success', 'Landing Pages', `Nova landing page criada: "${newPage.title}" (/page/${newPage.slug})`);
    setIsModalOpen(false);
    setTitle('');
    setSlug('');
  };

  const handleDeletePage = (id: string) => {
    setPages(prev => prev.filter(p => p.id !== id));
    addLog('info', 'Landing Pages', `Landing page #${id} removida.`);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-indigo-400" />
            Landing Pages & Bio Links de Ofertas
          </h1>
          <p className="text-xs text-slate-400">
            Crie páginas de alta velocidade para bio do Instagram e WhatsApp com contagem regressiva e botões diretos de afiliados.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Nova Landing Page
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {pages.length === 0 ? (
          <div className="col-span-full py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
            <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
              <Globe className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-white">Nenhuma Landing Page Criada</h3>
              <p className="text-xs text-slate-400">
                Crie páginas de alta velocidade para bio do Instagram e WhatsApp com contagem regressiva e links de afiliados.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Criar Primeira Página
            </button>
          </div>
        ) : (
          pages.map(lp => (
            <div key={lp.id} className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-400 font-mono">/page/{lp.slug}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
                    {lp.status}
                  </span>
                </div>

              <h3 className="text-base font-bold text-white">{lp.title}</h3>

              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">Visualizações:</span>
                  <span className="font-bold text-white">{lp.views.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Cliques:</span>
                  <span className="font-bold text-indigo-400">{lp.clicks.toLocaleString('pt-BR')}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px]">Conversão:</span>
                  <span className="font-bold text-emerald-400">{lp.conversionRate}%</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => handleCopyLink(lp)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5"
              >
                {copiedId === lp.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedId === lp.id ? 'Copiado!' : 'Copiar Link'}
              </button>
              <button
                onClick={() => handleDeletePage(lp.id)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))
      )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                Nova Landing Page de Bio
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePage} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Título da Página</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Achadinhos Tech da Semana"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Slug de URL (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: achadinhos-tech"
                  value={slug}
                  onChange={e => setSlug(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Criar Landing Page
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
