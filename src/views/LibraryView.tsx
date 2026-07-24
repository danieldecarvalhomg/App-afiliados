import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bookmark, Search, Layers, Copy, Trash2, FolderPlus, Star, Archive, Plus, X, Check } from 'lucide-react';

export const LibraryView: React.FC = () => {
  const { products, toggleFavoriteProduct, deleteProduct, updateProduct, addLog } = useApp();

  const [activeTab, setActiveTab] = useState<'favoritos' | 'colecoes' | 'arquivados'>('favoritos');
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [extraCollections, setExtraCollections] = useState<{ id: string; name: string; count: number }[]>([]);

  const favoriteProducts = products.filter(p => p.isFavorite && p.title.toLowerCase().includes(search.toLowerCase()));
  const archivedProducts = products.filter(p => p.isArchived);

  const initialCollections: { id: string; name: string; count: number }[] = [];

  const allCollections = [...initialCollections, ...extraCollections];

  const handleCreateCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionName.trim()) return;

    const newCol = {
      id: 'col-' + Date.now(),
      name: collectionName,
      count: 0
    };

    setExtraCollections(prev => [...prev, newCol]);
    addLog('success', 'Biblioteca', `Nova coleção criada: "${newCol.name}"`);
    setIsModalOpen(false);
    setCollectionName('');
  };

  const handleArchiveProduct = (id: string) => {
    updateProduct(id, { isArchived: true });
    addLog('info', 'Biblioteca', `Produto #${id} movido para os Arquivados.`);
  };

  const handleRestoreProduct = (id: string) => {
    updateProduct(id, { isArchived: false });
    addLog('info', 'Biblioteca', `Produto #${id} restaurado para o catálogo.`);
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Bookmark className="w-6 h-6 text-indigo-400" />
            Biblioteca & Organização de Acervo
          </h1>
          <p className="text-xs text-slate-400">
            Coleções personalizadas, itens favoritos, históricos de ofertas e ações de duplicação em massa.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
            <button
              onClick={() => setActiveTab('favoritos')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'favoritos' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Favoritos ({favoriteProducts.length})
            </button>
            <button
              onClick={() => setActiveTab('colecoes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'colecoes' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Coleções ({allCollections.length})
            </button>
            <button
              onClick={() => setActiveTab('arquivados')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'arquivados' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Arquivados ({archivedProducts.length})
            </button>
          </div>

          {activeTab === 'colecoes' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              <Plus className="w-4 h-4" />
              Nova Coleção
            </button>
          )}
        </div>
      </div>

      {activeTab === 'favoritos' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {favoriteProducts.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-slate-900/40 rounded-3xl border border-slate-800 text-xs text-slate-500">
              Nenhum produto marcado como favorito. Marque o ícone de estrela ⭐ nos produtos do catálogo!
            </div>
          ) : (
            favoriteProducts.map(p => (
              <div key={p.id} className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <img src={p.image} alt={p.title} className="w-full h-36 rounded-2xl object-cover" />
                  <h3 className="text-xs font-bold text-white line-clamp-2">{p.title}</h3>
                </div>
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                  <span className="font-bold text-emerald-400">R$ {p.price.toFixed(2)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleArchiveProduct(p.id)}
                      className="text-slate-400 hover:text-white text-[11px]"
                      title="Arquivar Produto"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => toggleFavoriteProduct(p.id)} className="text-rose-400 text-[11px] font-semibold">
                      Remover
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'colecoes' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {allCollections.map(col => (
            <div key={col.id} className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">{col.name}</h3>
              </div>
              <p className="text-xs text-slate-400">{col.count} ofertas vinculadas nesta coleção</p>
              <button
                onClick={() => addLog('info', 'Coleções', `Coleção "${col.name}" visualizada.`)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
              >
                Abrir Coleção
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'arquivados' && (
        <div className="space-y-4">
          {archivedProducts.length === 0 ? (
            <div className="text-xs text-slate-400 text-center py-12 bg-slate-900/40 rounded-3xl border border-slate-800">
              Nenhum item arquivado no momento.
            </div>
          ) : (
            archivedProducts.map(p => (
              <div key={p.id} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <img src={p.image} className="w-10 h-10 rounded-xl object-cover" />
                  <span className="font-bold text-white">{p.title}</span>
                </div>
                <button
                  onClick={() => handleRestoreProduct(p.id)}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px]"
                >
                  Restaurar ao Catálogo
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-indigo-400" />
                Nova Coleção de Ofertas
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCollection} className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome da Coleção</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ofertas do Dia do Consumidor"
                  value={collectionName}
                  onChange={e => setCollectionName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Criar Coleção
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
