import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  Wand2,
  Sparkles,
  Copy,
  Check,
  Send,
  Bookmark,
  RefreshCw,
  MessageSquare,
  Flame,
  Tag,
  DollarSign,
  Share2,
  ThumbsUp,
  Search
} from 'lucide-react';

export const AiStudioView: React.FC = () => {
  const { products, templates, generateCopyWithAI, addQueueItem, addLog, queues } = useApp();

  const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
  const [productName, setProductName] = useState(products[0]?.title || 'Smart TV OLED LG 55" 4K UHD');
  const [price, setPrice] = useState<number>(products[0]?.price || 4899.00);
  const [originalPrice, setOriginalPrice] = useState<number>(products[0]?.originalPrice || 6999.00);
  const [couponCode, setCouponCode] = useState<string>(products[0]?.couponCode || 'TVOLED500');
  const [marketplace, setMarketplace] = useState<string>(products[0]?.marketplace || 'Amazon');
  const [tone, setTone] = useState<string>('Urgência e Escassez (Estoque Baixo)');
  const [destinationChannel, setDestinationChannel] = useState<string>('Telegram e WhatsApp');

  const [generatedCopy, setGeneratedCopy] = useState<string>(
    `🔥 *OFERTA IMPERDÍVEL: Smart TV OLED LG 55" 120Hz*\n\nDe ~R$ 6.999,00~ por apenas *R$ 4.899,00* em até 10x sem juros!\n🎟️ Cupom Exclusivo: *TVOLED500*\n\n🛒 Garanta a sua antes que acabe o estoque no site da Amazon!\n👇 *Clique no Link com Desconto:*\nhttps://amzn.to/3xAffiliAutoOLED\n\n#TV4K #OLED #OfertaTech`
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [selectedTemplateTab, setSelectedTemplateTab] = useState<'gerador' | 'templates'>('gerador');
  const [searchTemplate, setSearchTemplate] = useState('');

  const handleProductSelect = (id: string) => {
    setSelectedProductId(id);
    const found = products.find(p => p.id === id);
    if (found) {
      setProductName(found.title);
      setPrice(found.price);
      setOriginalPrice(found.originalPrice);
      setCouponCode(found.couponCode || '');
      setMarketplace(found.marketplace);
    }
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      const copy = await generateCopyWithAI({
        productName,
        price,
        originalPrice,
        couponCode,
        marketplace,
        tone,
        destinationChannel
      });
      setGeneratedCopy(copy);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generatedCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendDirectToQueue = () => {
    const foundProduct = products.find(p => p.id === selectedProductId);
    const firstQueue = queues[0];
    
    addQueueItem({
      queueConfigId: firstQueue?.id || 'default',
      productTitle: productName,
      productImage: foundProduct?.image || 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=600&q=80',
      price,
      originalPrice,
      marketplace: marketplace as any,
      copyText: generatedCopy,
      affiliateUrl: foundProduct?.affiliateUrl || 'https://affi.link/custom'
    });
    addLog('success', 'Gerador IA', 'Cópia enviada diretamente para a fila de disparo!');
  };

  const filteredTemplates = templates.filter(t =>
    t.title.toLowerCase().includes(searchTemplate.toLowerCase()) ||
    t.category.toLowerCase().includes(searchTemplate.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Wand2 className="w-6 h-6 text-indigo-400" />
            Gerador de Cópias com IA & Biblioteca de Templates
          </h1>
          <p className="text-xs text-slate-400">
            Crie textos persuasivos otimizados para conversão no Telegram e WhatsApp utilizando o Gemini 2.5 Flash.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
          <button
            onClick={() => setSelectedTemplateTab('gerador')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTemplateTab === 'gerador' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Gerador IA
          </button>
          <button
            onClick={() => setSelectedTemplateTab('templates')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTemplateTab === 'templates' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            Biblioteca de Templates ({templates.length})
          </button>
        </div>
      </div>

      {selectedTemplateTab === 'gerador' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls Column */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-white">Parâmetros de Geração</h2>
            </div>

            <div className="space-y-4">
              {/* Select Existing Product */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Selecionar Produto da Sua Lista:</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Inserir manualmente ou selecionar --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.marketplace} - {p.title} (R$ {p.price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Nome do Produto / Chamada:</label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Preço Promocional (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold text-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Preço Original (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Cupom de Desconto:</label>
                  <input
                    type="text"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    placeholder="Ex: CUPOM10"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono uppercase"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Marketplace:</label>
                  <select
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Amazon">Amazon</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="AliExpress">AliExpress</option>
                    <option value="Magalu">Magalu</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tom de Voz & Estilo de Copy:</label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Urgência e Escassez (Estoque Baixo)">Urgência & Escassez (Estoque Baixo / Corre!)</option>
                  <option value="Desconto e Cupom Focado">Foco total em Cupom & Menor Preço do Ano</option>
                  <option value="Review Tech Objetivo com Prós e Contras">Review Tech Rápido com Prós & Contras</option>
                  <option value="Divertido e Informal com Emojis">Informal, Engraçado com Emojis Otimizados</option>
                </select>
              </div>

              <button
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sintetizando Texto Persuasivo com Gemini IA...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Gerar Cópia de Alta Conversão com IA
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Result Output Column */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-base font-bold text-white">Preview do Texto Final</h2>
                </div>
                <span className="text-[10px] font-mono text-slate-500">Pronto para Telegram & WhatsApp</span>
              </div>

              {/* Copy Display Area */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                {generatedCopy}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={handleCopyText}
                className="py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold border border-slate-700 transition-all flex items-center justify-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado p/ Área de Transferência!' : 'Copiar Cópia'}
              </button>

              <button
                onClick={handleSendDirectToQueue}
                className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Enviar Direto p/ Fila
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Templates Library */
        <div className="space-y-5">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center gap-3">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTemplate}
              onChange={(e) => setSearchTemplate(e.target.value)}
              placeholder="Buscar templates por categoria ou palavra-chave..."
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map(tpl => (
              <div key={tpl.id} className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/40 transition-all space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {tpl.category}
                    </span>
                    <span className="text-[10px] text-slate-400">{tpl.usageCount} disparos</span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{tpl.title}</h3>
                  <div className="p-3 rounded-xl bg-slate-950 text-[11px] font-mono text-slate-300 line-clamp-4 leading-relaxed whitespace-pre-wrap">
                    {tpl.content}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setGeneratedCopy(tpl.content.replace('{NOME_PRODUTO}', productName).replace('{PRECO_ATUAL}', price.toFixed(2)).replace('{PRECO_ORIGINAL}', originalPrice.toFixed(2)).replace('{CUPOM}', couponCode || 'CUPOM10').replace('{LINK_AFILIADO}', 'https://amzn.to/link'));
                    setSelectedTemplateTab('gerador');
                  }}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white text-xs font-semibold transition-colors"
                >
                  Usar Este Template
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
