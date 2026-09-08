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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-[#F8FAFC]/80">
      <div className="w-full max-w-2xl rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] shadow-2xl overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-[#E8E9ED] flex items-center gap-3 bg-[#F8FAFC]">
          <Search className="w-5 h-5 text-[#6B6F7B]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite para buscar produtos, filas, integrações ou templates..."
            className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#9CA3AF] focus:outline-none"
            autoFocus
          />
          <button
            onClick={() => setIsSearchOpen(false)}
            className="p-1.5 text-[#9CA3AF] hover:text-[#0F172A] rounded-lg hover:bg-[#F4F4F6] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-4">
          {query.trim() === '' ? (
            <div className="py-8 text-center space-y-4">
              <p className="text-xs text-[#6B6F7B]">Sugestões rápidas de navegação:</p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                <button
                  onClick={() => handleNavigate('produtos')}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F4F6] hover:bg-[#F4F4F6] text-xs text-[#0F172A] border border-[#E8E9ED] hover:border-[#D4D4D8] transition-colors"
                >
                  📦 Ver Produtos em Alta
                </button>
                <button
                  onClick={() => handleNavigate('filas')}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F4F6] hover:bg-[#F4F4F6] text-xs text-[#0F172A] border border-[#E8E9ED] hover:border-[#D4D4D8] transition-colors"
                >
                  ⚡ Gerenciar Filas
                </button>
                <button
                  onClick={() => handleNavigate('ia')}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F4F6] hover:bg-[#F4F4F6] text-xs text-[#0F172A] border border-[#E8E9ED] hover:border-[#D4D4D8] transition-colors"
                >
                  ✨ Criar Cópia
                </button>
                <button
                  onClick={() => handleNavigate('integracoes')}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F4F6] hover:bg-[#F4F4F6] text-xs text-[#0F172A] border border-[#E8E9ED] hover:border-[#D4D4D8] transition-colors"
                >
                  🔌 Integrações
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Products Match */}
              {filteredProducts.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-medium text-[#6B6F7B] uppercase flex items-center gap-1.5">
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Produtos ({filteredProducts.length})
                  </div>
                  {filteredProducts.slice(0, 3).map(p => (
                    <div
                      key={p.id}
                      onClick={() => handleNavigate('produtos')}
                      className="p-3 rounded-lg bg-transparent hover:bg-[#F4F4F6] flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-[#E8E9ED]"
                    >
                      <div className="flex items-center gap-3">
                        <img src={p.image} alt={p.title} className="w-8 h-8 rounded object-cover" />
                        <div>
                          <p className="text-xs font-medium text-[#0F172A] line-clamp-1">{p.title}</p>
                          <p className="text-[10px] text-[#6B6F7B]">{p.marketplace} • R$ {p.price.toFixed(2)}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    </div>
                  ))}
                </div>
              )}

              {/* Queues Match */}
              {filteredQueues.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-medium text-[#6B6F7B] uppercase flex items-center gap-1.5">
                    <ListOrdered className="w-3.5 h-3.5" />
                    Filas de Postagem ({filteredQueues.length})
                  </div>
                  {filteredQueues.map(q => (
                    <div
                      key={q.id}
                      onClick={() => handleNavigate('filas')}
                      className="p-3 rounded-lg bg-transparent hover:bg-[#F4F4F6] flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-[#E8E9ED]"
                    >
                      <div>
                        <p className="text-xs font-medium text-[#0F172A]">{q.name}</p>
                        <p className="text-[10px] text-[#6B6F7B]">{q.platform} • {q.channelName}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    </div>
                  ))}
                </div>
              )}

              {/* Integrations Match */}
              {filteredIntegrations.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-medium text-[#6B6F7B] uppercase flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5" />
                    Integrações ({filteredIntegrations.length})
                  </div>
                  {filteredIntegrations.map(i => (
                    <div
                      key={i.id}
                      onClick={() => handleNavigate('integracoes')}
                      className="p-3 rounded-lg bg-transparent hover:bg-[#F4F4F6] flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-[#E8E9ED]"
                    >
                      <div>
                        <p className="text-xs font-medium text-[#0F172A]">{i.name}</p>
                        <p className="text-[10px] text-[#6B6F7B]">{i.description}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    </div>
                  ))}
                </div>
              )}

              {/* Templates Match */}
              {filteredTemplates.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-medium text-[#6B6F7B] uppercase flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" />
                    Templates IA ({filteredTemplates.length})
                  </div>
                  {filteredTemplates.map(t => (
                    <div
                      key={t.id}
                      onClick={() => handleNavigate('ia')}
                      className="p-3 rounded-lg bg-transparent hover:bg-[#F4F4F6] flex items-center justify-between cursor-pointer transition-colors border border-transparent hover:border-[#E8E9ED]"
                    >
                      <div>
                        <p className="text-xs font-medium text-[#0F172A]">{t.title}</p>
                        <p className="text-[10px] text-[#6B6F7B]">Categoria: {t.category}</p>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#F8FAFC] border-t border-[#E8E9ED] flex items-center justify-between text-[11px] text-[#9CA3AF]">
          <span>Pressione <kbd className="font-mono text-[#6B6F7B] bg-[#F4F4F6] px-1 rounded border border-[#E8E9ED]">ESC</kbd> para fechar</span>
          <span>Navegação com teclado disponível</span>
        </div>
      </div>
    </div>
  );
};
