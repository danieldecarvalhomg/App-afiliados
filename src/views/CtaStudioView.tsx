import React, { useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  FileUp,
  MessageSquareText,
  RefreshCw,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import type {
  CtaConversationMessage,
  CtaExample,
  CtaMemoryItem,
  CtaMemoryView,
  CtaProfile,
  CtaTrainingReview,
} from "../domain/cta/types";
import type { ProductRecord } from "../domain/products/types";
import { ctaApi } from "../services/ctaApi";
import { productsApi } from "../services/productsApi";

const panel = "rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]";
const emptyMemory: CtaMemoryView = { version: 0, general: [], conditional: [], exceptions: [], avoid: [], examples: [] };
const describeCondition = (condition: Record<string, unknown>) => {
  const labels: Record<string, string> = { category: "categoria", marketplace: "marketplace", humor: "humor", discount: "desconto", product: "produto" };
  const values = Object.entries(condition).flatMap(([key, value]) => {
    if (key === "conditions") return ["contexto específico"];
    return [`${labels[key] ?? "contexto"}: ${String(value)}`];
  });
  return values.join(" · ");
};
const Loading = ({ label }: { label: string }) => <p aria-live="polite" className="text-xs text-[#6B6F7B]">{label} <span className="animate-pulse">•••</span></p>;

const MemoryGroup: React.FC<{
  title: string;
  disabled?: boolean;
  items: CtaMemoryItem[];
  onRemove: (id: string) => void;
}> = ({ title, items, onRemove, disabled }) => <section>
  <h3 className="text-[10px] font-medium uppercase tracking-[.15em] text-[#9CA3AF]">{title}</h3>
  <div className="mt-2 space-y-1.5">{items.length === 0 ? <p className="text-xs text-[#6B6F7B]">Nada registrado.</p> : items.map((item) => <div key={item.id} className="flex gap-2 rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] p-2 text-xs"><span className="flex-1 leading-5">{item.semanticText}{Object.keys(item.condition).length > 0 && <small className="mt-1 block text-[10px] text-[#9CA3AF]">Quando: {describeCondition(item.condition)}</small>}</span><button disabled={disabled} onClick={() => onRemove(item.id)} title="Remover memória" className="h-fit text-red-300"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>
</section>;

export const CtaStudioView: React.FC = () => {
  const [profile, setProfile] = useState<CtaProfile | null>(null);
  const [conversation, setConversation] = useState<CtaConversationMessage[]>([]);
  const [examples, setExamples] = useState<CtaExample[]>([]);
  const [memory, setMemory] = useState<CtaMemoryView>(emptyMemory);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [productId, setProductId] = useState("");
  const [message, setMessage] = useState("");
  const [trainingSource, setTrainingSource] = useState("");
  const [review, setReview] = useState<CtaTrainingReview | null>(null);
  const [testOptions, setTestOptions] = useState<Array<{ text: string; angle: string | null }>>([]);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resetOpen, setResetOpen] = useState(false);

  async function load() {
    const [nextProfile, nextConversation, nextMemory, nextExamples] = await Promise.all([
      ctaApi.profile(), ctaApi.conversation(), ctaApi.learnedMemory(), ctaApi.examples(),
    ]);
    setProfile(nextProfile); setConversation(nextConversation); setMemory(nextMemory); setExamples(nextExamples);
  }
  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao abrir o Treinador."));
    void productsApi.list().then((values) => { setProducts(values); setProductId(values[0]?.id ?? ""); })
      .catch(() => setError("Não foi possível carregar os produtos. Reabra esta tela para tentar novamente."));
  }, []);

  async function act(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setBusyLabel(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação."); }
    finally { busyRef.current = false; setBusy(false); setBusyLabel(""); }
  }

  async function send() {
    const text = message.trim(); if (!text || busyRef.current) return;
    await act("AfiliHub está pensando", async () => {
      const result = await ctaApi.assistant(text);
      setMessage((current) => current.trim() === text ? "" : current);
      setProfile(result.profile);
      setConversation((current) => [...current,
        { id: `sent_${Date.now()}`, userId: "", role: "user", content: text, metadata: {}, createdAt: new Date().toISOString() },
        { id: `reply_${Date.now()}`, userId: "", role: "assistant", content: result.reply, metadata: {}, createdAt: new Date().toISOString() }]);
      await load().catch(() => setNotice("Resposta recebida. Reabra a tela para atualizar a memória."));
      if (result.requiresConfirmation) setNotice("Para confirmar, envie explicitamente a preferência que deseja salvar (por exemplo: ‘Daqui para frente, use poucos emojis’).");
    });
  }

  async function analyzeTraining() {
    if (!trainingSource.trim()) return;
    await act("Analisando treinamento", async () => {
      const value = await ctaApi.analyzeTraining(trainingSource);
      setReview(value);
    });
  }

  async function applyTraining() {
    if (!review) return;
    await act("Aplicando treinamento", async () => {
      const applied = await ctaApi.applyTraining(review.source.id);
      setReview(null); setTrainingSource("");
      setNotice(`${applied.items} memórias aplicadas na versão ${applied.memoryVersion}.`);
      await load().catch(() => setNotice("Treinamento aplicado. Reabra a tela para atualizar a memória."));
    });
  }

  async function testCta(count: 1 | 3, instruction?: string) {
    if (!productId) return;
    await act(count === 3 ? "Gerando opções de CTA" : "Gerando CTA", async () => {
      const values = await ctaApi.testCta(productId, { count, instruction });
      setTestOptions(values); setSelected(0);
      if (count === 3 && values.length < 3) setNotice(`${values.length} opções distintas passaram pela validação.`);
    });
  }

  async function rate(sentiment: "positive" | "negative") {
    const current = testOptions[selected]; if (!current) return;
    await act("Registrando feedback", async () => {
      await ctaApi.addExample({ text: current.text, sentiment });
      setNotice(sentiment === "positive" ? "Exemplo positivo registrado." : "Exemplo negativo registrado.");
      const [nextExamples, nextProfile] = await Promise.all([ctaApi.examples(), ctaApi.profile()]);
      setExamples(nextExamples); setProfile(nextProfile);
    });
  }

  async function removeMemory(id: string) {
    await act("Atualizando memória", async () => {
      await ctaApi.deleteMemoryItem(id); setMemory(await ctaApi.learnedMemory()); setProfile(await ctaApi.profile());
    });
  }

  async function removeExample(id: string) {
    await act("Removendo exemplo", async () => {
      await ctaApi.deleteExample(id);
      const [nextExamples, nextProfile] = await Promise.all([ctaApi.examples(), ctaApi.profile()]);
      setExamples(nextExamples); setProfile(nextProfile);
    });
  }

  async function resetMemory() {
    await act("Apagando memória", async () => {
      await ctaApi.resetMemory(); setResetOpen(false); setReview(null); setTrainingSource(""); setTestOptions([]); await load();
      setNotice("Memória do Treinador apagada. Templates, Products e automações foram preservados.");
    });
  }

  const currentTest = testOptions[selected];
  const ratedExamples: CtaMemoryItem[] = examples.map((item) => ({
    id: item.id, userId: "", profileId: profile?.id ?? "", sourceId: null,
    kind: item.sentiment === "reference" ? "reference" : item.sentiment === "positive" ? "positive_example" : "negative_example",
    scope: "persistent", semanticText: item.text, condition: {}, polarity: item.sentiment === "reference" ? "neutral" : item.sentiment,
    priority: 50, active: true, supersedesItemId: null, metadata: {}, createdAt: item.createdAt, updatedAt: item.createdAt,
  }));
  return <div className="space-y-5 pb-12">
    <header><p className="text-xs font-medium uppercase tracking-[.2em] text-[#9CA3AF]">Criação</p><h1 className="mt-1 text-2xl font-bold">Treinador de IA</h1><p className="mt-1 text-sm text-[#6B6F7B]">Ensine o AfiliHub a criar seus CTAs do seu jeito. Aqui, CTA é somente a chamada criativa inicial.</p></header>
    {error && <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-600">{notice}</div>}

    <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
      <section className={`${panel} flex min-h-[620px] flex-col overflow-hidden`}>
        <header className="border-b border-[#E8E9ED] p-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4" />Converse e ensine</h2><p className="mt-1 text-xs text-[#9CA3AF]">Comandos explícitos são aplicados imediatamente; inferências pedem confirmação.</p></header>
        <div className="min-h-0 max-h-[560px] flex-1 space-y-3 overflow-y-auto p-4">{conversation.length === 0 && <div className="rounded-lg border border-dashed border-[#E8E9ED] p-4 text-sm text-[#9CA3AF]">“Quando for coisa de casa, gosto de CTA que parece comentário de amiga.”</div>}{conversation.map((item) => <div key={item.id} className={`max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-5 ${item.role === "user" ? "ml-auto bg-[#EDEDED] text-[#111]" : "bg-[#F4F4F6] text-[#374151]"}`}>{item.content}</div>)}{busyLabel === "AfiliHub está pensando" && <Loading label={busyLabel} />}</div>
        <div className="border-t border-[#E8E9ED] p-3"><textarea aria-label="Mensagem para o treinador" maxLength={100000} value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="Ex.: Gostei da brincadeira, mas ficou muito vendedor." className="h-24 w-full resize-none rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-sm" /><button disabled={busy || !message.trim()} onClick={() => void send()} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-[#EDEDED] py-2 text-sm font-medium text-[#111] disabled:opacity-40"><Send className="h-4 w-4" />{busyLabel === "AfiliHub está pensando" ? "Pensando •••" : "Enviar"}</button></div>
      </section>

      <section className={`${panel} p-4`}><div className="flex items-center justify-between"><div><h2 className="font-semibold">O que aprendi</h2><p className="text-xs text-[#9CA3AF]">Memória v{memory.version} · Perfil v{profile?.version ?? "—"}</p></div><button disabled={busy} onClick={() => setResetOpen(true)} className="text-xs text-red-300">Excluir memória</button></div>{profile?.naturalLanguagePreferences && <p className="mt-3 rounded-lg border border-[#E8E9ED] p-3 text-xs leading-5 text-[#6B6F7B]">{profile.naturalLanguagePreferences}</p>}<div className="mt-4 max-h-[680px] space-y-5 overflow-y-auto pr-1"><MemoryGroup disabled={busy} title="Geral" items={memory.general} onRemove={(id) => void removeMemory(id)} /><MemoryGroup disabled={busy} title="Quando fizer sentido" items={memory.conditional} onRemove={(id) => void removeMemory(id)} /><MemoryGroup disabled={busy} title="Exceções" items={memory.exceptions} onRemove={(id) => void removeMemory(id)} /><MemoryGroup disabled={busy} title="Evitar" items={memory.avoid} onRemove={(id) => void removeMemory(id)} /><MemoryGroup disabled={busy} title="Exemplos e referências" items={memory.examples} onRemove={(id) => void removeMemory(id)} /><MemoryGroup disabled={busy} title="Feedback dos CTAs" items={ratedExamples} onRemove={(id) => void removeExample(id)} /></div></section>
    </div>

    <section className={`${panel} p-4`}><h2 className="flex items-center gap-2 font-semibold"><FileUp className="h-4 w-4" />Importar treinamento longo</h2><p className="mt-1 text-xs text-[#9CA3AF]">O texto original é preservado. O AfiliHub divide em chunks, interpreta cada seção e reconcilia tudo antes de aplicar.</p>{!review ? <><textarea aria-label="Fonte do treinamento" maxLength={1000000} disabled={busy} value={trainingSource} onChange={(event) => setTrainingSource(event.target.value)} placeholder="Cole aqui regras, exceções, exemplos, comparações e referências — até várias páginas." className="mt-3 min-h-52 w-full resize-y rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-xs leading-5" /><div className="mt-2 flex items-center justify-between text-[10px] text-[#9CA3AF]"><span>{trainingSource.length.toLocaleString("pt-BR")} caracteres</span><button disabled={busy || !trainingSource.trim()} onClick={() => void analyzeTraining()} className="rounded-lg bg-[#EDEDED] px-4 py-2 text-xs font-medium text-[#111] disabled:opacity-40">{busyLabel === "Analisando treinamento" ? "Analisando treinamento •••" : "Analisar treinamento"}</button></div></> : <div className="mt-3 rounded-xl border border-[#D4D4D8] bg-[#FFFFFF] p-4"><h3 className="font-medium">Revise o que foi entendido</h3><p className="mt-1 text-xs text-[#9CA3AF]">{review.source.charCount.toLocaleString("pt-BR")} caracteres · {review.source.chunkCount} chunks · {review.items.length} itens reconciliados</p><ul className="mt-3 space-y-1 text-sm text-[#6B6F7B]">{review.summary.map((item, index) => <li key={index}>• {item}</li>)}</ul><div className="mt-4 grid grid-cols-2 gap-2 text-center text-[10px] sm:grid-cols-5"><div className="rounded bg-[#F4F4F6] p-2">{review.counts.rules}<br />regras</div><div className="rounded bg-[#F4F4F6] p-2">{review.counts.conditions}<br />condições</div><div className="rounded bg-[#F4F4F6] p-2">{review.counts.avoided}<br />evitar</div><div className="rounded bg-[#F4F4F6] p-2">{review.counts.positiveExamples}<br />positivos</div><div className="rounded bg-[#F4F4F6] p-2">{review.counts.negativeExamples}<br />negativos</div></div>{review.conflicts.length > 0 && <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"><p className="font-medium">Conflitos reconciliados</p>{review.conflicts.slice(0, 10).map((item, index) => <p key={index} className="mt-1">{item.prior} → {item.replacement} ({item.resolution})</p>)}</div>}<div className="mt-4 flex justify-end gap-2"><button disabled={busy} onClick={() => setReview(null)} className="rounded border border-[#D4D4D8] px-3 py-2 text-xs">Corrigir fonte</button><button disabled={busy} onClick={() => void applyTraining()} className="rounded bg-[#EDEDED] px-4 py-2 text-xs font-medium text-[#111]">{busyLabel === "Aplicando treinamento" ? "Aplicando •••" : "Aplicar"}</button></div></div>}</section>

    <section className={`${panel} p-4`}><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4" />Testar CTA</h2><p className="mt-1 text-xs text-[#9CA3AF]">Este teste gera somente CTA. Template, preço, cupom, link e fila não participam.</p><div className="mt-3 flex flex-wrap items-end gap-2"><label className="min-w-64 flex-1 text-[10px] uppercase tracking-wider text-[#9CA3AF]">Produto<select value={productId} disabled={busy} onChange={(event) => { setProductId(event.target.value); setTestOptions([]); setSelected(0); }} className="mt-1 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs"><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label><button disabled={!productId || busy} onClick={() => void testCta(1)} className="rounded bg-[#EDEDED] px-4 py-2 text-xs font-medium text-[#111] disabled:opacity-40">{busyLabel === "Gerando CTA" ? "Gerando CTA •••" : "Gerar CTA de teste"}</button><button disabled={!productId || busy} onClick={() => void testCta(3)} className="rounded border border-[#D4D4D8] px-4 py-2 text-xs">{busyLabel === "Gerando opções de CTA" ? "Gerando opções •••" : "Gerar 3 ângulos"}</button></div>{currentTest ? <div className="mt-4"><div className="rounded-xl border border-[#D4D4D8] bg-[#F8FAFC] p-5 text-base leading-7">{currentTest.text}</div>{currentTest.angle && <p className="mt-1 text-[10px] text-[#9CA3AF]">Ângulo: {currentTest.angle}</p>}<div className="mt-3 flex flex-wrap gap-2"><button disabled={busy} onClick={() => void rate("positive")} className="rounded border border-[#D4D4D8] px-3 py-2 text-xs"><ThumbsUp className="mr-1 inline h-3.5 w-3.5" />Gostei</button><button disabled={busy} onClick={() => void rate("negative")} className="rounded border border-[#D4D4D8] px-3 py-2 text-xs"><ThumbsDown className="mr-1 inline h-3.5 w-3.5" />Não gostei</button><button disabled={busy} onClick={() => void testCta(1, "Outra abordagem, sem repetir o ângulo recente") } className="rounded border border-[#D4D4D8] px-3 py-2 text-xs"><RefreshCw className="mr-1 inline h-3.5 w-3.5" />Gerar outro</button></div>{testOptions.length > 1 && <div className="mt-3 flex gap-1">{testOptions.map((_, index) => <button key={index} onClick={() => setSelected(index)} className={`rounded px-3 py-1 text-xs ${selected === index ? "bg-[#EDEDED] text-[#111]" : "bg-[#F4F4F6]"}`}>Opção {index + 1}</button>)}</div>}</div> : <div className="mt-4 rounded-xl border border-dashed border-[#E8E9ED] p-8 text-center text-sm text-[#9CA3AF]">Selecione um produto para testar como o Treinador pensa o CTA.</div>}</section>

    {resetOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div role="dialog" aria-modal="true" className={`${panel} max-w-lg p-5`}><h2 className="text-lg font-semibold">Começar do zero?</h2><p className="mt-3 text-sm leading-6 text-[#6B6F7B]">Isso apagará o que o Treinador aprendeu sobre seus CTAs: perfil, preferências, exemplos, feedback, memória semântica, resumos, cache e inferências ativas. Templates, Products, integrações, filas e automações não serão apagados.</p>{busyLabel === "Apagando memória" && <div className="mt-3"><Loading label="Apagando memória" /></div>}<div className="mt-5 flex justify-end gap-2"><button disabled={busy} onClick={() => setResetOpen(false)} className="rounded border border-[#D4D4D8] px-3 py-2 text-xs">Cancelar</button><button disabled={busy} onClick={() => void resetMemory()} className="rounded bg-red-600 px-3 py-2 text-xs text-white">Excluir memória e começar do zero</button></div></div></div>}
  </div>;
};
