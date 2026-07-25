import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  Brain,
  Send,
  Sparkles,
  RotateCcw,
  Code,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  X,
  Edit2,
  Check,
  CheckCircle,
  HelpCircle,
  MessageSquare,
  ChevronRight,
  Info,
  Layers,
  ArrowRight
} from 'lucide-react';

export const TrainAiView: React.FC = () => {
  const {
    ctaProfile,
    setCtaProfile,
    updateCtaProfile,
    trainChat,
    sendTrainChatMessage,
    resetTrainAi,
    generateCtaSample,
    addLog
  } = useApp();

  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [testProduct, setTestProduct] = useState('Smart TV 4K QLED 55"');
  
  // Suggested CTAs states
  const [generatedCtas, setGeneratedCtas] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [dislikedIndices, setDislikedIndices] = useState<number[]>([]);
  const [dislikeReasons, setDislikeReasons] = useState<Record<number, string>>({});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  // Debug JSON modal
  const [showJsonModal, setShowJsonModal] = useState(false);

  // Chat scroll anchor
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trainChat, isTyping]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage;
    setInputMessage('');
    setIsTyping(true);

    try {
      await sendTrainChatMessage(userText);
    } catch {
      addLog('error', 'Treinamento IA', 'Erro ao processar mensagem.');
    } finally {
      setIsTyping(false);
    }
  };

  const handleGenerateSamples = async () => {
    setIsGenerating(true);
    setDislikedIndices([]);
    setDislikeReasons({});
    try {
      const samples = await generateCtaSample(testProduct);
      setGeneratedCtas(samples);
      addLog('success', 'Treinamento IA', 'Exemplos de CTA gerados com sucesso baseados no perfil.');
    } catch {
      addLog('error', 'Treinamento IA', 'Falha ao gerar exemplos.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Like CTA sample
  const handleLikeCta = (text: string) => {
    if (ctaProfile.exemplos_bons.includes(text)) return;
    updateCtaProfile({
      exemplos_bons: [...ctaProfile.exemplos_bons, text]
    });
    addLog('success', 'Treinamento IA', 'CTA adicionado à base de bons exemplos!');
  };

  // Dislike CTA sample
  const handleDislikeCta = (index: number, text: string) => {
    setDislikedIndices(prev => [...prev, index]);
  };

  // Submit dislike reasons
  const handleSubmitDislikeReason = (index: number, text: string) => {
    const reason = dislikeReasons[index] || '';
    
    // Add to examples_ruins and adapt profile guidelines
    const lowerReason = reason.toLowerCase();
    const newKeywords = [...ctaProfile.palavras_proibidas];

    // If reason hints at a word, let's ban it
    if (lowerReason.includes('palavra') || lowerReason.includes('termo')) {
      const match = reason.match(/"([^"]+)"|'([^']+)'/);
      if (match) {
        newKeywords.push((match[1] || match[2]).trim().toLowerCase());
      }
    }

    updateCtaProfile({
      exemplos_ruins: [...(ctaProfile.exemplos_ruins || []), text],
      palavras_proibidas: Array.from(new Set(newKeywords)),
      observacoes_livres: ctaProfile.observacoes_livres + ` (Evitar CTAs estilo: ${reason})`
    });

    // Remove from generated lists
    addLog('warning', 'Treinamento IA', 'Preferência registrada e CTA removido das sugestões.');
    setGeneratedCtas(prev => prev.filter((_, i) => i !== index));
  };

  // Start editing suggested CTA inline
  const handleStartEdit = (index: number, text: string) => {
    setEditingIndex(index);
    setEditText(text);
  };

  // Save edited suggested CTA
  const handleSaveEdit = (index: number) => {
    if (!editText.trim()) return;
    
    const updated = [...generatedCtas];
    updated[index] = editText;
    setGeneratedCtas(updated);
    
    // Auto-approve the corrected text
    updateCtaProfile({
      exemplos_bons: [...ctaProfile.exemplos_bons, editText]
    });

    setEditingIndex(null);
    addLog('success', 'Treinamento IA', 'CTA editado e cadastrado como bom exemplo.');
  };

  // Remove constraint directly from Learned Panel
  const handleRemoveConstraint = (type: 'proibida' | 'favorita' | 'bom_exemplo' | 'emoji', value: string) => {
    if (type === 'proibida') {
      updateCtaProfile({
        palavras_proibidas: ctaProfile.palavras_proibidas.filter(w => w !== value)
      });
    } else if (type === 'favorita') {
      updateCtaProfile({
        palavras_favoritas: ctaProfile.palavras_favoritas.filter(w => w !== value)
      });
    } else if (type === 'bom_exemplo') {
      updateCtaProfile({
        exemplos_bons: ctaProfile.exemplos_bons.filter(w => w !== value)
      });
    } else if (type === 'emoji') {
      updateCtaProfile({
        emojis_preferidos: ctaProfile.emojis_preferidos.filter(w => w !== value)
      });
    }
  };

  // Safe reset confirm
  const handleResetConfirm = () => {
    if (window.confirm('Tem certeza que deseja limpar todo o histórico de conversa e o perfil treinado?')) {
      resetTrainAi();
      setGeneratedCtas([]);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Início</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-white font-semibold">Treinar minha IA</span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
              <Brain className="w-6 h-6 text-violet-400" />
              Treinar minha Inteligência Artificial
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Ensine a IA como você gosta de escrever seus CTAs (Chamadas para Ação) conversando livremente, sem formulários.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowJsonModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-800 transition-all"
            >
              <Code className="w-4 h-4" />
              Ver Perfil JSON
            </button>

            <button
              onClick={handleResetConfirm}
              className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs flex items-center gap-1.5 border border-rose-500/20 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              Reiniciar Treino
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Chat vs Learned Status Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Chat Interface (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col h-[520px] rounded-3xl bg-slate-900 border border-slate-800 shadow-xl overflow-hidden">
          {/* Chat Header */}
          <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-xs font-extrabold text-white">Assistente de Copywriting</h3>
              <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Em sintonia com suas preferências
              </p>
            </div>
          </div>

          {/* Chat Messages Log */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {trainChat.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-violet-600 text-white rounded-tr-none'
                      : 'bg-slate-850 border border-slate-800 text-slate-200 rounded-tl-none'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="p-3.5 rounded-2xl bg-slate-850 border border-slate-800 text-slate-400 rounded-tl-none flex items-center gap-2 text-xs">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span>IA analisando preferências...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message Input Form */}
          <form onSubmit={handleSendMessage} className="p-3 bg-slate-950/80 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              placeholder="Digite aqui (Ex: 'Quero um tom urgente, use emojis como 🔥 🚨 e evite a palavra barato')"
              className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
            <button
              type="submit"
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-md shadow-violet-600/10 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: What AI Has Learned Panel (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-850 pb-3">
              <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                <Brain className="w-4.5 h-4.5 text-violet-400" />
                O que a IA já aprendeu:
              </h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 border border-violet-500/20 font-mono">
                Perfil de CTA Ativo
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Tom preferido */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400 font-semibold">Tom da Linguagem:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 border border-indigo-500/25 font-bold uppercase tracking-wider text-[10px]">
                  {ctaProfile.tom || 'Não definido'}
                </span>
              </div>

              {/* Tamanho */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-850">
                <span className="text-slate-400 font-semibold">Tamanho das Frases:</span>
                <span className="px-2.5 py-0.5 rounded-md bg-pink-500/10 text-pink-300 border border-pink-500/25 font-bold uppercase tracking-wider text-[10px]">
                  {ctaProfile.tamanho_preferido || 'médio'}
                </span>
              </div>

              {/* Emojis Favoritos */}
              <div className="space-y-2">
                <span className="text-slate-400 font-semibold block">Emojis Preferidos:</span>
                <div className="flex flex-wrap gap-1.5">
                  {ctaProfile.emojis_preferidos.length === 0 ? (
                    <span className="text-slate-600 italic">Nenhum emoji preferido ainda.</span>
                  ) : (
                    ctaProfile.emojis_preferidos.map(emoji => (
                      <span
                        key={emoji}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-850 text-slate-200"
                      >
                        <span>{emoji}</span>
                        <button
                          onClick={() => handleRemoveConstraint('emoji', emoji)}
                          className="hover:text-rose-400 transition-colors"
                        >
                          <X className="w-3 h-3 text-slate-500" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Palavras Proibidas */}
              <div className="space-y-2">
                <span className="text-slate-400 font-semibold block">Nunca Usar (Palavras Proibidas):</span>
                <div className="flex flex-wrap gap-1.5">
                  {ctaProfile.palavras_proibidas.length === 0 ? (
                    <span className="text-slate-600 italic">Nenhuma palavra proibida.</span>
                  ) : (
                    ctaProfile.palavras_proibidas.map(word => (
                      <span
                        key={word}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-mono text-[11px]"
                      >
                        <span>"{word}"</span>
                        <button
                          onClick={() => handleRemoveConstraint('proibida', word)}
                          className="hover:text-rose-400 transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Exemplos Bons Cadastrados */}
              <div className="space-y-2">
                <span className="text-slate-400 font-semibold block">Modelos de Referência Aprovados:</span>
                <div className="space-y-1.5">
                  {ctaProfile.exemplos_bons.length === 0 ? (
                    <span className="text-slate-600 italic block">Nenhum exemplo aprovado ainda.</span>
                  ) : (
                    ctaProfile.exemplos_bons.map(sample => (
                      <div
                        key={sample}
                        className="p-2.5 rounded-xl bg-slate-950 border border-slate-850 flex items-start justify-between gap-3 text-slate-300 leading-relaxed font-sans"
                      >
                        <span>{sample}</span>
                        <button
                          onClick={() => handleRemoveConstraint('bom_exemplo', sample)}
                          className="text-slate-500 hover:text-rose-400 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SECTION: TEST LOOP (TESTAR A IA)                                    */}
      {/* ==================================================================== */}
      <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-4.5 h-4.5 text-amber-400 animate-pulse" />
              Testar a Geração da IA
            </h3>
            <p className="text-[11px] text-slate-400">
              Gere sugestões instantâneas baseadas no perfil treinado acima e aprove/refine os resultados.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end text-xs">
          <div className="md:col-span-2">
            <label className="text-slate-300 block mb-1 font-semibold">Nome do Produto de Teste</label>
            <input
              type="text"
              value={testProduct}
              onChange={e => setTestProduct(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-violet-500"
            />
          </div>

          <button
            onClick={handleGenerateSamples}
            disabled={isGenerating}
            className="w-full px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-violet-600/10 transition-all hover:scale-[1.02]"
          >
            {isGenerating ? 'IA escrevendo...' : '⚡ Gerar exemplos de CTA'}
          </button>
        </div>

        {/* Generated CTAs output cards */}
        {generatedCtas.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-3">
            {generatedCtas.map((cta, index) => {
              const isEditing = editingIndex === index;
              const isDisliked = dislikedIndices.includes(index);

              return (
                <div
                  key={index}
                  className="p-5 rounded-2xl bg-slate-950 border border-slate-850 flex flex-col justify-between gap-4"
                >
                  {isEditing ? (
                    <textarea
                      rows={3}
                      value={editText}
                      onChange={e => setEditText(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none"
                    />
                  ) : (
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">{cta}</p>
                  )}

                  {/* Feedback action loops */}
                  <div className="flex items-center justify-between border-t border-slate-850 pt-3">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSaveEdit(index)}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Salvar
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px]"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleLikeCta(cta)}
                            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors"
                            title="Aprovar (Gostei)"
                          >
                            <ThumbsUp className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDislikeCta(index, cta)}
                            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
                            title="Descartar (Não gostei)"
                          >
                            <ThumbsDown className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          onClick={() => handleStartEdit(index, cta)}
                          className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Editar
                        </button>
                      </>
                    )}
                  </div>

                  {/* Dislike context follow-up */}
                  {isDisliked && (
                    <div className="mt-2 space-y-2 border-t border-slate-850 pt-2">
                      <label className="text-[10px] text-slate-400 block font-semibold">
                        Por que não gostou? (Opcional)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ex: Não use a palavra 'promoção'"
                          value={dislikeReasons[index] || ''}
                          onChange={e => setDislikeReasons({ ...dislikeReasons, [index]: e.target.value })}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-white"
                        />
                        <button
                          onClick={() => handleSubmitDislikeReason(index, cta)}
                          className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px]"
                        >
                          Registrar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================================================================== */}
      {/* MODAL: VIEW RAW PROFILE JSON (DEBUG/EXPORTS)                        */}
      {/* ==================================================================== */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Code className="w-5 h-5 text-violet-400" />
                Perfil JSON de CTA Treinado
              </h2>
              <button onClick={() => setShowJsonModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-slate-400">
                Veja o JSON estruturado gerado e atualizado incrementalmente a partir da sua conversa.
              </p>

              <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 font-mono overflow-auto max-h-80 leading-relaxed">
                {JSON.stringify(ctaProfile, null, 2)}
              </pre>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowJsonModal(false)}
                className="px-5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
