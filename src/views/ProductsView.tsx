import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Product, MarketplaceType } from '../types';
import {
  Flame,
  Search,
  Plus,
  Radio,
  Play,
  Pause,
  ExternalLink,
  Copy,
  Check,
  Send,
  Sparkles,
  Zap,
  TrendingDown,
  Star,
  Trash2,
  ShoppingBag,
  X,
  Loader2,
  CheckCircle2,
  Truck,
  Ticket
} from 'lucide-react';

const LIVE_SAMPLE_DEALS: Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> = [
  {
    title: 'Smart TV 65" 4K LG OLED Evo C3 120Hz HDMI 2.1',
    originalPrice: 7999.00,
    price: 4999.00,
    discountPercent: 37,
    rating: 4.9,
    reviewsCount: 620,
    category: 'Eletrônicos',
    marketplace: 'Amazon',
    rawUrl: 'https://www.amazon.com.br/dp/B0C499LG',
    affiliateUrl: 'https://www.amazon.com.br/dp/B0C499LG?tag=affiflow-20',
    couponCode: 'TVOLED500',
    image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 99,
    priceDropAlert: true,
    priceDropAmount: 500.00,
    stockStatus: 'relampago',
    freeShipping: true,
    pixDiscount: true
  },
  {
    title: 'Monitor Gamer Curved 34" Samsung Odyssey G5 WQHD 165Hz',
    originalPrice: 2899.00,
    price: 1799.00,
    discountPercent: 38,
    rating: 4.8,
    reviewsCount: 450,
    category: 'Eletrônicos',
    marketplace: 'Shopee',
    rawUrl: 'https://shopee.com.br/samsung-odyssey-g5',
    affiliateUrl: 'https://shope.ee/992200odyssey?smtt=0.0.9',
    couponCode: 'SHOPEEODYSSEY',
    image: 'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 94,
    priceDropAlert: true,
    priceDropAmount: 200.00,
    stockStatus: 'poucas_unidades',
    freeShipping: true,
    pixDiscount: true
  },
  {
    title: 'Cadeira Gamer Ergostore Reclinável Premium Couro PU',
    originalPrice: 1299.00,
    price: 699.90,
    discountPercent: 46,
    rating: 4.6,
    reviewsCount: 310,
    category: 'Casa',
    marketplace: 'Mercado Livre',
    rawUrl: 'https://www.mercadolivre.com.br/cadeira-gamer',
    affiliateUrl: 'https://mercadolivre.com.br/sec/cadeira-gamer-aff',
    couponCode: 'MLGAMER100',
    image: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 91,
    priceDropAlert: false,
    stockStatus: 'normal',
    freeShipping: true,
    pixDiscount: true
  },
  {
    title: 'Kit Teclado Mecânico + Mouse Gamer Wireless Logitech G502',
    originalPrice: 799.90,
    price: 399.00,
    discountPercent: 50,
    rating: 4.9,
    reviewsCount: 1540,
    category: 'Games',
    marketplace: 'AliExpress',
    rawUrl: 'https://pt.aliexpress.com/item/g502.html',
    affiliateUrl: 'https://s.click.aliexpress.com/e/_dZg502',
    couponCode: 'ALIEXLOGI',
    image: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=600&q=80',
    status: 'ativo',
    isFavorite: false,
    isArchived: false,
    hotScore: 96,
    priceDropAlert: true,
    priceDropAmount: 100.00,
    stockStatus: 'relampago',
    freeShipping: true,
    pixDiscount: false
  }
];

export const ProductsView: React.FC = () => {
  const {
    products,
    addProduct,
    deleteProduct,
    toggleFavoriteProduct,
    addQueueItem,
    queues,
    extractOfferFromUrl,
    addLog
  } = useApp();

  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [searchQuery, setSearchQuery]   = useState<string>('');
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('todos');
  const [selectedCategory, setSelectedCategory]       = useState<string>('todas');
  const [selectedFilter, setSelectedFilter]           = useState<'todas' | 'queda_preco' | '50_off' | 'frete_gratis' | 'com_cupom' | 'favoritas'>('todas');

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newDealNotice, setNewDealNotice] = useState<string | null>(null);

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

  const [shareModalProduct, setShareModalProduct] = useState<Product | null>(null);

  // Real-Time Live Stream Auto-Refresher Loop
  useEffect(() => {
    if (!isLiveActive) return;

    const sampleIndexRef = { current: 0 };
    const interval = setInterval(() => {
      const sample = LIVE_SAMPLE_DEALS[sampleIndexRef.current % LIVE_SAMPLE_DEALS.length];
      sampleIndexRef.current += 1;

      const newProduct: Product = {
        ...sample,
        id: 'live-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      addProduct(newProduct);
      setNewDealNotice(`⚡ Nova oferta capturada na ${sample.marketplace}: ${sample.title.slice(0, 40)}... (-${sample.discountPercent}% OFF)`);
      setTimeout(() => setNewDealNotice(null), 5000);
    }, 12000);

    return () => clearInterval(interval);
  }, [isLiveActive, addProduct]);

  const handleExtractUrl = async () => {
    if (!urlInput.trim()) return;
    setIsExtracting(true);
    try {
      const extracted = await extractOfferFromUrl(urlInput);
      setFormData(prev => ({ ...prev, ...extracted, rawUrl: urlInput }));
    } catch (e) {
      console.error(e);
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    addProduct({
      ...formData,
      id: 'custom-' + Date.now(),
      status: 'ativo',
      isFavorite: false,
      isArchived: false,
      hotScore: 90,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as Product);
    setIsAddModalOpen(false);
    setUrlInput('');
    setFormData({
      title: '',
      originalPrice: 299.90,
      price: 199.90,
      discountPercent: 33,
      category: 'Eletrônicos',
      marketplace: 'Amazon',
      affiliateUrl: '',
      couponCode: ''
    });
  };

  const handleSendToQueue = (prod: Product) => {
    const queueId = queues.length > 0 ? queues[0].id : 'queue-1';
    addQueueItem({
      queueConfigId: queueId,
      productId: prod.id,
      productTitle: prod.title,
      productImage: prod.image,
      price: prod.price,
      originalPrice: prod.originalPrice,
      marketplace: prod.marketplace,
      copyText: `🔥 *OFERTA IMPERDÍVEL (${prod.discountPercent}% OFF)!*\n\n📱 ${prod.title}\n\nDe: ~R$ ${prod.originalPrice.toFixed(2)}~\nPor apenas: *R$ ${prod.price.toFixed(2)}*${prod.couponCode ? `\n🎟️ Cupom: *${prod.couponCode}*` : ''}\n\n👉 *Garante aqui:* ${prod.affiliateUrl}`,
      affiliateUrl: prod.affiliateUrl,
      channelIds: [],
      scheduledFor: new Date().toISOString(),
      priority: 1
    });
    setCopiedId(prod.id);
    setCopiedType('queue');
    setTimeout(() => { setCopiedId(null); setCopiedType(null); }, 2000);
    addLog('info', 'Feed de Ofertas', `Oferta "${prod.title.slice(0, 30)}..." enviada para a fila.`);
  };

  const handleCopyLink = (prod: Product) => {
    navigator.clipboard.writeText(prod.affiliateUrl);
    setCopiedId(prod.id);
    setCopiedType('link');
    setTimeout(() => { setCopiedId(null); setCopiedType(null); }, 2000);
  };

  const handleCopyFormattedText = (prod: Product) => {
    const copy = `🔥 *SUPER OFERTA (${prod.discountPercent}% OFF)* 🔥\n\n📦 ${prod.title}\n\n❌ De: R$ ${prod.originalPrice.toFixed(2)}\n✅ Por: *R$ ${prod.price.toFixed(2)}*${prod.pixDiscount ? ' no PIX' : ''}${prod.couponCode ? `\n🎟️ Cupom: *${prod.couponCode}*` : ''}${prod.freeShipping ? '\n🚚 Frete Grátis disponível' : ''}\n\n👉 *Compre no link oficial:* ${prod.affiliateUrl}`;
    navigator.clipboard.writeText(copy);
    setCopiedId(prod.id);
    setCopiedType('copy');
    setTimeout(() => { setCopiedId(null); setCopiedType(null); }, 2000);
  };

  const getMarketplaceBadgeClass = (mp: MarketplaceType) => {
    switch (mp) {
      case 'Shopee':        return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      case 'Amazon':        return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Mercado Livre': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      case 'Magalu':        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'AliExpress':    return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'Hotmart':       return 'bg-red-500/20 text-red-300 border-red-500/30';
      case 'Kiwify':        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:              return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
  };

  const filteredProducts = products.filter(p => {
    if (selectedMarketplace !== 'todos' && p.marketplace !== selectedMarketplace) return false;
    if (selectedCategory !== 'todas' && p.category !== selectedCategory) return false;
    if (selectedFilter === 'queda_preco' && !p.priceDropAlert) return false;
    if (selectedFilter === '50_off' && p.discountPercent < 50) return false;
    if (selectedFilter === 'frete_gratis' && !p.freeShipping) return false;
    if (selectedFilter === 'com_cupom' && !p.couponCode) return false;
    if (selectedFilter === 'favoritas' && !p.isFavorite) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.marketplace.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Flame className="w-6 h-6 text-rose-500 animate-pulse" />
            Feed de Ofertas em Tempo Real
          </h1>
          <p className="text-xs text-slate-400 max-w-xl mt-0.5">
            Monitoramento contínuo dos maiores marketplaces do Brasil em tempo real (Shopee, Amazon, Mercado Livre, Magalu, AliExpress).
          </p>
        </div>

        <div className="flex items-center gap-3 self-start lg:self-center">
          <button
            onClick={() => setIsLiveActive(!isLiveActive)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 border transition-all shadow-lg ${
              isLiveActive
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 hover:bg-rose-500/25'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
          >
            {isLiveActive ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                <Pause className="w-4 h-4" />
                Stream Ao Vivo: ATIVO
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-emerald-400" />
                Retomar Stream Ao Vivo
              </>
            )}
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar Oferta
          </button>
        </div>
      </div>

      {/* ── Live Toast Notification ─────────────────────────────────────────── */}
      {newDealNotice && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-500/20 via-violet-500/20 to-emerald-500/20 border border-rose-500/30 text-white text-xs font-semibold flex items-center justify-between shadow-xl">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 animate-bounce" />
            <span>{newDealNotice}</span>
          </div>
          <button onClick={() => setNewDealNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Live Ticker Summary Cards ────────────────────────────────────────── */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Marketplaces</p>
            <p className="text-xs font-bold text-white mt-0.5">8 Conectados</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Ofertas no Feed</p>
            <p className="text-xs font-bold text-white mt-0.5">{products.length} ativas</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Maior Desconto</p>
            <p className="text-xs font-bold text-amber-300 mt-0.5">58% OFF</p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">Quedas de Preço</p>
            <p className="text-xs font-bold text-rose-300 mt-0.5">🔥 Real-Time</p>
          </div>
        </div>
      </div>

      {/* ── Filters & Search Controls ───────────────────────────────────────── */}
      <div className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl space-y-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'todos', label: '🌐 Todos Marketplaces' },
            { id: 'Shopee', label: '🧡 Shopee' },
            { id: 'Amazon', label: '📦 Amazon' },
            { id: 'Mercado Livre', label: '💛 Mercado Livre' },
            { id: 'Magalu', label: '💙 Magalu' },
            { id: 'AliExpress', label: '🔴 AliExpress' },
          ].map(mp => (
            <button
              key={mp.id}
              onClick={() => setSelectedMarketplace(mp.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                selectedMarketplace === mp.id
                  ? 'bg-violet-600 text-white border-violet-500'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              {mp.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar ofertas em tempo real..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="todas">Todas as Categorias</option>
            <option value="Eletrônicos">Eletrônicos</option>
            <option value="Casa">Casa & Cozinha</option>
            <option value="Games">Games & Consoles</option>
          </select>

          <select
            value={selectedFilter}
            onChange={(e) => setSelectedFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 focus:outline-none focus:border-violet-500"
          >
            <option value="todas">Todos os Alertas</option>
            <option value="queda_preco">📉 Queda de Preço</option>
            <option value="50_off">⚡ 50%+ OFF</option>
            <option value="frete_gratis">🚚 Frete Grátis</option>
            <option value="com_cupom">🎟️ Com Cupom</option>
            <option value="favoritas">⭐ Favoritas</option>
          </select>
        </div>
      </div>

      {/* ── Offers Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredProducts.map(prod => (
          <div
            key={prod.id}
            className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all group"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border uppercase tracking-wider ${getMarketplaceBadgeClass(prod.marketplace)}`}>
                  {prod.marketplace}
                </span>

                <button
                  onClick={() => toggleFavoriteProduct(prod.id)}
                  className={`p-1.5 rounded-xl border transition-colors ${
                    prod.isFavorite
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-white'
                  }`}
                >
                  <Star className={`w-3.5 h-3.5 ${prod.isFavorite ? 'fill-amber-400' : ''}`} />
                </button>
              </div>

              <div className="flex gap-3">
                <img src={prod.image} alt={prod.title} className="w-16 h-16 rounded-xl object-cover border border-slate-800 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">{prod.category}</span>
                  <h3 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-violet-300 transition-colors">
                    {prod.title}
                  </h3>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-baseline justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 line-through mr-1.5">De R$ {prod.originalPrice.toFixed(2)}</span>
                  <span className="text-sm font-extrabold text-emerald-400">R$ {prod.price.toFixed(2)}</span>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px] font-extrabold">
                  -{prod.discountPercent}% OFF
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
              <button
                onClick={() => handleSendToQueue(prod)}
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                {copiedId === prod.id && copiedType === 'queue' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" /> Na Fila
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 text-amber-300" /> Fila de Envio
                  </>
                )}
              </button>

              <button
                onClick={() => setShareModalProduct(prod)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                title="Disparar / Ver Copy"
              >
                <Send className="w-3.5 h-3.5 text-sky-400" />
              </button>

              <button
                onClick={() => handleCopyLink(prod)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                title="Copiar Link Afiliado"
              >
                {copiedId === prod.id && copiedType === 'link' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <ExternalLink className="w-3.5 h-3.5 text-slate-400" />}
              </button>

              <button
                onClick={() => deleteProduct(prod.id)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-rose-400 border border-slate-700"
                title="Remover Oferta"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Modal Add Product ────────────────────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                Adicionar Oferta Manual
              </h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
              <label className="text-[11px] font-bold text-slate-400">Cole a URL do Produto no Marketplace</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="https://www.amazon.com.br/dp/..."
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleExtractUrl}
                  disabled={isExtracting || !urlInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  {isExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Extrair
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400">Título do Produto</label>
                <input
                  type="text"
                  required
                  value={formData.title || ''}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-400">Preço Promocional (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.price || 0}
                    onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400">Link Afiliado</label>
                  <input
                    type="text"
                    required
                    value={formData.affiliateUrl || ''}
                    onChange={e => setFormData({ ...formData, affiliateUrl: e.target.value })}
                    placeholder="https://..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md"
                >
                  Salvar Oferta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal Share Copy ─────────────────────────────────────────────────── */}
      {shareModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-sky-400" />
                Copy Pronta para Disparo
              </h2>
              <button onClick={() => setShareModalProduct(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono leading-relaxed whitespace-pre-wrap">
              {`🔥 *SUPER OFERTA (${shareModalProduct.discountPercent}% OFF)* 🔥\n\n📦 ${shareModalProduct.title}\n\n❌ De: R$ ${shareModalProduct.originalPrice.toFixed(2)}\n✅ Por: *R$ ${shareModalProduct.price.toFixed(2)}*\n\n👉 *Compre no link oficial:* ${shareModalProduct.affiliateUrl}`}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  handleCopyFormattedText(shareModalProduct);
                  setShareModalProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                Copiar Texto Completo
              </button>

              <button
                onClick={() => {
                  handleSendToQueue(shareModalProduct);
                  setShareModalProduct(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5"
              >
                <Zap className="w-4 h-4" />
                Enviar p/ Fila
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
