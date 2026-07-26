import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { CtaProfile, CtaContext, TrainingMessage } from '../types';
import {
  Brain,
  Send,
  ChevronRight,
  Sparkles,
  RefreshCw,
  Eye,
  X,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  AlertTriangle,
  Zap,
  MessageSquare,
  Settings,
  Key,
  CheckCircle2,
  Loader2
} from 'lucide-react';

// ─── WhatsApp-style markdown renderer (module-level, never recreated) ─────────
function renderMd(text: string): string {
  return text
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_\n]+)_/g, '<em>$1</em>')
    .replace(/~([^~\n]+)~/g, '<del class="opacity-60">$1</del>');
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
interface BubbleProps { msg: TrainingMessage }
const Bubble: React.FC<BubbleProps> = ({ msg }) => (
  <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
    {msg.role === 'ai' && (
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mr-2 mt-1">
        <Brain className="w-3.5 h-3.5 text-white" />
      </div>
    )}
    <div className={`max-w-[80%] p-3.5 rounded-2xl text-xs leading-relaxed ${
      msg.role === 'user'
        ? 'bg-indigo-600 text-white rounded-br-sm'
        : 'bg-slate-800/80 border border-slate-700/50 text-slate-200 rounded-bl-sm'
    }`}>
      <div dangerouslySetInnerHTML={{ __html: renderMd(msg.content).replace(/\n/g, '<br/>') }} />
      {msg.profileChanges && Object.keys(msg.profileChanges).length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/20 flex items-center gap-1 text-[10px] text-emerald-300">
          <Zap className="w-3 h-3" />
          Perfil atualizado: {Object.keys(msg.profileChanges).join(', ')}
        </div>
      )}
    </div>
  </div>
);

// ─── Typing Indicator ─────────────────────────────────────────────────────────
const TypingDots: React.FC = () => (
  <div className="flex justify-start">
    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mr-2 mt-1">
      <Brain className="w-3.5 h-3.5 text-white" />
    </div>
    <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-slate-800/80 border border-slate-700/50">
      <div className="flex gap-1 items-center">
        {[0, 150, 300].map(d => (
          <div key={d} className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  </div>
);

// ─── Chip (removable tag) ─────────────────────────────────────────────────────
interface ChipProps { label: string; onRemove: () => void }
const Chip: React.FC<ChipProps> = ({ label, onRemove }) => (
  <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-200">
    <span>{label}</span>
    <button onClick={onRemove} className="text-slate-400 hover:text-rose-400 transition-colors ml-0.5">
      <X className="w-3 h-3" />
    </button>
  </div>
);

// ─── MAIN VIEW ────────────────────────────────────────────────────────────────
export const AiTrainingView: React.FC = () => {
  const {
    ctaProfile,
    updateCtaProfile,
    generateCtaFromProfile,
    resetCtaProfile,
    trainingMessages,
    sendTrainingMessage,
    addCtaFeedback,
    openAiApiKey,
    setOpenAiApiKey,
  } = useApp();

  const [inputText, setInputText]           = useState('');
  const [isTyping, setIsTyping]             = useState(false);
  const [mobileTab, setMobileTab]           = useState<'chat' | 'perfil'>('chat');
  const [showJson, setShowJson]             = useState(false);
  const [showReset, setShowReset]           = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [tempKeyInput, setTempKeyInput]     = useState('');
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyError, setKeyError]               = useState<string | null>(null);
  const [examples, setExamples]             = useState<string[]>([]);
  const [editIdx, setEditIdx]               = useState<number | null>(null);
  const [editText, setEditText]             = useState('');
  const [badIdx, setBadIdx]                 = useState<number | null>(null);
  const [badReason, setBadReason]           = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleTestAndSaveKey = async () => {
    const keyToTest = tempKeyInput.trim();
    if (!keyToTest) {
      setKeyError('Por favor, digite a chave da OpenAI.');
      return;
    }
    if (!keyToTest.startsWith('sk-')) {
      setKeyError('Formato inválido. As chaves da OpenAI começam com "sk-".');
      return;
    }

    setIsValidatingKey(true);
    setKeyError(null);

    try {
      let testRes: Response;
      try {
        // Direct browser fetch to OpenAI API (works on Vercel deployment without backend)
        testRes = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${keyToTest}` }
        });
      } catch (directErr) {
        // Fallback to server endpoint if direct fetch fails
        testRes = await fetch('/api/ai/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: keyToTest })
        });
      }

      if (testRes.ok) {
        setOpenAiApiKey(keyToTest);
        setShowApiKeyModal(false);
        setKeyError(null);
        return;
      }

      const data = await testRes.json().catch(() => ({}));
      if (testRes.status === 401) {
        setKeyError('Chave de API incorreta ou desativada na OpenAI. Verifique sua chave em platform.openai.com.');
      } else if (testRes.status === 429) {
        setKeyError('Sua conta na OpenAI está sem saldo (cota excedida). Adicione saldo na plataforma OpenAI.');
      } else {
        setKeyError(data.error || `A chave retornou erro da OpenAI (${testRes.status}).`);
      }
    } catch (err: any) {
      setKeyError('Falha de conexão ao conectar com a OpenAI. Verifique sua internet.');
    } finally {
      setIsValidatingKey(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trainingMessages, isTyping]);

  // Guard: ensure arrays are always arrays (safety for old persisted data)
  const safe = <T,>(val: T[] | undefined | null): T[] => Array.isArray(val) ? val : [];

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || isTyping) return;
    setInputText('');
    setIsTyping(true);
    try { await sendTrainingMessage(text); }
    finally { setIsTyping(false); }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleGenerateExamples = () => {
    const ctxs: CtaContext[] = [
      { produto: 'Fone Bluetooth Sony', preco: '149,90', preco_original: '229,90', loja: 'Amazon', frete_gratis: true },
      { produto: 'Tênis Nike Air Max', preco: '299,00', preco_original: '499,00', loja: 'Mercado Livre', pix: true, cupom: 'NIKE15' },
      { produto: 'Perfume Importado Dior', preco: '399,90', loja: 'AliExpress', internacional: true },
    ];
    setExamples(ctxs.map(c => generateCtaFromProfile(c)));
    setEditIdx(null);
    setBadIdx(null);
  };

  const doGood = (idx: number) => {
    const final = editIdx === idx ? editText : examples[idx];
    addCtaFeedback({ ctaText: examples[idx], editedVersion: final, rating: 'good', origin: 'training' });
    setExamples(prev => prev.map((e, i) => i === idx ? '✅ ' + e : e));
    setEditIdx(null);
  };

  const doBad = (idx: number) => {
    if (badIdx === idx) {
      addCtaFeedback({ ctaText: examples[idx], rating: 'bad', reason: badReason, origin: 'training' });
      setBadIdx(null); setBadReason('');
      setExamples(prev => prev.map((e, i) => i === idx ? '❌ ' + e : e));
    } else {
      setBadIdx(idx);
    }
  };

  const removeField = (field: keyof CtaProfile, value: string) => {
    const arr = safe(ctaProfile[field] as string[]);
    updateCtaProfile({ [field]: arr.filter(v => v !== value) } as Partial<CtaProfile>, 'Remoção manual');
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
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
          <p className="text-xs text-slate-400 mt-0.5 max-w-lg">
            Ensine a IA como você gosta dos seus textos. O aprendizado alimenta automaticamente os Templates e o Monitor de Grupos.
          </p>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => { setTempKeyInput(openAiApiKey); setKeyError(null); setShowApiKeyModal(true); }}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 border transition-all shadow-md ${
              openAiApiKey
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                : 'bg-gradient-to-r from-violet-600/20 to-indigo-600/20 text-violet-300 border-violet-500/30 hover:border-violet-400'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            {openAiApiKey ? '🤖 ChatGPT Conectado' : '🔑 Conectar ChatGPT (API)'}
          </button>

          {/* Mobile tabs */}
          <div className="flex lg:hidden items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {(['chat', 'perfil'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                mobileTab === tab ? 'bg-violet-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab === 'chat' ? <MessageSquare className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" />}
              {tab === 'chat' ? 'Chat' : 'Perfil'}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────────── */}
      <div className="flex gap-5" style={{ minHeight: '520px', maxHeight: '64vh' }}>

        {/* LEFT: Chat */}
        <div className={`flex-1 flex flex-col min-w-0 ${mobileTab === 'perfil' ? 'hidden lg:flex' : 'flex'}`}>
          <div className="flex-1 flex flex-col p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-hidden">

            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-3">
              {trainingMessages.length === 0 && (
                <div className="p-5 rounded-3xl bg-slate-800/40 border border-slate-700/40 space-y-3 text-xs text-slate-300 leading-relaxed">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-white text-sm">Assistente IA</span>
                  </div>
                  <p>👋 Olá! Sou sua IA de CTA personalizada. Estou aqui para aprender <strong>exatamente</strong> como você gosta dos seus textos de divulgação.</p>
                  <p>Pode conversar comigo de forma <strong>natural</strong> — não precisa seguir nenhum formato. Você pode:</p>
                  <ul className="space-y-1 pl-2">
                    <li>✅ <strong>Descrever seu estilo:</strong> "prefiro algo mais urgente e curto"</li>
                    <li>✅ <strong>Dar comandos diretos:</strong> "nunca usa a palavra imperdível"</li>
                    <li>✅ <strong>Pedir exemplos:</strong> "me mostra 3 CTAs de teste"</li>
                    <li>✅ <strong>Ver o que aprendi:</strong> "o que você sabe sobre mim?"</li>
                    <li>✅ <strong>Dar feedback:</strong> "esse ficou muito forçado"</li>
                  </ul>
                  <p className="text-slate-400">Cada preferência vai ser usada automaticamente nos seus Templates e no Monitor de Grupos. 🚀</p>
                </div>
              )}

              {trainingMessages.map(msg => <Bubble key={msg.id} msg={msg} />)}
              {isTyping && <TypingDots />}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="mt-3 flex gap-2 items-end border-t border-slate-800 pt-3">
              <textarea
                rows={2}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Escreva como quiser... ex: 'prefiro CTAs curtos e sem emoji' ou 'gera um exemplo'"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-2xl px-4 py-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 resize-none leading-relaxed"
              />
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isTyping}
                className="p-3 rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-all shadow-lg shadow-violet-600/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5 text-center">Enter para enviar · Shift+Enter para quebrar linha</p>
          </div>
        </div>

        {/* RIGHT: Profile panel */}
        <div className={`w-full lg:w-80 xl:w-96 shrink-0 ${mobileTab === 'chat' ? 'hidden lg:block' : 'block'}`}>
          <div className="flex flex-col h-full p-5 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-xl overflow-y-auto gap-4">

            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-violet-400" />
                O que a IA Aprendeu
              </h2>
              <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {(ctaProfile.changelog ?? []).length} mudanças
              </span>
            </div>

            {/* Status summary */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-violet-900/30 to-indigo-900/20 border border-violet-700/30 shrink-0">
              <div className="text-[11px] text-slate-300 space-y-0.5">
                <p>🎭 <strong>Tom:</strong> {ctaProfile.tom ?? 'urgente'}</p>
                <p>📏 <strong>Tamanho:</strong> {ctaProfile.tamanhoPreferido ?? 'medio'}</p>
                <p>😀 <strong>Emojis:</strong> {ctaProfile.usaEmoji ? safe(ctaProfile.emojisPreferidos).join(' ') || '—' : 'Desativado'}</p>
                <p>🧠 <strong>CTAs gerados:</strong> {safe(ctaProfile.ctasGerados).length}</p>
              </div>
            </div>

            {/* Tom */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <p className="text-[11px] font-bold text-slate-300 mb-2">🎭 Tom do CTA</p>
              <select
                value={ctaProfile.tom ?? 'urgente'}
                onChange={e => updateCtaProfile({ tom: e.target.value as CtaProfile['tom'] }, 'Edição manual')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                {['urgente', 'descontraido', 'formal', 'divertido', 'luxuoso'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Tamanho */}
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
              <p className="text-[11px] font-bold text-slate-300 mb-2">📏 Tamanho</p>
              <select
                value={ctaProfile.tamanhoPreferido ?? 'medio'}
                onChange={e => updateCtaProfile({ tamanhoPreferido: e.target.value as CtaProfile['tamanhoPreferido'] }, 'Edição manual')}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
              >
                {['curto', 'medio', 'longo'].map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            {/* Booleans */}
            {([
              { label: '😀 Usa emojis', field: 'usaEmoji' as keyof CtaProfile },
              { label: '🔠 Caixa alta', field: 'usaCaixaAlta' as keyof CtaProfile },
            ] as const).map(({ label, field }) => (
              <div key={field} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <p className="text-[11px] font-bold text-slate-300">{label}</p>
                <button
                  onClick={() => updateCtaProfile({ [field]: !(ctaProfile[field] as boolean) } as Partial<CtaProfile>, 'Edição manual')}
                  className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                    ctaProfile[field]
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {ctaProfile[field] ? 'Ativado' : 'Desativado'}
                </button>
              </div>
            ))}

            {/* Array fields */}
            {([
              { label: '✨ Emojis preferidos', field: 'emojisPreferidos' as keyof CtaProfile },
              { label: '✅ Palavras favoritas', field: 'palavrasFavoritas' as keyof CtaProfile },
              { label: '🚫 Palavras proibidas', field: 'palavrasProibidas' as keyof CtaProfile },
              { label: '👍 Exemplos aprovados', field: 'exemplosBons' as keyof CtaProfile },
            ] as const).map(({ label, field }) => {
              const items = safe(ctaProfile[field] as string[]);
              return (
                <div key={field} className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <p className="text-[11px] font-bold text-slate-300 mb-2">{label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {items.length === 0 && <span className="text-[10px] text-slate-500 italic">Nenhum ainda</span>}
                    {items.map((item, i) => (
                      <Chip key={i} label={item} onRemove={() => removeField(field, item)} />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Observações livres */}
            {ctaProfile.observacoesLivres && (
              <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800">
                <p className="text-[11px] font-bold text-slate-300 mb-1">📌 Observações livres</p>
                <p className="text-[11px] text-slate-400 leading-relaxed whitespace-pre-wrap">{ctaProfile.observacoesLivres}</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1 shrink-0">
              <button
                onClick={() => setShowJson(true)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700"
              >
                <Eye className="w-3.5 h-3.5" /> Ver JSON
              </button>
              <button
                onClick={() => setShowReset(true)}
                className="flex-1 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold flex items-center justify-center gap-1.5 border border-rose-500/20"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reiniciar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Test section ─────────────────────────────────────────────────────── */}
      <div className="p-5 rounded-3xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Testar o Perfil Atual
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Gera 3 CTAs únicos usando seu perfil. Dê feedback para continuar treinando.</p>
          </div>
          <button
            onClick={handleGenerateExamples}
            className="px-4 py-2.5 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-600/20 transition-all hover:scale-105 shrink-0"
          >
            <Sparkles className="w-4 h-4" /> Gerar Exemplos
          </button>
        </div>

        {examples.length === 0 && (
          <p className="text-center text-xs text-slate-500 py-4">
            Clique em "Gerar Exemplos" para ver como seus CTAs ficam com o perfil atual.
          </p>
        )}

        {examples.length > 0 && (
          <div className="space-y-4">
            {examples.map((cta, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Opção {idx + 1}</span>
                  <span className="text-[10px] text-slate-500 font-mono">Anti-repetição ✓</span>
                </div>

                {editIdx === idx ? (
                  <textarea
                    rows={4}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    className="w-full bg-slate-900 border border-violet-500 rounded-xl px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none resize-none leading-relaxed"
                  />
                ) : (
                  <div className="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                    {cta}
                  </div>
                )}

                {badIdx === idx && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Por que não gostou? (opcional)"
                      value={badReason}
                      onChange={e => setBadReason(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"
                    />
                    <button onClick={() => doBad(idx)} className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold">
                      Confirmar
                    </button>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => doGood(idx)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold border border-emerald-500/25 flex items-center gap-1.5 transition-colors"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" /> Gostei
                  </button>
                  <button
                    onClick={() => doBad(idx)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/20 flex items-center gap-1.5 transition-colors"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" /> Não gostei
                  </button>
                  <button
                    onClick={() => {
                      if (editIdx === idx) { doGood(idx); }
                      else { setEditIdx(idx); setEditText(cta); }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/20 flex items-center gap-1.5 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {editIdx === idx ? 'Salvar edição' : 'Editar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── JSON Modal ─────────────────────────────────────────────────────── */}
      {showJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-violet-400" /> Perfil Completo (JSON)
              </h2>
              <button onClick={() => setShowJson(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-300 bg-slate-950 rounded-2xl p-4 max-h-96 overflow-auto leading-relaxed border border-slate-800">
              {JSON.stringify(
                { ...ctaProfile, ctasGerados: `[${safe(ctaProfile.ctasGerados).length} CTAs]` },
                null, 2
              )}
            </pre>
          </div>
        </div>
      )}

      {/* ── Reset Confirm Modal ─────────────────────────────────────────────── */}
      {showReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 text-rose-400" />
              </div>
              <h2 className="text-base font-bold text-white">Reiniciar Treinamento?</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Todas as preferências, histórico do chat e exemplos salvos serão apagados. O histórico de CTAs gerados é mantido para o anti-repetição.
              </p>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowReset(false)} className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold">
                Cancelar
              </button>
              <button
                onClick={() => { resetCtaProfile(); setExamples([]); setShowReset(false); }}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md"
              >
                Reiniciar tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── OpenAI API Key Modal ─────────────────────────────────────────────── */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-violet-400" />
                API Key do ChatGPT (OpenAI)
              </h2>
              <button onClick={() => setShowApiKeyModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Insira sua chave da OpenAI (<code className="font-mono text-emerald-400">sk-...</code>). O sistema validará a chave em tempo real antes de conectar ao <strong>ChatGPT (GPT-4o-mini)</strong>!
            </p>

            {keyError && (
              <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in duration-150">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed font-medium">{keyError}</div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400">Chave da API OpenAI</label>
              <input
                type="password"
                value={tempKeyInput}
                onChange={e => { setTempKeyInput(e.target.value); setKeyError(null); }}
                placeholder="sk-proj-..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-violet-500"
              />
            </div>

            <p className="text-[10px] text-slate-500 leading-normal">
              🔒 Sua chave é salva exclusivamente no seu navegador (localStorage) e usada apenas para se comunicar diretamente com a API oficial da OpenAI.
            </p>

            <div className="flex gap-2 pt-2">
              {openAiApiKey && (
                <button
                  onClick={() => { setOpenAiApiKey(''); setTempKeyInput(''); setKeyError(null); setShowApiKeyModal(false); }}
                  className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/20"
                >
                  Remover Chave
                </button>
              )}
              <button
                onClick={handleTestAndSaveKey}
                disabled={isValidatingKey}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-all"
              >
                {isValidatingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Validando chave na OpenAI...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Testar e Conectar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
