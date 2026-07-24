import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Search, ShoppingBag, ListOrdered, Boxes, Wand2, ArrowRight, X } from 'lucide-react';

export const GlobalSearchModal: React.FC = () => {
  const { isSearchOpen, setIsSearchOpen, products, queues, integrations, templates, setActiveTab } = useApp();
  const [query, setQuery] = useState('');

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setIsSearchOpen]);

  if (!isSearchOpen) return null;

  const filteredProducts = products.filter(p =>
    p.title.toLowerCase().includes(query.toLowerCase()) ||
    p.category.toLowerCase().includes(query.toLowerCase()) ||
    p.marketplace.toLowerCase().includes(query.toLowerCase())
  );

  const filteredQueues = queues.filter(q =>
    q.name.toLowerCase().includes(query.toLowerCase()) ||
    q.channelName.toLowerCase().includes(query.toLowerCase())
  );

  const filteredIntegrations = integrations.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase())
  );

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(query.toLowerCase()) ||
    t.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleNavigate = (tab: string) => {
    setActiveTab(tab);
    setIsSearchOpen(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-[#050506]/80 backdrop-blur-md">
      <div className="w-full max-w-2xl rounded-2xl bg-[#0a0a0b] border border-white/10 shadow-2xl overflow-hidden backdrop-blur-2xl">
        {/* Search Header */}
        <div className="p-4 border-b border-white/5 flex items-center gap-3">
          <Search className="w-5 h-5 text-indigo-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para buscar produtos, filas, integrações ou templates..."
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {query.trim() === '' ? (
            <div className="py-8 text-center space-y-2">
              <p className="text-xs text-slate-400">Sugestões rápidas de navegação:</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={() => handleNavigate('produtos')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-600/20 text-xs text-slate-300 hover:text-indigo-400 transition-colors border border-white/5"
                >
                  📦 Ver Produtos em Alta
                </button>
                <button
                  onClick={() => handleNavigate('filas')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-600/20 text-xs text-slate-300 hover:text-indigo-400 transition-colors border border-white/5"
                >
                  ⚡ Gerenciar Filas Inteligentes
                </button>
                <button
                  onClick={() => handleNavigate('ia')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-600/20 text-xs text-slate-300 hover:text-indigo-400 transition-colors border border-white/5"
                >
                  ✨ Criar Cópia com IA
                </button>
                <button
                  onClick={() => handleNavigate('integracoes')}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-600/20 text-xs text-slate-300 hover:text-indigo-400 transition-colors border border-white/5"
                >
                  🔌 Status das Integrações
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Products Match */}
              {filteredProducts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5 text-indigo-400" />
                    Produtos ({filteredProducts.length})
                  </div>
                  {filteredProducts.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleNavigate('produtos')}
                      className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/10 flex items-center justify-between cursor-pointer transition-colors border border-white/5"
                    >
                      <div className="flex items-center gap-3">
                        <img src={p.image} alt={p.title} className="w-8 h-8 rounded-lg object-cover" />
                        <div>
                          <p className="text-xs font-medium text-slate-200 line-clamp-1">{p.title}</p>
                          <p className="text-[10px] text-slate-400">{p.marketplace} • R$ {p.price.toFixed(2)}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  ))}
                </div>
              )}

              {/* Queues Match */}
              {filteredQueues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <ListOrdered className="w-3.5 h-3.5 text-emerald-400" />
                    Filas de Postagem ({filteredQueues.length})
                  </div>
                  {filteredQueues.map(q => (
                    <div
                      key={q.id}
                      onClick={() => handleNavigate('filas')}
                      className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/10 flex items-center justify-between cursor-pointer transition-colors border border-white/5"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-200">{q.name}</p>
                        <p className="text-[10px] text-slate-400">{q.platform} • {q.channelName}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  ))}
                </div>
              )}

              {/* Integrations Match */}
              {filteredIntegrations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-cyan-400" />
                    Integrações ({filteredIntegrations.length})
                  </div>
                  {filteredIntegrations.map(i => (
                    <div
                      key={i.id}
                      onClick={() => handleNavigate('integracoes')}
                      className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/10 flex items-center justify-between cursor-pointer transition-colors border border-white/5"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-200">{i.name}</p>
                        <p className="text-[10px] text-slate-400">{i.description}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  ))}
                </div>
              )}

              {/* Templates Match */}
              {filteredTemplates.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-violet-400" />
                    Templates IA ({filteredTemplates.length})
                  </div>
                  {filteredTemplates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => handleNavigate('ia')}
                      className="p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/10 flex items-center justify-between cursor-pointer transition-colors border border-white/5"
                    >
                      <div>
                        <p className="text-xs font-medium text-slate-200">{t.title}</p>
                        <p className="text-[10px] text-slate-400">Categoria: {t.category}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#050506] border-t border-white/5 flex items-center justify-between text-[11px] text-slate-500">
          <span>Pressione <kbd className="font-mono text-slate-400">ESC</kbd> para fechar</span>
          <span>Navegação com teclado disponível</span>
        </div>
      </div>
    </div>
  );
};
