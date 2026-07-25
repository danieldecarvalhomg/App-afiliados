import React, { useState, useRef, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { CopyTemplate } from '../types';
import {
  Wand2,
  Sparkles,
  Copy,
  Check,
  Send,
  Search,
  Plus,
  Trash2,
  Edit3,
  Star,
  Eye,
  Layers,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  FileText,
  Code,
  Zap,
  X,
  ShoppingBag,
  Tag,
  ChevronRight,
  HelpCircle,
  RotateCcw,
  Bot,
  Radio,
  ArrowRight,
  CheckCircle2,
  Brain,
  MessageSquareQuote,
  Sliders,
  AlertOctagon
} from 'lucide-react';

// ============================================================================
// TEMPLATE PARSER & WHATSAPP RENDER ENGINE
// ============================================================================

export function processTemplateEngine(templateText: string, data: Record<string, any>): string {
  if (!templateText) return '';

  let result = templateText;

  // 1. Resolve Conditional Blocks: [se var]ifTrue[senão]ifFalse[fim] or [se var]ifTrue[fim]
  const conditionalRegex = /\[se\s+([a-zA-Z0-9_]+)\]([\s\S]*?)(?:\[senão\]([\s\S]*?))?\[fim\]/g;

  let previousResult = '';
  let iterations = 0;
  while (result !== previousResult && iterations < 5) {
    previousResult = result;
    iterations++;
    result = result.replace(conditionalRegex, (_, varName, ifContent, elseContent = '') => {
      const val = data[varName];
      const isTruthy =
        val === true ||
        (typeof val === 'string' && val.trim().length > 0) ||
        (typeof val === 'number' && val > 0);
      return isTruthy ? ifContent : elseContent;
    });
  }

  // 2. Replace Variables {var}
  result = result.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, varName) => {
    const val = data[varName];
    if (val === undefined || val === null || val === false) return '';
    if (val === true) return 'Sim';
    return String(val);
  });

  return result;
}

export function formatWhatsAppMarkdown(text: string): string {
  if (!text) return '';

  let formatted = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold: *text*
  formatted = formatted.replace(/\*([^\*\n]+)\*/g, '<strong>$1</strong>');
  // Italic: _text_
  formatted = formatted.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // Strikethrough: ~text~
  formatted = formatted.replace(/~([^~\n]+)~/g, '<del class="opacity-70">$1</del>');
  // Monospace: `text`
  formatted = formatted.replace(/`([^`\n]+)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded font-mono text-[11px] text-amber-300">$1</code>');

  return formatted;
}

const AVAILABLE_PERSONALITIES = [
  'Amigável & Descontraído (Gente, achadinho, corre!)',
  'Urgente & Escassez extrema (Estoque baixo, corre antes que acabe!)',
  'Direto & Objetivo (Preço sem enrolação e focado)',
  'Consultivo & Review Tech (Prós, contras e garantia)',
  'Divertido com Memes & Emojis otimizados'
];

// ============================================================================
// MAIN VIEW COMPONENT
// ============================================================================

export const AiStudioView: React.FC = () => {
  const {
    products,
    queues,
    addQueueItem,
    addLog,
    generateCopyWithAI,
    templates = [],
    addTemplate,
    updateTemplate,
    deleteTemplate,
    setDefaultTemplate,
    toggleTemplateStatus
  } = useApp();

  // Navigation tab states
  const [selectedTemplateTab, setSelectedTemplateTab] = useState<'gerador' | 'templates'>('templates');
  const [activeTypeTab, setActiveTypeTab] = useState<'texto' | 'imagem' | 'cupons' | 'cta' | 'condicoes'>('texto');

  // AI Generator Form States
  const [selectedProductId, setSelectedProductId] = useState('');
  const [productName, setProductName] = useState('Smartphone Galaxy S24 Ultra 512GB');
  const [price, setPrice] = useState(5499.0);
  const [originalPrice, setOriginalPrice] = useState(6999.0);
  const [couponCode, setCouponCode] = useState('S24ULTRA');
  const [marketplace, setMarketplace] = useState('Amazon');
  const [tone, setTone] = useState('Urgência e Escassez (Estoque Baixo)');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCopy, setGeneratedCopy] = useState(
    '🔥 *SUPER OFERTA EXCLUSIVA!*\n\n📱 *Smartphone Galaxy S24 Ultra 512GB*\nDe ~R$ 6.999,00~\nPor apenas *R$ 5.499,00*!\n\n🎟️ Cupom: *S24ULTRA*\n\n📦 Frete Grátis com Amazon Prime!\n👇 Garanta a sua unidade agora:\nhttps://amzn.to/example'
  );
  const [copied, setCopied] = useState(false);

  // AI Training & Persona State
  const [selectedPersonalities, setSelectedPersonalities] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.personalities)) return parsed.personalities;
        if (parsed.tone) return [parsed.tone];
      }
    } catch {}
    return ['Amigável & Descontraído (Gente, achadinho, corre!)'];
  });

  const [ctaUppercase, setCtaUppercase] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) return !!JSON.parse(saved).ctaUppercase;
    } catch {}
    return false;
  });

  const aiTone = useMemo(() => {
    if (!selectedPersonalities || selectedPersonalities.length === 0) return 'Personalizado';
    if (selectedPersonalities.length === AVAILABLE_PERSONALITIES.length) return 'Todas as Personalidades';
    return selectedPersonalities.map(p => (p || '').split(' (')[0]).filter(Boolean).join(', ');
  }, [selectedPersonalities]);

  const [mustUseWords, setMustUseWords] = useState(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) return JSON.parse(saved).mustUseWords || 'Gente!, Achadinho, Corre!';
    } catch {}
    return 'Gente!, Achadinho, Corre!';
  });

  const [forbiddenWords, setForbiddenWords] = useState(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) return JSON.parse(saved).forbiddenWords || 'Não perca, Compre já';
    } catch {}
    return 'Não perca, Compre já';
  });

  const [preferredCta, setPreferredCta] = useState(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) return JSON.parse(saved).preferredCta || '👉 RESGATE O SEU NO LINK OFICIAL ABAIXO:';
    } catch {}
    return '👉 RESGATE O SEU NO LINK OFICIAL ABAIXO:';
  });

  const [exampleCopy, setExampleCopy] = useState(() => {
    try {
      const saved = localStorage.getItem('affi_ai_training');
      if (saved) return JSON.parse(saved).exampleCopy || 'Gente, olha que achadinho surreal! Fone Bluetooth com bateria monstra por R$ 99! Corre antes que acabe: [LINK]';
    } catch {}
    return 'Gente, olha que achadinho surreal! Fone Bluetooth com bateria monstra por R$ 99! Corre antes que acabe: [LINK]';
  });

  const [isTrainingSaved, setIsTrainingSaved] = useState(false);

  const togglePersonality = (p: string) => {
    setSelectedPersonalities(prev =>
      prev.includes(p) ? prev.filter(item => item !== p) : [...prev, p]
    );
  };

  const handleSelectAllPersonalities = () => {
    setSelectedPersonalities([...AVAILABLE_PERSONALITIES]);
  };

  const handleClearPersonalities = () => {
    setSelectedPersonalities([]);
  };

  const handleSaveAiTrainingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCta = ctaUppercase ? preferredCta.toUpperCase() : preferredCta;
    const trainingObj = {
      tone: aiTone,
      personalities: selectedPersonalities,
      mustUseWords,
      forbiddenWords,
      preferredCta: finalCta,
      ctaUppercase,
      exampleCopy
    };
    localStorage.setItem('affi_ai_training', JSON.stringify(trainingObj));
    setIsTrainingSaved(true);
    addLog('success', 'Treinamento IA', 'Personalidades e estilo de CTA em CAIXA ALTA atualizados com sucesso!');
    setTimeout(() => {
      setIsTrainingSaved(false);
      setIsAiTrainingOpen(false);
    }, 1200);
  };

  // Template Management States
  const [searchTemplate, setSearchTemplate] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  // Editor Modal Form State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorStore, setEditorStore] = useState('Todas as Lojas');
  const [editorContent, setEditorContent] = useState('');
  const [editorStatus, setEditorStatus] = useState<'ativo' | 'inativo'>('ativo');
  const [editorIsDefault, setEditorIsDefault] = useState(false);

  // Textarea Ref for Inserting Chips at Cursor
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Accordion Expand States
  const [isWhatsappFormatOpen, setIsWhatsappFormatOpen] = useState(false);
  const [isFullExampleOpen, setIsFullExampleOpen] = useState(false);

  // Simulation State for Real-Time Offer Preview
  const [simData, setSimData] = useState({
    cta: '🔥 *OFERTA EXCLUSIVA DO DIA!*',
    produto: 'Fone de Ouvido Bluetooth Sem Fio Noise Cancelling',
    loja: 'Amazon',
    preco: '199.90',
    preco_original: '349.90',
    cupom: 'FONE20',
    link: 'https://amzn.to/fone-top',
    condicoes_pagamento: 'em até 6x sem juros',
    cupom_desconto: '20% OFF',
    cupom_link: 'https://shopee.br/cupom-dia',
    preco_unitario: '99.95',
    preco_recorrencia: '179.90/mês',
    link_site: 'https://meusite.com/promos',
    frete_gratis: true,
    internacional: false,
    pix: true
  });

  const [simSelectedTemplateId, setSimSelectedTemplateId] = useState<string>('');

  // AI Group Monitor Adapter State
  const [selectedMonitoredGroup, setSelectedMonitoredGroup] = useState('🔥 Grupo Ofertas Tech (Telegram)');
  const [selectedTargetTemplateId, setSelectedTargetTemplateId] = useState('');
  const [isAiAutoAdaptActive, setIsAiAutoAdaptActive] = useState(true);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [adaptedCopied, setAdaptedCopied] = useState(false);

  const competitorSamples = [
    {
      group: '🔥 Grupo Ofertas Tech (Telegram)',
      rawText: '🚨 CORRE GENTE!! Fone JBL Tune 520BT com 40% OFF saindo por apenas R$ 189,90 no PIX usando o cupom BEMVINDO20! Frete Grátis Prime disponivel! Compre aqui: https://amzn.to/jbl-520bt-raw',
      extracted: {
        cta: preferredCta || '🔥 *OFERTA IMPERDÍVEL DETECTADA!*',
        produto: 'Fone JBL Tune 520BT Bluetooth',
        loja: 'Amazon',
        preco: '189.90',
        preco_original: '319.90',
        cupom: 'BEMVINDO20',
        link: 'https://amzn.to/meu-affiliate-link-jbl',
        condicoes_pagamento: 'em até 4x sem juros',
        cupom_desconto: '40% OFF',
        frete_gratis: true,
        pix: true
      }
    },
    {
      group: '📱 Achadinhos VIP (WhatsApp)',
      rawText: '🧡 GEEENTE OLHA ESSE ACHADINHO SHOPEE!! Smartwatch Xiaomi Band 8 saindo por R$ 179,00! Cupom BAND20OFF de R$ 20 OFF na página. Link: https://shopee.com.br/band-8-raw',
      extracted: {
        cta: preferredCta || '🧡 *ACHADINHO IMPERDÍVEL DA SHOPEE!*',
        produto: 'Smartwatch Xiaomi Band 8 Tela AMOLED',
        loja: 'Shopee',
        preco: '179.00',
        preco_original: '259.00',
        cupom: 'BAND20OFF',
        cupom_desconto: 'R$ 20 OFF',
        link: 'https://shopee.com.br/meu-subid-band8',
        condicoes_pagamento: '',
        frete_gratis: true,
        pix: false
      }
    },
    {
      group: '⚡ Promoções Relâmpago (Telegram)',
      rawText: '🔥 MENOR PREÇO DO ANO Mercado Livre! Smart TV 55 4K Samsung por R$ 2.399 em até 10x sem juros! Frete grátis para todo Brasil. Link: https://mercadolivre.com.br/tv-55-raw',
      extracted: {
        cta: preferredCta || '⚡ *OFERTA RELÂMPAGO DO MERCADO LIVRE!*',
        produto: 'Smart TV 55 Crystal 4K Samsung',
        loja: 'Mercado Livre',
        preco: '2399.00',
        preco_original: '3299.00',
        cupom: '',
        link: 'https://mercadolivre.com.br/sec-tag-tv55',
        condicoes_pagamento: 'em até 10x sem juros',
        frete_gratis: true,
        pix: true
      }
    }
  ];

  const currentSample = competitorSamples[sampleIndex % competitorSamples.length];

  const activeSimTemplate = useMemo(() => {
    if (simSelectedTemplateId) {
      const found = templates.find(t => t.id === simSelectedTemplateId);
      if (found) return found.content;
    }
    const defaultTpl = templates.find(t => t.isDefault && t.status === 'ativo') || templates[0];
    return defaultTpl ? defaultTpl.content : editorContent;
  }, [simSelectedTemplateId, templates, editorContent]);

  const activeTargetTemplateContent = useMemo(() => {
    if (selectedTargetTemplateId) {
      const found = templates.find(t => t.id === selectedTargetTemplateId);
      if (found) return found.content;
    }
    const defaultTpl = templates.find(t => t.isDefault && t.status === 'ativo') || templates[0];
    return defaultTpl ? defaultTpl.content : '';
  }, [selectedTargetTemplateId, templates]);

  const simPreviewText = useMemo(() => {
    const rawText = isEditorOpen ? editorContent : activeSimTemplate;
    return processTemplateEngine(rawText, simData);
  }, [isEditorOpen, editorContent, activeSimTemplate, simData]);

  const aiAdaptedResultText = useMemo(() => {
    return processTemplateEngine(activeTargetTemplateContent, currentSample.extracted);
  }, [activeTargetTemplateContent, currentSample]);

  const handleProductSelect = (id: string) => {
    setSelectedProductId(id);
    const prod = products.find(p => p.id === id);
    if (prod) {
      setProductName(prod.title);
      setPrice(prod.price);
      setOriginalPrice(prod.originalPrice);
      setCouponCode(prod.couponCode || '');
      setMarketplace(prod.marketplace);
    }
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      const result = await generateCopyWithAI({
        productName,
        price,
        originalPrice,
        couponCode,
        marketplace,
        tone: aiTone || tone
      });
      setGeneratedCopy(result);
      addLog('success', 'Gerador IA', `Cópia gerada com estilo da IA para "${productName}"`);
    } catch (e) {
      addLog('error', 'Gerador IA', 'Falha ao gerar cópia via IA.');
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
    const firstQueue = queues[0];
    const foundProduct = products.find(p => p.id === selectedProductId);

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

  const insertTokenIntoEditor = (token: string) => {
    const textarea = editorTextareaRef.current;
    if (!textarea) {
      setEditorContent(prev => prev + token);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = editorContent;

    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    const newContent = before + token + after;
    setEditorContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 50);
  };

  const handleOpenEditor = (template?: CopyTemplate) => {
    if (template) {
      setEditingTemplateId(template.id);
      setEditorTitle(template.title);
      setEditorStore(template.store || 'Todas as Lojas');
      setEditorContent(template.content);
      setEditorStatus(template.status || 'ativo');
      setEditorIsDefault(!!template.isDefault);
    } else {
      setEditingTemplateId(null);
      setEditorTitle('');
      setEditorStore('Todas as Lojas');
      setEditorContent('');
      setEditorStatus('ativo');
      setEditorIsDefault(false);
    }
    setIsEditorOpen(true);
  };

  const handleFillExample = () => {
    setEditorTitle('Oferta com Condicionais de Frete e PIX');
    setEditorStore('Todas as Lojas');
    setEditorContent(
      `{cta}\n\n🔥 *{produto}*\n[se preco_original]\nDe ~R$ {preco_original}~ por\n[fim]\n💰 *R$ {preco}* [se condicoes_pagamento]({condicoes_pagamento})[fim]\n\n[se cupom]\n🎟️ Use o cupom: *{cupom}*\n[fim]\n[se frete_gratis]\n🚚 *Frete Grátis Disponível!*\n[fim]\n[se pix]\n⚡ Desconto exclusivo no PIX!\n[fim]\n\n🛒 Acesse agora no link:\n{link}`
    );
  };

  const handleSaveEditorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editorTitle.trim()) {
      alert('Por favor, digite o nome do template.');
      return;
    }
    if (!editorContent.trim()) {
      alert('O conteúdo do template não pode estar vazio.');
      return;
    }

    if (editingTemplateId) {
      updateTemplate(editingTemplateId, {
        title: editorTitle,
        store: editorStore,
        category: editorStore,
        content: editorContent,
        status: editorStatus,
        isDefault: editorIsDefault
      });
    } else {
      addTemplate({
        title: editorTitle,
        store: editorStore,
        category: editorStore,
        content: editorContent,
        status: editorStatus,
        isDefault: editorIsDefault
      });
    }

    setIsEditorOpen(false);
  };

  const handleDeleteTemplate = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o template "${name}"?`)) {
      deleteTemplate(id);
    }
  };

  const handleResetSimulation = () => {
    setSimData({
      cta: '🔥 *OFERTA EXCLUSIVA DO DIA!*',
      produto: 'Fone de Ouvido Bluetooth Sem Fio Noise Cancelling',
      loja: 'Amazon',
      preco: '199.90',
      preco_original: '349.90',
      cupom: 'FONE20',
      link: 'https://amzn.to/fone-top',
      condicoes_pagamento: 'em até 6x sem juros',
      cupom_desconto: '20% OFF',
      cupom_link: 'https://shopee.br/cupom-dia',
      preco_unitario: '99.95',
      preco_recorrencia: '179.90/mês',
      link_site: 'https://meusite.com/promos',
      frete_gratis: true,
      internacional: false,
      pix: true
    });
  };

  const handleSendAdaptedToQueue = () => {
    const firstQueue = queues[0];
    addQueueItem({
      queueConfigId: firstQueue?.id || 'default',
      productTitle: currentSample.extracted.produto,
      productImage: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80',
      price: parseFloat(currentSample.extracted.preco),
      originalPrice: parseFloat(currentSample.extracted.preco_original),
      marketplace: currentSample.extracted.loja as any,
      copyText: aiAdaptedResultText,
      affiliateUrl: currentSample.extracted.link
    });
    addLog('success', 'IA Monitora', `Texto adaptado do ${currentSample.group} enviado direto para a fila!`);
  };

  const storeGroups = ['Todas as Lojas', 'Amazon', 'Mercado Livre', 'Shopee', 'AliExpress'];

  const filteredTemplatesList = templates.filter(
    t =>
      t.title.toLowerCase().includes(searchTemplate.toLowerCase()) ||
      t.content.toLowerCase().includes(searchTemplate.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header & Navigation Structure */}
      <div className="space-y-4">
        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Início</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">Templates</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Wand2 className="w-6 h-6 text-indigo-400" />
              Gestão de Templates & Gerador IA
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Crie modelos padronizados com suporte a variáveis dinâmicas e treine a IA no seu estilo de copy.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
            <button
              onClick={() => setSelectedTemplateTab('templates')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedTemplateTab === 'templates'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Biblioteca de Templates ({templates.length})
            </button>
            <button
              onClick={() => setSelectedTemplateTab('gerador')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedTemplateTab === 'gerador'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Gerador IA
            </button>
          </div>
        </div>

        {selectedTemplateTab === 'templates' && (
          <>
            {/* Top Horizontal Type Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2 overflow-x-auto">
              {(
                [
                  { id: 'texto', label: 'Texto' },
                  { id: 'imagem', label: 'Imagem' },
                  { id: 'cupons', label: 'Cupons' },
                  { id: 'cta', label: 'CTA' },
                  { id: 'condicoes', label: 'Condições' }
                ] as const
              ).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTypeTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${
                    activeTypeTab === tab.id
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.id !== 'texto' && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      Em breve
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Instruction Block for "Texto" Tab */}
            {activeTypeTab === 'texto' ? (
              <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      Gerenciador de Templates & Treinador IA
                    </h3>
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                      <Brain className="w-3 h-3 text-amber-400" />
                      Estilo: "{aiTone}"
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                    Configure os formatos de mensagem e treine o tom de voz da IA com suas palavras obrigatórias, frases a evitar e estilo de CTA.
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => setIsAiTrainingOpen(true)}
                    className="px-4 py-2.5 rounded-2xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 font-bold text-xs flex items-center gap-2 transition-all shadow-lg shadow-purple-600/10 hover:scale-105"
                  >
                    <Brain className="w-4 h-4 text-purple-400" />
                    Treinar IA (Meu Estilo)
                  </button>

                  <button
                    onClick={() => handleOpenEditor()}
                    className="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all hover:scale-105"
                  >
                    <Plus className="w-4 h-4" />
                    + Cadastrar
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center rounded-3xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 space-y-2">
                <Zap className="w-6 h-6 text-indigo-400 mx-auto opacity-60" />
                <p className="font-bold text-white">Módulo {activeTypeTab.toUpperCase()} em desenvolvimento</p>
                <p>A aba "Texto" está 100% ativa para você gerenciar seus modelos de copy com condicionais.</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================================================================== */}
      {/* TAB: BIBLIOTECA DE TEMPLATES & IA MONITORA                             */}
      {/* ==================================================================== */}
      {selectedTemplateTab === 'templates' && activeTypeTab === 'texto' && (
        <div className="space-y-8">

          {/* SECTION: IA MONITORA DE GRUPOS & ADAPTADOR DE TEMPLATES */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-950/80 via-slate-900 to-purple-950/60 border border-indigo-500/30 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <Bot className="w-6 h-6 text-emerald-400" />
                  <h2 className="text-base font-extrabold text-white">IA Monitora de Grupos & Adaptador Automático de Templates</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    🤖 IA Monitora Ativa
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  A IA analisa as postagens dos grupos concorrentes monitorados, extrai os parâmetros e formata automaticamente para o seu estilo treinado e template cadastrado.
                </p>
              </div>

              <button
                onClick={() => setSampleIndex(prev => prev + 1)}
                className="px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Simular Próxima Captura
              </button>
            </div>

            {/* Controls Bar for AI Monitor */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Grupo Concorrente Monitorado</label>
                <select
                  value={selectedMonitoredGroup}
                  onChange={e => setSelectedMonitoredGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="🔥 Grupo Ofertas Tech (Telegram)">🔥 Grupo Ofertas Tech (Telegram)</option>
                  <option value="📱 Achadinhos VIP (WhatsApp)">📱 Achadinhos VIP (WhatsApp)</option>
                  <option value="⚡ Promoções Relâmpago (Telegram)">⚡ Promoções Relâmpago (Telegram)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Template Cadastrado Alvo</label>
                <select
                  value={selectedTargetTemplateId}
                  onChange={e => setSelectedTargetTemplateId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 font-medium text-emerald-400"
                >
                  <option value="">-- Usar Template Padrão Ativo --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.store || 'Geral'}) {t.isDefault ? '[Padrão]' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2.5 cursor-pointer bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800 w-full">
                  <input
                    type="checkbox"
                    checked={isAiAutoAdaptActive}
                    onChange={e => setIsAiAutoAdaptActive(e.target.checked)}
                    className="rounded bg-slate-900 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-xs font-bold text-slate-200">Reescrever postagens neste template ao capturar</span>
                </label>
              </div>
            </div>

            {/* 3-Column Live Conversion Display */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-2">
              {/* Col 1: Raw Competitor Post */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                      <Radio className="w-3 h-3 animate-pulse" />
                      Original Capturado do Concorrente
                    </span>
                    <span className="text-[9px] text-slate-500 font-mono">Ao Vivo</span>
                  </div>
                  <p className="text-[11px] font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {currentSample.rawText}
                  </p>
                </div>
                <div className="text-[10px] text-slate-500 pt-2 border-t border-slate-900">
                  Origem: {currentSample.group}
                </div>
              </div>

              {/* Col 2: Extracted Variables by AI */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Parâmetros Extraídos pela IA
                  </span>
                  <span className="text-[9px] text-emerald-400 font-mono">100% Mapeado</span>
                </div>

                <div className="space-y-1 text-[11px] font-mono max-h-48 overflow-y-auto">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60">
                    <span className="text-indigo-300 font-bold">{'{produto}'}</span>
                    <span className="text-white truncate max-w-[140px]">{currentSample.extracted.produto}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60">
                    <span className="text-indigo-300 font-bold">{'{preco}'}</span>
                    <span className="text-emerald-400 font-bold">R$ {currentSample.extracted.preco}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60">
                    <span className="text-indigo-300 font-bold">{'{cupom}'}</span>
                    <span className="text-amber-300 font-bold">{currentSample.extracted.cupom || 'Nenhum'}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60">
                    <span className="text-indigo-300 font-bold">[se frete_gratis]</span>
                    <span className="text-emerald-400">{currentSample.extracted.frete_gratis ? 'Sim (Verdadeiro)' : 'Não'}</span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/60">
                    <span className="text-indigo-300 font-bold">{'{link}'}</span>
                    <span className="text-slate-400 text-[10px]">Tag Injetada ✓</span>
                  </div>
                </div>
              </div>

              {/* Col 3: Adapted Result using User Template */}
              <div className="lg:col-span-4 p-4 rounded-2xl bg-[#0b141a] border border-emerald-500/30 space-y-3 flex flex-col justify-between shadow-xl">
                <div className="space-y-2">
                  <div className="flex items-center justify-between border-b border-emerald-900/40 pb-2">
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      Resultado Adaptado ao Seu Template
                    </span>
                    <span className="text-[9px] text-indigo-300 font-mono font-bold">Formatado</span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#005c4b] text-white text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-md">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: formatWhatsAppMarkdown(aiAdaptedResultText)
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-900/40">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(aiAdaptedResultText);
                      setAdaptedCopied(true);
                      setTimeout(() => setAdaptedCopied(false), 2000);
                    }}
                    className="py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold border border-slate-700 flex items-center justify-center gap-1 transition-colors"
                  >
                    {adaptedCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {adaptedCopied ? 'Copiado!' : 'Copiar'}
                  </button>

                  <button
                    onClick={handleSendAdaptedToQueue}
                    className="py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-md transition-all"
                  >
                    <Send className="w-3 h-3" />
                    Enviar p/ Fila
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar templates por nome ou conteúdo..."
              value={searchTemplate}
              onChange={e => setSearchTemplate(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-2xl pl-11 pr-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
          </div>

          {/* 2. Grouped Templates Listing */}
          <div className="space-y-8">
            {storeGroups.map(storeName => {
              const groupTemplates = filteredTemplatesList.filter(
                t => (t.store || t.category || 'Todas as Lojas') === storeName
              );

              if (groupTemplates.length === 0 && searchTemplate) return null;

              return (
                <div key={storeName} className="space-y-4">
                  {/* Group Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                        <ShoppingBag className="w-4 h-4" />
                      </div>
                      <h2 className="text-base font-extrabold text-white tracking-tight">{storeName}</h2>
                    </div>

                    <span className="text-xs text-slate-400 font-mono">
                      {groupTemplates.length} {groupTemplates.length === 1 ? 'template' : 'templates'}
                    </span>
                  </div>

                  {/* Template Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {groupTemplates.length === 0 ? (
                      <div className="col-span-full p-6 text-center rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-500">
                        Nenhum template cadastrado para o grupo "{storeName}". Clique em "+ Cadastrar" para criar o primeiro!
                      </div>
                    ) : (
                      groupTemplates.map(tpl => (
                        <div
                          key={tpl.id}
                          className={`p-5 rounded-3xl bg-slate-900/90 border transition-all space-y-4 flex flex-col justify-between ${
                            tpl.isDefault
                              ? 'border-indigo-500/50 shadow-lg shadow-indigo-500/5'
                              : 'border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-xs font-bold text-white line-clamp-1">{tpl.title}</h3>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {tpl.isDefault && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                    ★ Padrão
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                    tpl.status === 'ativo'
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                      : 'bg-slate-800 text-slate-400 border-slate-700'
                                  }`}
                                >
                                  {tpl.status === 'ativo' ? 'Ativo' : 'Inativo'}
                                </span>
                              </div>
                            </div>

                            {/* Raw Code Preview */}
                            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800/80 text-[11px] font-mono text-slate-300 line-clamp-5 leading-relaxed whitespace-pre-wrap">
                              {tpl.content}
                            </div>
                          </div>

                          {/* Action Line */}
                          <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-800/80 text-slate-400">
                            <button
                              onClick={() => setDefaultTemplate(tpl.id)}
                              className={`text-[11px] font-semibold hover:text-white transition-colors ${
                                tpl.isDefault ? 'text-amber-400 font-bold' : ''
                              }`}
                            >
                              {tpl.isDefault ? 'Padrão Ativo' : 'Definir Padrão'}
                            </button>
                            <span className="text-slate-700">•</span>
                            <button
                              onClick={() => toggleTemplateStatus(tpl.id)}
                              className="text-[11px] hover:text-white transition-colors"
                            >
                              {tpl.status === 'ativo' ? 'Desativar' : 'Ativar'}
                            </button>
                            <span className="text-slate-700">•</span>
                            <button
                              onClick={() => handleOpenEditor(tpl)}
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                              Editar
                            </button>
                            <span className="text-slate-700">•</span>
                            <button
                              onClick={() => handleDeleteTemplate(tpl.id, tpl.title)}
                              className="text-[11px] text-rose-400 hover:text-rose-300"
                            >
                              Excluir
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6. Auxiliar Sections (Collapsibles / Accordions) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            {/* Formatação WhatsApp Accordion */}
            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
              <button
                onClick={() => setIsWhatsappFormatOpen(prev => !prev)}
                className="w-full flex items-center justify-between text-left font-bold text-xs text-white"
              >
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4 text-indigo-400" />
                  <span>Guia de Formatação do WhatsApp</span>
                </div>
                {isWhatsappFormatOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isWhatsappFormatOpen && (
                <div className="pt-2 text-xs space-y-2 text-slate-300 border-t border-slate-800 font-mono">
                  <p><code className="text-amber-300">*negrito*</code> ➔ <strong>negrito</strong></p>
                  <p><code className="text-amber-300">_itálico_</code> ➔ <em>itálico</em></p>
                  <p><code className="text-amber-300">~riscado~</code> ➔ <del>riscado</del></p>
                  <p><code className="text-amber-300">`monoespaçado`</code> ➔ <code className="bg-slate-950 px-1 rounded">monoespaçado</code></p>
                </div>
              )}
            </div>

            {/* Template de Exemplo Completo Accordion */}
            <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-3">
              <button
                onClick={() => setIsFullExampleOpen(prev => !prev)}
                className="w-full flex items-center justify-between text-left font-bold text-xs text-white"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Template de Exemplo Completo</span>
                </div>
                {isFullExampleOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {isFullExampleOpen && (
                <div className="pt-2 text-[11px] font-mono text-slate-300 bg-slate-950 p-3 rounded-2xl border border-slate-800 whitespace-pre-wrap leading-relaxed">
                  {`{cta}

🔥 *{produto}*
[se preco_original]
De ~R$ {preco_original}~ por
[fim]
💰 *R$ {preco}* [se condicoes_pagamento]({condicoes_pagamento})[fim]

[se cupom]
🎟️ Cupom: *{cupom}*
[fim]
[se frete_gratis]
🚚 *Frete Grátis Disponível!*
[fim]

🛒 Compre no link:
{link}`}
                </div>
              )}
            </div>
          </div>

          {/* 7. Simulador de Oferta (Preview em Tempo Real) */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Simulador de Oferta (Preview em Tempo Real)</h2>
              </div>

              <button
                onClick={handleResetSimulation}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resetar
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form Input Fields for Simulator */}
              <div className="lg:col-span-7 space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Template para Testar</label>
                    <select
                      value={simSelectedTemplateId}
                      onChange={e => setSimSelectedTemplateId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                    >
                      <option value="">-- Usar Template Padrão --</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.store || 'Geral'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">CTA (Chamada)</label>
                    <input
                      type="text"
                      value={simData.cta}
                      onChange={e => setSimData({ ...simData, cta: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Produto</label>
                    <input
                      type="text"
                      value={simData.produto}
                      onChange={e => setSimData({ ...simData, produto: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Loja</label>
                    <input
                      type="text"
                      value={simData.loja}
                      onChange={e => setSimData({ ...simData, loja: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Preço (R$)</label>
                    <input
                      type="text"
                      value={simData.preco}
                      onChange={e => setSimData({ ...simData, preco: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Preço Original (R$)</label>
                    <input
                      type="text"
                      value={simData.preco_original}
                      onChange={e => setSimData({ ...simData, preco_original: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Cupom Código</label>
                    <input
                      type="text"
                      value={simData.cupom}
                      onChange={e => setSimData({ ...simData, cupom: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Link de Afiliado</label>
                    <input
                      type="text"
                      value={simData.link}
                      onChange={e => setSimData({ ...simData, link: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Condições Pagamento</label>
                    <input
                      type="text"
                      value={simData.condicoes_pagamento}
                      onChange={e => setSimData({ ...simData, condicoes_pagamento: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1 font-medium">Cupom Desconto (ex: 20% OFF)</label>
                    <input
                      type="text"
                      value={simData.cupom_desconto}
                      onChange={e => setSimData({ ...simData, cupom_desconto: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>

                {/* Checkboxes for Conditionals */}
                <div className="pt-2 flex flex-wrap gap-4 text-xs font-semibold text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simData.frete_gratis}
                      onChange={e => setSimData({ ...simData, frete_gratis: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                    />
                    <span>Frete Grátis</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simData.internacional}
                      onChange={e => setSimData({ ...simData, internacional: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                    />
                    <span>Internacional</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={simData.pix}
                      onChange={e => setSimData({ ...simData, pix: e.target.checked })}
                      className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                    />
                    <span>Desconto no PIX</span>
                  </label>
                </div>
              </div>

              {/* WhatsApp Speech Bubble Live Render */}
              <div className="lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Eye className="w-4 h-4 text-emerald-400" />
                    Preview Renderizado (WhatsApp)
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono text-[10px] font-bold">
                    WhatsApp Live
                  </span>
                </div>

                <div className="p-4 rounded-3xl bg-[#0b141a] border border-slate-800 min-h-[260px] flex flex-col justify-end shadow-2xl">
                  {/* WhatsApp Message Bubble */}
                  <div className="p-3.5 rounded-2xl bg-[#005c4b] text-white text-xs font-sans whitespace-pre-wrap leading-relaxed shadow-lg border border-emerald-500/30 space-y-2">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: formatWhatsAppMarkdown(simPreviewText)
                      }}
                    />
                    <div className="text-[9px] text-emerald-200/60 text-right font-mono">
                      14:32 ✓✓
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: TREINAR IA & PERSONALIZAR ESTILO                              */}
      {/* ==================================================================== */}
      {isAiTrainingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-purple-500/30 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center font-bold">
                  <Brain className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Treinar IA & Personalizar Estilo da Copy</h2>
                  <p className="text-[11px] text-slate-400">Ensine o Gemini 2.5 Flash a escrever com a sua própria voz e vocabulário.</p>
                </div>
              </div>
              <button onClick={() => setIsAiTrainingOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAiTrainingSubmit} className="space-y-4 text-xs">
              {/* Multi-select Personalities */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-purple-400" />
                    Personalidades & Tom de Voz da IA (Selecione Múltiplas ou Todas)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSelectAllPersonalities}
                      className="text-[10px] text-purple-400 hover:text-purple-300 font-bold underline"
                    >
                      Selecionar Todas
                    </button>
                    <span className="text-slate-700">•</span>
                    <button
                      type="button"
                      onClick={handleClearPersonalities}
                      className="text-[10px] text-slate-400 hover:text-slate-300 underline"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto">
                  {AVAILABLE_PERSONALITIES.map(item => {
                    const isSelected = selectedPersonalities.includes(item);
                    return (
                      <label
                        key={item}
                        onClick={() => togglePersonality(item)}
                        className={`p-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all flex items-center gap-2.5 ${
                          isSelected
                            ? 'bg-purple-600/20 border-purple-500/50 text-purple-200 shadow-sm'
                            : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="rounded bg-slate-950 border-slate-700 text-purple-600 focus:ring-0 shrink-0"
                        />
                        <span className="leading-snug text-[11px]">{item}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    Palavras / Expressões Recomendadas (Obrigatórias)
                  </label>
                  <input
                    type="text"
                    value={mustUseWords}
                    onChange={e => setMustUseWords(e.target.value)}
                    placeholder="Ex: Corre!, Gente!, Achadinho, Garantia"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-emerald-500 font-mono text-[11px]"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Separe por vírgulas as palavras que a IA deve usar.</span>
                </div>

                <div>
                  <label className="text-slate-300 block mb-1 font-semibold flex items-center gap-1.5">
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                    Palavras / Expressões Proibidas (A Evitar)
                  </label>
                  <input
                    type="text"
                    value={forbiddenWords}
                    onChange={e => setForbiddenWords(e.target.value)}
                    placeholder="Ex: Não perca, Compre já, Imperdível"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-rose-500 font-mono text-[11px]"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">A IA evitará estritamente essas palavras.</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                    Estilo da Chamada para Ação (CTA Preferida)
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ctaUppercase}
                      onChange={e => {
                        const checked = e.target.checked;
                        setCtaUppercase(checked);
                        if (checked && preferredCta) {
                          setPreferredCta(prev => prev.toUpperCase());
                        }
                      }}
                      className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
                    />
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      Gerar CTA em CAIXA ALTA
                    </span>
                  </label>
                </div>
                <input
                  type="text"
                  value={preferredCta}
                  onChange={e => setPreferredCta(ctaUppercase ? e.target.value.toUpperCase() : e.target.value)}
                  placeholder="Ex: 👉 RESGATE O SEU DESCONTO EXCLUSIVO NO LINK ABAIXO:"
                  className={`w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 ${
                    ctaUppercase ? 'uppercase font-bold tracking-wide text-amber-300' : ''
                  }`}
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold flex items-center gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-amber-400" />
                  Exemplo de Postagem no Seu Estilo (Treinamento Few-Shot)
                </label>
                <textarea
                  rows={4}
                  value={exampleCopy}
                  onChange={e => setExampleCopy(e.target.value)}
                  placeholder="Cole um exemplo de texto ou CTA que você escreveu para a IA espelhar o seu estilo exato..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-purple-500 leading-relaxed"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  A IA analisará a estrutura de frases, emojis e ritmo do seu texto de exemplo.
                </span>
              </div>

              {isTrainingSaved && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Treinamento salvo! O Gemini 2.5 agora usará a sua personalidade.
                </div>
              )}

              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAiTrainingOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 flex items-center gap-2"
                >
                  <Brain className="w-4 h-4 text-amber-300" />
                  Salvar & Treinar IA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. EDITOR DE TEMPLATE (MODAL FULL-FEATURED)                           */}
      {/* ==================================================================== */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
          <div className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150 my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">
                  {editingTemplateId ? 'Editar Template' : 'Cadastrar Novo Template'}
                </h2>
              </div>
              <button onClick={() => setIsEditorOpen(false)} className="p-1 text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditorSubmit} className="space-y-5">
              {/* Form Inputs: Title & Store Dropdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="text-slate-300 block mb-1 font-semibold">Nome do Template *</label>
                  <input
                    type="text"
                    required
                    value={editorTitle}
                    onChange={e => setEditorTitle(e.target.value)}
                    placeholder="Ex: Oferta Padrão com Frete Grátis"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold">Loja / Marketplace</label>
                    {editorStore !== 'Todas as Lojas' && (
                      <button
                        type="button"
                        onClick={() => setEditorStore('Todas as Lojas')}
                        className="text-[10px] text-indigo-400 hover:underline"
                      >
                        Limpar seleção
                      </button>
                    )}
                  </div>
                  <select
                    value={editorStore}
                    onChange={e => setEditorStore(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Todas as Lojas">Todas as Lojas</option>
                    <option value="Amazon">Amazon</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="AliExpress">AliExpress</option>
                  </select>
                </div>
              </div>

              {/* Textarea Header + "Usar Exemplo" Button */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300">Conteúdo do Template *</label>
                  <button
                    type="button"
                    onClick={handleFillExample}
                    className="px-3 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Usar exemplo
                  </button>
                </div>

                <textarea
                  ref={editorTextareaRef}
                  rows={8}
                  value={editorContent}
                  onChange={e => setEditorContent(e.target.value)}
                  placeholder="Escreva seu template aqui..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 leading-relaxed"
                />

                {/* Tip Box */}
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                  <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    Use variáveis como <code className="text-indigo-300">{'{produto}'}</code> para inserir dados dinâmicos. Clique nas variáveis e condicionais abaixo para inseri-las direto no editor.
                  </span>
                </div>
              </div>

              {/* 4. Variáveis de Texto (Chips Clicáveis) */}
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  Variáveis de Texto (Clique para Inserir)
                </h4>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    '{cta}',
                    '{produto}',
                    '{loja}',
                    '{preco}',
                    '{preco_original}',
                    '{cupom}',
                    '{link}',
                    '{condicoes_pagamento}',
                    '{cupom_desconto}',
                    '{cupom_link}',
                    '{preco_unitario}',
                    '{preco_recorrencia}',
                    '{link_site}'
                  ].map(chip => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => insertTokenIntoEditor(chip)}
                      className="px-2.5 py-1 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 font-mono text-[11px] font-medium transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Condicionais (Lógica de exibição no template) */}
              <div className="space-y-3 border-t border-slate-800 pt-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  Condicionais & Sintaxe
                </h4>

                {/* Fixed Reference Syntax Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-sans font-bold block text-[10px]">Condicional Simples:</span>
                    <pre className="text-emerald-400 font-mono">
{`[se variavel]
Texto quando existe
[fim]`}
                    </pre>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-sans font-bold block text-[10px]">Condicional Alternativa:</span>
                    <pre className="text-indigo-400 font-mono">
{`[se variavel]
Quando existe
[senão]
Quando não existe
[fim]`}
                    </pre>
                  </div>
                </div>

                {/* Conditional Chips List with Descriptions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {[
                    { token: '[se frete_gratis]\n🚚 Frete Grátis!\n[fim]', label: '[se frete_gratis]', desc: 'Exibe quando o produto tem frete grátis' },
                    { token: '[se internacional]\n✈️ Compra Internacional\n[fim]', label: '[se internacional]', desc: 'Exibe quando é compra internacional' },
                    { token: '[se cupom]\n🎟️ Cupom: {cupom}\n[fim]', label: '[se cupom]', desc: 'Exibe o código do cupom (ex: CUPOM20)' },
                    { token: '[se cupom_desconto]\n🔥 {cupom_desconto} OFF\n[fim]', label: '[se cupom_desconto]', desc: 'Exibe o desconto do cupom (ex: 10% OFF)' },
                    { token: '[se cupom_link]\n🔗 Resgate o cupom: {cupom_link}\n[fim]', label: '[se cupom_link]', desc: 'Resgatado por link em vez de código' },
                    { token: '[se preco_original]\nDe ~R$ {preco_original}~\n[fim]', label: '[se preco_original]', desc: 'Exibe quando existe preço original' },
                    { token: '[se condicoes_pagamento]\n💳 {condicoes_pagamento}\n[fim]', label: '[se condicoes_pagamento]', desc: 'Exibe condições de parcelamento' },
                    { token: '[se pix]\n⚡ Desconto no PIX\n[fim]', label: '[se pix]', desc: 'Exibe quando aceita pagamento via PIX' }
                  ].map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => insertTokenIntoEditor(item.token)}
                      className="p-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between gap-2 transition-colors group"
                    >
                      <span className="font-mono text-emerald-400 text-[11px] font-bold group-hover:text-emerald-300">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-slate-400 line-clamp-1">{item.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status & Default Checkboxes */}
              <div className="flex items-center gap-6 pt-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editorIsDefault}
                    onChange={e => setEditorIsDefault(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="font-bold text-amber-400">Definir como Template Padrão</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editorStatus === 'ativo'}
                    onChange={e => setEditorStatus(e.target.checked ? 'ativo' : 'inativo')}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span className="text-slate-300">Template Ativo</span>
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="pt-3 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30"
                >
                  {editingTemplateId ? 'Atualizar Template' : 'Salvar Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB: GERADOR IA ORIGINAL                                             */}
      {/* ==================================================================== */}
      {selectedTemplateTab === 'gerador' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Controls Column */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800/80 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Parâmetros de Geração com Gemini 2.5</h2>
              </div>

              <button
                onClick={() => setIsAiTrainingOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-all"
              >
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                Estilo: {aiTone}
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Selecionar Produto da Sua Lista:</label>
                <select
                  value={selectedProductId}
                  onChange={e => handleProductSelect(e.target.value)}
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
                  onChange={e => setProductName(e.target.value)}
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
                    onChange={e => setPrice(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold text-emerald-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Preço Original (R$):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={originalPrice}
                    onChange={e => setOriginalPrice(parseFloat(e.target.value) || 0)}
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
                    onChange={e => setCouponCode(e.target.value)}
                    placeholder="Ex: CUPOM10"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-300">Marketplace / Origem:</label>
                  <select
                    value={marketplace}
                    onChange={e => setMarketplace(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Amazon">Amazon</option>
                    <option value="Mercado Livre">Mercado Livre</option>
                    <option value="Shopee">Shopee</option>
                    <option value="AliExpress">AliExpress</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Tom de Voz & Estilo da Copy:</label>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
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
                    Gerar Cópia de Alta Conversão com IA Treinada
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
                  <ShoppingBag className="w-5 h-5 text-emerald-400" />
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
      )}
    </div>
  );
};
