import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CtaProfile, CtaContext } from '../types';
import {
  Brain,
  Send,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Trash2,
  Eye,
  X,
  Plus,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Check,
  AlertTriangle,
  Clock,
  Zap,
  MessageSquare,
  Settings
} from 'lucide-react';

// ─── WhatsApp-style markdown renderer ────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del class="opacity-60">$1</del>')
    .replace(/`([^`\n]+)`/g, '<code class="bg-white/10 px-1 rounded text-[11px] font-mono">$1</code>');
}

export const AiTrainingView: React.FC = () => {
  const {
    ctaProfile,
    updateCtaProfile,
    generateCtaFromProfile,
    resetCtaProfile,
    trainingMessages,
    sendTrainingMessage,
    addCtaFeedback,
    ctaFeedbacks
  } = useApp();

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'chat' | 'perfil'>('chat');
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [generatedExamples, setGeneratedExamples] = useState<string[]>([]);
  const [editingExample, setEditingExample] = useState<{ idx: number; text: string } | null>(null);
  const [badReasonIdx, setBadReasonIdx] = useState<number | null>(null);
  const [badReasonText, setBadReasonText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trainingMessages, isTyping]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');
    setIsTyping(true);

    try {
      await sendTrainingMessage(text);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleGenerateExamples = () => {
    setIsGenerating(true);
    const contexts: CtaContext[] = [
      { produto: 'Fone Bluetooth Sony', preco: '149,90', preco_original: '229,90', loja: 'Amazon', frete_gratis: true },
      { produto: 'Tênis Nike Air Max', preco: '299,00', preco_original: '499,00', loja: 'Mercado Livre', pix: true, cupom: 'NIKE15' },
      { produto: 'Perfume Importado Dior', preco: '399,90', loja: 'AliExpress', internacional: true }
    ];
    const examples = contexts.map(ctx => generateCtaFromProfile(ctx));
    setGeneratedExamples(examples);
    setIsGenerating(false);
  };

  const handleFeedbackGood = (idx: number, text: string) => {
    const final = editingExample?.idx === idx ? editingExample.text : text;
    addCtaFeedback({ ctaText: text, editedVersion: final, rating: 'good', origin: 'training' });
    setGeneratedExamples(prev => prev.map((e, i) => i === idx ? '✅ ' + e : e));
    setEditingExample(null);
  };

  const handleFeedbackBad = (idx: number, text: string) => {
    if (badReasonIdx === idx) {
      addCtaFeedback({ ctaText: text, rating: 'bad', reason: badReasonText, origin: 'training' });
      setBadReasonIdx(null);
      setBadReasonText('');
      setGeneratedExamples(prev => prev.map((e, i) => i === idx ? '❌ ' + e : e));
    } else {
      setBadReasonIdx(idx);
    }
  };

  const removeFromProfile = (field: keyof CtaProfile, value: string) => {
    const arr = ctaProfile[field] as string[];
    updateCtaProfile({ [field]: arr.filter(v => v !== value) } as any, 'Remoção manual via painel');
  };

  const profileFields: { label: string; emoji: string; field: keyof CtaProfile; type: 'text' | 'array' | 'bool' | 'select' }[] = [
    { label: 'Tom do CTA', emoji: '🎭', field: 'tom', type: 'select' },
    { label: 'Tamanho', emoji: '📏', field: 'tamanhoPreferido', type: 'select' },
    { label: 'Usa emojis', emoji: '😀', field: 'usaEmoji', type: 'bool' },
    { label: 'Caixa alta', emoji: '🔠', field: 'usaCaixaAlta', type: 'bool' },
    { label: 'Emojis preferidos', emoji: '✨', field: 'emojisPreferidos', type: 'array' },
    { label: 'Palavras favoritas', emoji: '✅', field: 'palavrasFavoritas', type: 'array' },
    { label: 'Palavras proibidas', emoji: '🚫', field: 'palavrasProibidas', type: 'array' },
    { label: 'Exemplos aprovados', emoji: '👍', field: 'exemplosBons', type: 'array' },
  ];

  // ─── Profile Panel ───────────────────────────────────────────────────────
  const ProfilePanel = () => (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin gap-4 pb-4">
      {/* Profile Status Bar */}
      <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/20 border border-violet-700/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-violet-300 flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5" />
            Perfil de IA
          </span>
          <span className="text-[10px] text-slate-400 font-mono">
            {ctaProfile.changelog.length} atualização(ões)
          </span>
        </div>
        <div className="text-[11px] text-slate-300 space-y-0.5">
          <p>🎭 <strong>Tom:</strong> {ctaProfile.tom}</p>
          <p>📏 <strong>Tamanho:</strong> {ctaProfile.tamanhoPreferido}</p>
          <p>😀 <strong>Emojis:</strong> {ctaProfile.usaEmoji ? ctaProfile.emojisPreferidos.join(' ') : 'Desativado'}</p>
          <p>🧠 <strong>CTAs gerados:</strong> {ctaProfile.ctasGerados.length}</p>
        </div>
      </div>

      {/* Field cards */}
      {profileFields.map(({ label, emoji, field, type }) => {
        const value = ctaProfile[field];

        return (
          <div key={field} className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                <span>{emoji}</span> {label}
              </span>
            </div>

            {type === 'bool' && (
              <button
                onClick={() => updateCtaProfile({ [field]: !value } as any, 'Edição manual no painel')}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                  value
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {value ? 'Ativado' : 'Desativado'}
              </button>
            )}

            {type === 'select' && field === 'tom' && (
              <select
                value={ctaProfile.tom}
                onChange={e => updateCtaProfile({ tom: e.target.value as any }, 'Edição manual no painel')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                {['urgente', 'descontraido', 'formal', 'divertido', 'luxuoso'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            )}

            {type === 'select' && field === 'tamanhoPreferido' && (
              <select
                value={ctaProfile.tamanhoPreferido}
                onChange={e => updateCtaProfile({ tamanhoPreferido: e.target.value as any }, 'Edição manual no painel')}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                {['curto', 'medio', 'longo'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            )}

            {type === 'array' && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {(value as string[]).length === 0 && (
                  <span className="text-[10px] text-slate-500 italic">Nenhum registrado ainda</span>
                )}
                {(value as string[]).map((item, i) => (
                  <div key={i} className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-200">
                    <span>{item}</span>
                    <button
                      onClick={() => removeFromProfile(field, item)}
                      className="text-slate-400 hover:text-rose-400 transition-colors ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => setShowJsonModal(true)}
          className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
        >
          <Eye className="w-3.5 h-3.5" />
          Ver JSON
        </button>
        <button
          onClick={() => setShowResetConfirm(true)}
          className="flex-1 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-rose-500/20"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Reiniciar
        </button>
      </div>
    </div>
  );

  // ─── Chat Panel ──────────────────────────────────────────────────────────
  const ChatPanel = () => (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pr-1 pb-4">
        {trainingMessages.length === 0 && (
          <div className="p-5 rounded-3xl bg-slate-800/40 border border-slate-700/40 space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-sm">Assistente IA</span>
            </div>
            <p>
              👋 Olá! Sou sua IA de CTA personalizada. Estou aqui para aprender <strong>exatamente</strong> como você gosta dos seus textos de divulgação.
            </p>
            <p>
              Pode conversar comigo de forma <strong>natural</strong> — não precisa seguir nenhum formato específico. Você pode:
            </p>
            <ul className="space-y-1 pl-2">
              <li>✅ <strong>Descrever seu estilo:</strong> "prefiro algo mais urgente e curto"</li>
              <li>✅ <strong>Dar comandos diretos:</strong> "nunca usa a palavra imperdível"</li>
              <li>✅ <strong>Pedir exemplos:</strong> "me mostra 3 CTAs de teste"</li>
              <li>✅ <strong>Ver o que aprendi:</strong> "o que você sabe sobre mim?"</li>
              <li>✅ <strong>Dar feedback:</strong> "esse ficou muito forçado"</li>
            </ul>
            <p className="text-slate-400">
              Cada preferência que você compartilhar vai ser usada automaticamente nos seus Templates e no Monitor de Grupos. 🚀
            </p>
          </div>
        )}

        {trainingMessages.map(msg => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'ai' && (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mr-2 mt-1">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
            )}

            <div
              className={`max-w-[80%] p-3.5 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-sm'
              }`}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(msg.content).replace(/\n/g, '<br/>')
                }}
              />
              {msg.profileChanges && Object.keys(msg.profileChanges).length > 0 && (
                <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-1 text-[10px] text-emerald-300">
                  <Zap className="w-3 h-3" />
                  Perfil atualizado: {Object.keys(msg.profileChanges).join(', ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mr-2 mt-1">
              <Brain className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-800/80 border border-slate-700/50">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="mt-3 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          rows={2}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva como quiser... ex: 'prefiro CTAs curtos e sem emoji' ou 'gera um exemplo'"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none leading-relaxed"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim() || isTyping}
          className="p-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-violet-600/20"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-slate-500 mt-1.5 text-center">
        Enter para enviar · Shift+Enter para quebrar linha
      </p>
    </div>
  );

  // ─── Test / Examples Section ─────────────────────────────────────────────
  const TestSection = () => (
    <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            Testar o Perfil Atual
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Gera 3 CTAs diferentes usando o seu perfil atual. Dê feedback para continuar treinando.
          </p>
        </div>
        <button
          onClick={handleGenerateExamples}
          disabled={isGenerating}
          className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all hover:scale-105 shrink-0"
        >
          <Sparkles className="w-4 h-4" />
          Gerar Exemplos
        </button>
      </div>

      {generatedExamples.length > 0 && (
        <div className="space-y-4">
          {generatedExamples.map((cta, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-bold text-white">Opção {idx + 1}</span>
                <span className="text-slate-500 font-mono text-[10px]">Anti-repetição ativo ✓</span>
              </div>

              {editingExample?.idx === idx ? (
                <textarea
                  rows={4}
                  value={editingExample.text}
                  onChange={e => setEditingExample({ idx, text: e.target.value })}
                  className="w-full bg-slate-900 border border-violet-500 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none resize-none leading-relaxed"
                />
              ) : (
                <div className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                  {cta}
                </div>
              )}

              {badReasonIdx === idx && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Por que não gostou? (opcional)"
                    value={badReasonText}
                    onChange={e => setBadReasonText(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                  />
                  <button
                    onClick={() => handleFeedbackBad(idx, cta)}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                  >
                    Confirmar
                  </button>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => handleFeedbackGood(idx, cta)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold border border-emerald-500/25 flex items-center gap-1.5 transition-colors"
                >
                  <ThumbsUp className="w-3.5 h-3.5" /> Gostei
                </button>
                <button
                  onClick={() => handleFeedbackBad(idx, cta)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 transition-colors"
                >
                  <ThumbsDown className="w-3.5 h-3.5" /> Não gostei
                </button>
                <button
                  onClick={() => setEditingExample(editingExample?.idx === idx ? null : { idx, text: cta })}
                  className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/20 flex items-center gap-1.5 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editingExample?.idx === idx ? (
                    <span onClick={() => handleFeedbackGood(idx, cta)}>Salvar</span>
                  ) : 'Editar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {generatedExamples.length === 0 && (
        <div className="text-center text-xs text-slate-500 py-4">
          Clique em "Gerar Exemplos" para ver como seus CTAs ficam com o perfil atual.
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <span>Início</span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-semibold">Treinar minha IA</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <Brain className="w-6 h-6 text-violet-400" />
            Treinar minha IA de CTA
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Ensine a IA como você gosta dos seus textos. O aprendizado alimenta automaticamente os Templates e o Monitor de Grupos.
          </p>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800 self-start">
          <button
            onClick={() => setActiveMobileTab('chat')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMobileTab === 'chat' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Chat
          </button>
          <button
            onClick={() => setActiveMobileTab('perfil')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeMobileTab === 'perfil' ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Perfil
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="flex gap-6 flex-1 min-h-0">
        {/* LEFT: Chat — hidden on mobile when showing perfil tab */}
        <div className={`flex-1 flex flex-col min-h-0 ${activeMobileTab === 'perfil' ? 'hidden lg:flex' : 'flex'}`}>
          {/* Chat wrapper */}
          <div className="flex-1 p-5 rounded-3xl bg-slate-900/90 border border-slate-800 flex flex-col min-h-0 shadow-xl" style={{ maxHeight: '65vh' }}>
            <ChatPanel />
          </div>
        </div>

        {/* RIGHT: Profile Panel — hidden on mobile when showing chat tab */}
        <div className={`w-full lg:w-80 xl:w-96 shrink-0 ${activeMobileTab === 'chat' ? 'hidden lg:block' : 'block'}`}>
          <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col gap-4" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <h2 className="text-sm font-bold text-white flex items-center gap-2 shrink-0">
              <Brain className="w-4 h-4 text-violet-400" />
              O que a IA Aprendeu
              <span className="ml-auto text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {ctaProfile.changelog.length} mudanças
              </span>
            </h2>
            <ProfilePanel />
          </div>
        </div>
      </div>

      {/* Test Section */}
      <TestSection />

      {/* ── JSON Modal ─────────────────────────────────────────────────────── */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-violet-400" />
                Perfil Completo (JSON)
              </h2>
              <button onClick={() => setShowJsonModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950 rounded-2xl p-4 max-h-96 overflow-auto leading-relaxed border border-slate-800">
              {JSON.stringify({ ...ctaProfile, ctasGerados: `[${ctaProfile.ctasGerados.length} CTAs gerados]` }, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* ── Reset Confirm Modal ─────────────────────────────────────────────── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <h2 className="text-base font-bold text-white">Reiniciar Treinamento?</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Todas as preferências aprendidas, o histórico do chat e os exemplos salvos serão apagados permanentemente. O histórico de CTAs gerados será mantido para o sistema anti-repetição.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  resetCtaProfile();
                  setGeneratedExamples([]);
                  setShowResetConfirm(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
              >
                Reiniciar tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
