import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Bookmark, Search, Layers, Copy, Trash2, FolderPlus, Star, Archive, Plus, X, Check, ArrowLeft } from 'lucide-react';

export const LibraryView: React.FC = () => {
  const {
    products,
    productCollections,
    toggleFavoriteProduct,
    updateProduct,
    addLog,
    addProductCollection,
    deleteProductCollection,
    toggleProductInCollection,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'favoritos' | 'colecoes' | 'arquivados'>('favoritos');
  const [search, setSearch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);

  const favoriteProducts = products.filter(p => p.isFavorite && p.title.toLowerCase().includes(search.toLowerCase()));
  const archivedProducts = products.filter(p => p.isArchived);

  const selectedCollection = productCollections.find(collection => collection.id === selectedCollectionId) ?? null;

  const handleCreateCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionName.trim()) return;

    const saved = await addProductCollection(collectionName);
    if (!saved) return;
    setIsCreating(false);
    setCollectionName('');
  };

  if (selectedCollection) {
    return (
      <div className="space-y-6 pb-12">
        <button onClick={() => setSelectedCollectionId(null)} className="flex items-center gap-1 text-sm text-[#6B6F7B] hover:text-[#0F172A]">
          <ArrowLeft className="h-4 w-4" /> Voltar para coleções
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-[#0F172A]">{selectedCollection.name}</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">Selecione os produtos que devem fazer parte desta coleção.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-10 text-center text-sm text-[#6B6F7B]">
              Cadastre produtos antes de montar uma coleção.
            </div>
          ) : products.map(product => {
            const selected = selectedCollection.productIds.includes(product.id);
            return (
              <button
                key={product.id}
                onClick={() => void toggleProductInCollection(selectedCollection.id, product.id)}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-[#EDEDED] bg-[#F4F4F6]' : 'border-[#E8E9ED] bg-[#FFFFFF] hover:border-[#D4D4D8]'}`}
              >
                <img src={product.image} alt={product.title} className="h-14 w-14 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 text-sm text-[#0F172A] line-clamp-2">{product.title}</span>
                <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-[#EDEDED] bg-[#EDEDED] text-[#111]' : 'border-[#6B6F7B]'}`}>
                  {selected && <Check className="h-3.5 w-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const handleArchiveProduct = (id: string) => {
    updateProduct(id, { isArchived: true });
    addLog('info', 'Biblioteca', `Produto #${id} movido para os Arquivados.`);
  };

  const handleRestoreProduct = (id: string) => {
    updateProduct(id, { isArchived: false });
    addLog('info', 'Biblioteca', `Produto #${id} restaurado para o catálogo.`);
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
          <span>Biblioteca</span>
          <span>&gt;</span>
          <span className="text-[#0F172A]">Nova Coleção</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E8E9ED] rounded-xl p-6">
          <h2 className="text-lg font-medium text-[#0F172A] mb-6 flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-[#6B6F7B]" />
            Nova Coleção de Ofertas
          </h2>

          <form onSubmit={handleCreateCollection} className="space-y-6">
            <div className="space-y-4">
              <div className="border-b border-[#E8E9ED] pb-2">
                <h3 className="text-sm font-medium text-[#0F172A]">Detalhes da Coleção</h3>
              </div>

              <div>
                <label className="text-sm text-[#6B6F7B] block mb-1">Nome da Coleção</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ofertas do Dia do Consumidor"
                  value={collectionName}
                  onChange={e => setCollectionName(e.target.value)}
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
                Criar Coleção
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
            <Bookmark className="w-6 h-6 text-[#0F172A]" />
            Biblioteca & Organização
          </h1>
          <p className="text-sm text-[#6B6F7B] mt-1">
            Coleções personalizadas, itens favoritos e histórico de ofertas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED]">
            <button
              onClick={() => setActiveTab('favoritos')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'favoritos' ? 'bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]' : 'text-[#9CA3AF] hover:text-[#6B6F7B]'
              }`}
            >
              Favoritos ({favoriteProducts.length})
            </button>
            <button
              onClick={() => setActiveTab('colecoes')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'colecoes' ? 'bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]' : 'text-[#9CA3AF] hover:text-[#6B6F7B]'
              }`}
            >
              Coleções ({productCollections.length})
            </button>
            <button
              onClick={() => setActiveTab('arquivados')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'arquivados' ? 'bg-[#F4F4F6] text-[#0F172A] border border-[#E8E9ED]' : 'text-[#9CA3AF] hover:text-[#6B6F7B]'
              }`}
            >
              Arquivados ({archivedProducts.length})
            </button>
          </div>

          {activeTab === 'colecoes' && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 rounded-lg bg-[#EDEDED] hover:bg-white text-[#0F172A] font-medium text-sm flex items-center gap-1.5 transition-colors"
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
            <div className="col-span-full text-center py-12 bg-[#FFFFFF] rounded-xl border border-[#E8E9ED] text-sm text-[#6B6F7B]">
              Nenhum produto marcado como favorito. Marque o ícone de estrela nos produtos do catálogo.
            </div>
          ) : (
            favoriteProducts.map(p => (
              <div key={p.id} className="p-5 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <img src={p.image} alt={p.title} className="w-full h-36 rounded-lg object-cover" />
                  <h3 className="text-sm font-medium text-[#0F172A] line-clamp-2">{p.title}</h3>
                </div>
                <div className="flex items-center justify-between text-sm pt-4 border-t border-[#E8E9ED]">
                  <span className="font-medium text-emerald-600">R$ {p.price.toFixed(2)}</span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleArchiveProduct(p.id)}
                      className="text-[#6B6F7B] hover:text-[#0F172A] transition-colors"
                      title="Arquivar Produto"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleFavoriteProduct(p.id)} className="text-[#EF4444] hover:text-[#EF4444]/80 text-sm font-medium transition-colors">
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
          {productCollections.length === 0 ? (
            <div className="col-span-full rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-10 text-center text-sm text-[#6B6F7B]">
              Nenhuma coleção criada.
            </div>
          ) : productCollections.map(col => (
            <div key={col.id} className="p-6 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] space-y-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#0F172A]" />
                <h3 className="text-sm font-medium text-[#0F172A]">{col.name}</h3>
              </div>
              <p className="text-sm text-[#6B6F7B]">{col.productIds.length} ofertas vinculadas nesta coleção</p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setSelectedCollectionId(col.id)}
                  className="flex-1 rounded-lg border border-[#E8E9ED] bg-transparent py-2 text-sm font-medium text-[#0F172A] hover:border-[#D4D4D8]"
                >
                  Gerenciar produtos
                </button>
                <button
                  onClick={() => void deleteProductCollection(col.id)}
                  className="rounded-lg border border-red-200 p-2 text-[#EF4444] hover:bg-red-50"
                  title="Excluir coleção"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'arquivados' && (
        <div className="space-y-4">
          {archivedProducts.length === 0 ? (
            <div className="text-sm text-[#6B6F7B] text-center py-12 bg-[#FFFFFF] rounded-xl border border-[#E8E9ED]">
              Nenhum item arquivado no momento.
            </div>
          ) : (
            archivedProducts.map(p => (
              <div key={p.id} className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E8E9ED] flex items-center justify-between text-sm">
                <div className="flex items-center gap-3">
                  <img src={p.image} className="w-10 h-10 rounded-lg object-cover" />
                  <span className="font-medium text-[#0F172A]">{p.title}</span>
                </div>
                <button
                  onClick={() => handleRestoreProduct(p.id)}
                  className="px-4 py-2 rounded-lg bg-transparent border border-[#E8E9ED] hover:border-[#D4D4D8] text-[#0F172A] font-medium text-sm transition-colors"
                >
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
