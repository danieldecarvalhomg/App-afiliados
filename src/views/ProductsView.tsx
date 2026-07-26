import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Product, MarketplaceType } from '../types';
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  Flame,
  Star,
  Copy,
  Check,
  Send,
  Wand2,
  Trash2,
  Bookmark,
  ExternalLink,
  AlertTriangle,
  Sparkles,
  X,
  Tag,
  DollarSign,
  Globe,
  Layers
} from 'lucide-react';

export const ProductsView: React.FC = () => {
  const {
    products,
    addProduct,
    updateProduct,
    deleteProduct,
    toggleFavoriteProduct,
    addQueueItem,
    setActiveTab,
    extractOfferFromUrl,
    clearMockData,
    convertAffiliateUrl
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'todos' | 'ativos' | 'pausados' | 'quebrados' | 'favoritos'>('todos');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('todos');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New Product Form State
  const [urlInput, setUrlInput] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({
    title: '',
    originalPrice: 299.90,
    price: 199.90,
    discountPercent: 33,
    category: 'Eletrônicos',
    marketplace: 'Amazon',
    rawUrl: '',
    affiliateUrl: '',
    couponCode: '',
    image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
  });

  const handleExtractUrl = async () => {
    if (!urlInput.trim()) return;
    setIsExtracting(true);
    try {
      const extracted = await extractOfferFromUrl(urlInput);
      const marketplaceName = extracted.marketplace || 'Amazon';
      const convertedLink = convertAffiliateUrl(urlInput, marketplaceName);

      setFormData(prev => ({
        ...prev,
        title: extracted.productName || prev.title,
        price: extracted.price || prev.price,
        originalPrice: extracted.originalPrice || prev.originalPrice,
        discountPercent: extracted.discountPercent || prev.discountPercent,
        marketplace: (marketplaceName as MarketplaceType),
        category: extracted.category || prev.category,
        couponCode: extracted.suggestedCoupon || prev.couponCode,
        rawUrl: urlInput,
        affiliateUrl: convertedLink,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    addProduct(formData);
    setIsAddModalOpen(false);
    // Reset
    setUrlInput('');
    setFormData({
      title: '',
      originalPrice: 299.90,
      price: 199.90,
      discountPercent: 33,
      category: 'Eletrônicos',
      marketplace: 'Amazon',
      rawUrl: '',
      affiliateUrl: '',
      couponCode: '',
      image: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
    });
  };

  const handleCopyLink = (prod: Product) => {
    navigator.clipboard.writeText(prod.affiliateUrl);
    setCopiedId(prod.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter logic
  const filteredProducts = products.filter(p => {
    if (filterTab === 'ativos' && p.status !== 'ativo') return false;
    if (filterTab === 'pausados' && p.status !== 'pausado') return false;
    if (filterTab === 'quebrados' && p.status !== 'link_quebrado') return false;
    if (filterTab === 'favoritos' && !p.isFavorite) return false;

    if (selectedMarketplace !== 'todos' && p.marketplace !== selectedMarketplace) return false;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.marketplace.toLowerCase().includes(q);
    }

    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-indigo-400" />
            Catálogo de Produtos & Ofertas
          </h1>
          <p className="text-xs text-slate-400">
            Gerencie seu acervo de ofertas, converta links e envie direto para as filas de disparo.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 hover:scale-[1.02]"
        >
          <Plus className="w-4 h-4" />
          Adicionar Nova Oferta
        </button>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto p-1 rounded-xl bg-slate-950 border border-slate-800 scrollbar-none">
            {[
              { id: 'todos', label: `Todos (${products.length})` },
              { id: 'ativos', label: `Ativos (${products.filter(p => p.status === 'ativo').length})` },
              { id: 'pausados', label: `Pausados (${products.filter(p => p.status === 'pausado').length})` },
              { id: 'quebrados', label: `Links Quebrados (${products.filter(p => p.status === 'link_quebrado').length})` },
              { id: 'favoritos', label: `Favoritos (${products.filter(p => p.isFavorite).length})` },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  filterTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Marketplace Select */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, categoria..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <select
              value={selectedMarketplace}
              onChange={(e) => setSelectedMarketplace(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="todos">Todos os Marketplaces</option>
              <option value="Amazon">Amazon</option>
              <option value="Mercado Livre">Mercado Livre</option>
              <option value="Shopee">Shopee</option>
              <option value="AliExpress">AliExpress</option>
              <option value="Magalu">Magalu</option>
            </select>
          </div>
        </div>
      </div>

      {/* Product Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.length === 0 ? (
          <div className="col-span-full py-16 px-6 text-center space-y-4 bg-slate-900/40 rounded-3xl border border-slate-800/80">
            <div className="w-14 h-14 rounded-3xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center mx-auto border border-indigo-500/20">
              <ShoppingBag className="w-7 h-7" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h3 className="text-base font-bold text-white">Nenhum produto no seu catálogo ainda</h3>
              <p className="text-xs text-slate-400">
                Cadastre o seu primeiro produto colando o link do marketplace ou preenchendo as informações.
              </p>
            </div>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Adicionar Primeira Oferta
            </button>
          </div>
        ) : (
          filteredProducts.map(prod => (
            <div
              key={prod.id}
              className={`p-5 rounded-3xl bg-slate-900/90 border transition-all duration-300 flex flex-col justify-between space-y-4 group relative overflow-hidden ${
                prod.status === 'link_quebrado'
                  ? 'border-rose-500/40 shadow-rose-950/20'
                  : 'border-slate-800/80 hover:border-indigo-500/40 hover:shadow-2xl'
              }`}
            >
              {/* Card Header & Badges */}
              <div className="space-y-3">
                <div className="relative h-44 rounded-2xl overflow-hidden bg-slate-950">
                  <img
                    src={prod.image}
                    alt={prod.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent"></div>

                  {/* Badges on top of image */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-950/80 backdrop-blur-md text-white border border-slate-700">
                      {prod.marketplace}
                    </span>
                    {prod.discountPercent > 0 && (
                      <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500 text-slate-950 shadow-md">
                        -{prod.discountPercent}% OFF
                      </span>
                    )}
                  </div>

                  <div className="absolute top-3 right-3 flex items-center gap-1.5">
                    <button
                      onClick={() => toggleFavoriteProduct(prod.id)}
                      className={`p-2 rounded-xl backdrop-blur-md border transition-all ${
                        prod.isFavorite
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      <Bookmark className="w-3.5 h-3.5 fill-current" />
                    </button>
                  </div>

                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {prod.category}
                    </span>
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                      <Flame className="w-3.5 h-3.5" />
                      {prod.hotScore} HotScore
                    </span>
                  </div>
                </div>

                {/* Title and Pricing */}
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white line-clamp-2 leading-snug group-hover:text-indigo-300 transition-colors">
                    {prod.title}
                  </h3>

                  <div className="flex items-baseline gap-2 pt-1">
                    <span className="text-lg font-extrabold text-emerald-400">
                      R$ {prod.price.toFixed(2)}
                    </span>
                    {prod.originalPrice > prod.price && (
                      <span className="text-xs text-slate-500 line-through">
                        R$ {prod.originalPrice.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {prod.couponCode && (
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[11px] font-mono">
                      <Tag className="w-3 h-3" />
                      <span>Cupom: <strong>{prod.couponCode}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Indicator & Quick Actions */}
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Status:</span>
                  {prod.status === 'ativo' && <span className="font-bold text-emerald-400">● Ativo</span>}
                  {prod.status === 'pausado' && <span className="font-bold text-amber-400">● Pausado</span>}
                  {prod.status === 'link_quebrado' && <span className="font-bold text-rose-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Link Quebrado</span>}
                </div>

                {/* Buttons Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      addQueueItem({
                        productId: prod.id,
                        productTitle: prod.title,
                        productImage: prod.image,
                        price: prod.price,
                        originalPrice: prod.originalPrice,
                        marketplace: prod.marketplace,
                        affiliateUrl: prod.affiliateUrl,
                        copyText: `🔥 *${prod.title}*\nDe ~R$ ${prod.originalPrice}~ por apenas *R$ ${prod.price}*!\n👉 Comprar: ${prod.affiliateUrl}`
                      });
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar p/ Fila
                  </button>

                  <button
                    onClick={() => handleCopyLink(prod)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-1.5"
                  >
                    {copiedId === prod.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedId === prod.id ? 'Copiado!' : 'Copiar Link'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Add New Product */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h2 className="text-lg font-bold text-white">Cadastrar Nova Oferta com IA</h2>
              </div>
              <button onClick={() => setIsAddModalOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI URL Extractor Header */}
            <div className="p-4 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 space-y-3">
              <label className="text-xs font-semibold text-indigo-300 block">
                Cole a URL do Produto no Marketplace (Amazon, Shopee, Mercado Livre):
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.amazon.com.br/dp/B0C15XK432"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleExtractUrl}
                  disabled={isExtracting}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition-all flex items-center gap-1.5 shrink-0"
                >
                  <Wand2 className="w-4 h-4" />
                  {isExtracting ? 'Extraindo...' : 'Extrair com IA'}
                </button>
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSaveProduct} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Título do Produto:</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Smart TV OLED LG 55"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Preço Atual (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Preço Original (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Marketplace:</label>
                  <select
                    value={formData.marketplace}
                    onChange={(e) => setFormData({ ...formData, marketplace: e.target.value as MarketplaceType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Amazon">Amazon</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="AliExpress">AliExpress</option>
                    <option value="Magalu">Magalu</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Cupom de Desconto (opcional):</label>
                  <input
                    type="text"
                    value={formData.couponCode}
                    onChange={(e) => setFormData({ ...formData, couponCode: e.target.value })}
                    placeholder="Ex: TECH10OFF"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Link de Afiliado Convertido:</label>
                  <input
                    type="text"
                    required
                    value={formData.affiliateUrl}
                    onChange={(e) => setFormData({ ...formData, affiliateUrl: e.target.value })}
                    placeholder="https://amzn.to/exemplo"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 hover:opacity-90"
                >
                  Salvar Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
