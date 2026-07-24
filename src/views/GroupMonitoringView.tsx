import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Bot, 
  Send, 
  ArrowRight, 
  Sparkles, 
  Image as ImageIcon, 
  Play, 
  Pause, 
  Check, 
  X, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  Layers, 
  ThumbsUp, 
  Plus, 
  ExternalLink 
} from 'lucide-react';

interface MonitoredMessage {
  id: string;
  timestamp: string;
  sourceGroup: string;
  sourcePlatform: 'telegram' | 'whatsapp';
  originalText: string;
  originalLink: string;
  extractedTitle: string;
  price: number;
  originalPrice: number;
  marketplace: string;
  processedText: string;
  processedLink: string;
  shopeeImage: string;
  status: 'capturado' | 'processando' | 'pronto' | 'enviado' | 'descartado';
}

export const GroupMonitoringView: React.FC = () => {
  const { addLog, convertAffiliateUrl, addQueueItem, queues } = useApp();

  const [sourcePlatform, setSourcePlatform] = useState<'telegram' | 'whatsapp'>('telegram');
  const [sourceGroup, setSourceGroup] = useState('@promos_concorrente_top');
  const [targetQueueId, setTargetQueueId] = useState(queues[0]?.id || 'default');
  const [isMonitoringActive, setIsMonitoringActive] = useState(false);
  const [isAutopilot, setIsAutopilot] = useState(false);
  const [messages, setMessages] = useState<MonitoredMessage[]>([]);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);

  // Live simulation of competitor posts
  useEffect(() => {
    if (!isMonitoringActive) return;

    const interval = setInterval(() => {
      const demoCompetitorOffers = [
        {
          title: "Fone de Ouvido JBL Tune 510BT Bluetooth Preto",
          originalLink: "https://www.amazon.com.br/dp/B095FLJQ86?ref=tag_concorrente_99",
          price: 189.90,
          originalPrice: 299.00,
          marketplace: "Amazon",
          shopeeImage: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
          rawText: "🔥 CORRE! JBL Tune 510BT Bluetooth com bateria de até 40 horas e som Pure Bass com super desconto na Amazon!! De R$ 299,00 por apenas R$ 189,90! Compre aqui rápido: https://www.amazon.com.br/dp/B095FLJQ86?ref=tag_concorrente_99"
        },
        {
          title: "Fritadeira Elétrica sem Óleo Airfryer Mondial 4L",
          originalLink: "https://www.mercadolivre.com.br/fritadeira-mondial-4l/p/MLB1928301",
          price: 349.90,
          originalPrice: 499.00,
          marketplace: "Mercado Livre",
          shopeeImage: "https://images.unsplash.com/photo-1621972750749-0fbb1abb7736?auto=format&fit=crop&w=600&q=80",
          rawText: "Mesa posta e cozinha equipada! Airfryer Mondial Family 4 Litros preta com desconto imperdível no Mercado Livre. Só R$ 349,90 hoje. Link: https://www.mercadolivre.com.br/fritadeira-mondial-4l/p/MLB1928301"
        },
        {
          title: "Smartwatch Xiaomi Redmi Watch 3 Active",
          originalLink: "https://shopee.com.br/xiaomi-redmi-watch-3-active-i.1823912.8239019",
          price: 269.00,
          originalPrice: 399.00,
          marketplace: "Shopee",
          shopeeImage: "https://images.unsplash.com/photo-1542496658-e33a6d0d50f6?auto=format&fit=crop&w=600&q=80",
          rawText: "Preço absurdo na Shopee! Redmi Watch 3 Active com tela de 1.83 polegadas, monitoramento de sono e mais de 100 modos esportivos. Corre garantir o seu por R$ 269! Compre no link do vendedor: https://shopee.com.br/xiaomi-redmi-watch-3-active-i.1823912.8239019"
        }
      ];

      const chosen = demoCompetitorOffers[Math.floor(Math.random() * demoCompetitorOffers.length)];
      const id = 'msg-' + Date.now();
      
      const newMsg: MonitoredMessage = {
        id,
        timestamp: new Date().toLocaleTimeString('pt-BR'),
        sourceGroup,
        sourcePlatform,
        originalText: chosen.rawText,
        originalLink: chosen.originalLink,
        extractedTitle: chosen.title,
        price: chosen.price,
        originalPrice: chosen.originalPrice,
        marketplace: chosen.marketplace,
        processedText: '',
        processedLink: '',
        shopeeImage: chosen.shopeeImage,
        status: 'capturado'
      };

      setMessages(prev => [newMsg, ...prev]);
      addLog('info', 'Monitor de Grupo', `Mensagem capturada do ${sourcePlatform === 'telegram' ? 'Telegram' : 'WhatsApp'} (${sourceGroup}): "${chosen.title}"`);
      
      // Auto-start processing for the captured item
      triggerMessageProcessing(id, newMsg, isAutopilot);

    }, 12000);

    return () => clearInterval(interval);
  }, [isMonitoringActive, sourceGroup, sourcePlatform, isAutopilot]);

  // Handle the step-by-step AI modification
  const triggerMessageProcessing = (id: string, msg: MonitoredMessage, autopilotActive: boolean) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'processando' } : m));
    
    setTimeout(() => {
      // 1. Convert link using real tags
      const myAffiliateLink = convertAffiliateUrl(msg.originalLink, msg.marketplace);
      
      // 2. Rewrite text with AI copywriting and optimized CTA
      const betterCtaText = `🚨 *OFERTA IMPERDÍVEL DETECTADA!* 🚨\n\n` +
        `🔥 *${msg.extractedTitle.toUpperCase()}*\n\n` +
        `De ~R$ ${msg.originalPrice.toFixed(2)}~ por apenas *R$ ${msg.price.toFixed(2)}*! 😱\n\n` +
        `🛒 *Garanta o seu com desconto exclusivo aqui:* 👉 ${myAffiliateLink}`;

      setMessages(prev => prev.map(m => {
        if (m.id === id) {
          const updated: MonitoredMessage = {
            ...m,
            processedText: betterCtaText,
            processedLink: myAffiliateLink,
            status: autopilotActive ? 'enviado' : 'pronto'
          };
          
          if (autopilotActive) {
            // Auto schedule
            addQueueItem({
              queueConfigId: targetQueueId,
              productTitle: msg.extractedTitle,
              productImage: msg.shopeeImage,
              price: msg.price,
              originalPrice: msg.originalPrice,
              marketplace: msg.marketplace,
              copyText: betterCtaText,
              affiliateUrl: myAffiliateLink,
            });
            addLog('success', 'Monitor de Grupo', `[PILOTO AUTOMÁTICO] Oferta "${msg.extractedTitle}" postada automaticamente na fila.`);
          }
          return updated;
        }
        return m;
      }));

      addLog('success', 'Monitor de Grupo', `Mensagem #${id} reescrita e link convertido para: ${msg.marketplace}`);
    }, 2000);
  };

  const handleApproveSend = (msg: MonitoredMessage) => {
    if (!msg.processedText) return;

    // Add directly to the selected Queue items
    addQueueItem({
      queueConfigId: targetQueueId,
      productTitle: msg.extractedTitle,
      productImage: msg.shopeeImage,
      price: msg.price,
      originalPrice: msg.originalPrice,
      marketplace: msg.marketplace,
      copyText: msg.processedText,
      affiliateUrl: msg.processedLink,
    });

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'enviado' } : m));
    addLog('success', 'Monitor de Grupo', `Oferta "${msg.extractedTitle}" aprovada e agendada na Fila!`);
  };

  const handleDiscard = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'descartado' } : m));
    addLog('info', 'Monitor de Grupo', `Mensagem de oferta descartada.`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Bot className="w-6 h-6 text-emerald-400" />
            Monitoramento Automático de Grupos (IA)
          </h1>
          <p className="text-xs text-slate-400">
            A IA captura ofertas de concorrentes em tempo real, substitui os links pelos seus, melhora a copy com CTAs magnéticos e busca imagens na Shopee.
          </p>
        </div>

        <button
          onClick={() => {
            setIsMonitoringActive(!isMonitoringActive);
            addLog('info', 'Monitor de Grupo', `Monitoramento automático ${!isMonitoringActive ? 'ATIVADO' : 'PAUSADO'}.`);
          }}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
            isMonitoringActive
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
          }`}
        >
          {isMonitoringActive ? (
            <>
              <Pause className="w-4 h-4" />
              Pausar Monitoramento
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Ativar Monitoramento Real-time
            </>
          )}
        </button>
      </div>

      {/* Configuration Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 p-6 bg-slate-900/90 border border-slate-800 rounded-3xl space-y-5">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            Configurações da Automação de Entrada & Saída
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 block font-semibold">Origem do Monitoramento:</label>
              <select
                value={sourcePlatform}
                onChange={e => {
                  const plat = e.target.value as 'telegram' | 'whatsapp';
                  setSourcePlatform(plat);
                  setSourceGroup(plat === 'telegram' ? '@promos_concorrente_top' : 'Grupo de Promoções VIP (WhatsApp)');
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="telegram">Telegram (Canal / Grupo)</option>
                <option value="whatsapp">WhatsApp (Grupo / Comunidade)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 block font-semibold">Identificação do Grupo/Link:</label>
              <input
                type="text"
                value={sourceGroup}
                onChange={e => setSourceGroup(e.target.value)}
                placeholder="Ex: @canal_origem ou invite link"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 block font-semibold">Fila / Canal de Destino (Saída):</label>
              <select
                value={targetQueueId}
                onChange={e => setTargetQueueId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {queues.length === 0 ? (
                  <option value="default">Nenhuma fila cadastrada (Crie primeiro)</option>
                ) : (
                  queues.map(q => (
                    <option key={q.id} value={q.id}>{q.name} ({q.platform})</option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-slate-850">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autopilot-checkbox"
                checked={isAutopilot}
                onChange={e => {
                  setIsAutopilot(e.target.checked);
                  addLog('info', 'Monitor de Grupo', `Piloto Automático ${e.target.checked ? 'ATIVADO' : 'DESATIVADO'}.`);
                }}
                className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="autopilot-checkbox" className="text-xs font-semibold text-slate-300 cursor-pointer select-none">
                🚀 Piloto Automático (Aprovar e agendar as ofertas no destino automaticamente sem moderação humana)
              </label>
            </div>
          </div>
        </div>

        {/* Real-time Status Card */}
        <div className="p-6 bg-slate-900/90 border border-slate-800 rounded-3xl flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status do Robô</h4>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${isMonitoringActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
              <span className="text-sm font-bold text-white">
                {isMonitoringActive ? `Lendo grupo do ${sourcePlatform === 'telegram' ? 'Telegram' : 'WhatsApp'}` : 'Robô inativo'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {isMonitoringActive 
                ? `Conectado ao grupo de origem. Piloto automático está: ${isAutopilot ? 'ATIVADO ✅' : 'DESATIVADO ❌'}`
                : 'Clique no botão superior para iniciar a varredura automática.'}
            </p>
          </div>

          <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Aprovados: {messages.filter(m => m.status === 'enviado').length}</span>
            <span>Processados: {messages.length}</span>
          </div>
        </div>
      </div>

      {/* Main Monitoring Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Capture Queue List */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center justify-between">
            <span>Feed de Ofertas Capturadas</span>
            <span className="text-[10px] text-indigo-400 px-2 py-0.5 bg-indigo-500/10 rounded-full font-mono font-bold">LIVE</span>
          </h3>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {messages.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/30 rounded-3xl border border-slate-800/80 space-y-4">
                <Bot className="w-10 h-10 text-slate-500 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-white">Nenhuma oferta capturada ainda</h4>
                  <p className="text-[10px] text-slate-400 max-w-xs mx-auto">
                    Ative o monitoramento e aguarde as mensagens do grupo de ofertas concorrente caírem aqui.
                  </p>
                </div>
              </div>
            ) : (
              messages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => setSelectedMsgId(msg.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                    selectedMsgId === msg.id
                      ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md shadow-indigo-950/20'
                      : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                  } ${msg.status === 'descartado' ? 'opacity-40' : ''}`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                      <span className="font-mono text-indigo-300 font-bold">{msg.timestamp}</span>
                      <span>•</span>
                      <span>De: {msg.sourcePlatform === 'telegram' ? 'Telegram' : 'WhatsApp'} ({msg.sourceGroup})</span>
                    </div>

                    <h4 className="text-xs font-bold text-white line-clamp-1">{msg.extractedTitle}</h4>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded uppercase">
                        {msg.marketplace}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-400">R$ {msg.price.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Badges Status */}
                  <div className="shrink-0">
                    {msg.status === 'capturado' && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 block"></span>
                    )}
                    {msg.status === 'processando' && (
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                    )}
                    {msg.status === 'pronto' && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 block animate-pulse"></span>
                    )}
                    {msg.status === 'enviado' && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                    {msg.status === 'descartado' && (
                      <X className="w-4 h-4 text-slate-500" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Process Compare & Preview */}
        <div className="lg:col-span-7">
          {selectedMsgId === null ? (
            <div className="h-full min-h-[300px] flex items-center justify-center bg-slate-900/30 border border-slate-800/80 rounded-3xl p-6 text-center text-xs text-slate-500">
              Selecione uma oferta no feed para visualizar a reescrita de copy e link por IA.
            </div>
          ) : (
            (() => {
              const msg = messages.find(m => m.id === selectedMsgId);
              if (!msg) return null;

              return (
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4.5 h-4.5 text-indigo-400" />
                      Processamento Inteligente por IA
                    </h3>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDiscard(msg.id)}
                        disabled={msg.status === 'enviado' || msg.status === 'descartado'}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition-colors text-xs font-semibold flex items-center gap-1 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Descartar
                      </button>
                      <button
                        onClick={() => handleApproveSend(msg)}
                        disabled={msg.status === 'enviado' || msg.status === 'descartado' || msg.status === 'processando'}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md flex items-center gap-1 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aprovar & Agendar
                      </button>
                    </div>
                  </div>

                  {/* Compare original vs final copy */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Left: Original Msg */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Texto Original Capturado</h4>
                      <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/60 text-xs font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
                        {msg.originalText}
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/40 border border-slate-800 text-[10px] font-mono text-slate-500 truncate flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Link concorrente: {msg.originalLink}</span>
                      </div>
                    </div>

                    {/* Right: Processed Msg */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-400" />
                        Texto Melhorado com Seu Link
                      </h4>
                      {msg.status === 'processando' ? (
                        <div className="p-12 text-center bg-slate-950/80 border border-slate-800 rounded-2xl flex flex-col items-center justify-center space-y-3">
                          <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
                          <span className="text-xs text-slate-400">Gerando CTA magnético e convertendo links...</span>
                        </div>
                      ) : (
                        <>
                          <div className="p-4 rounded-2xl bg-indigo-950/10 border border-indigo-500/20 text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed">
                            {msg.processedText || 'Aguardando processamento...'}
                          </div>
                          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-mono text-emerald-400 truncate flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Seu Link de Afiliado Ativo: {msg.processedLink}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Shopee Lookup Image Widget */}
                  <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-white">
                      <span className="flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-orange-400" />
                        Imagem do Produto Shopee (Detectada via Busca de Título)
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">Shopee API / Web Scraper</span>
                    </div>

                    <div className="flex gap-4 items-center">
                      <img src={msg.shopeeImage} alt={msg.extractedTitle} className="w-20 h-20 rounded-2xl object-cover border border-slate-800" />
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-300 font-bold leading-tight">{msg.extractedTitle}</p>
                        <p className="text-[11px] text-slate-500">
                          Imagem principal capturada automaticamente do catálogo da Shopee. Pronto para envio com a mídia.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      </div>
    </div>
  );
};
