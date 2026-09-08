import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Braces,
  Check,
  Copy,
  Eye,
  FileText,
  ImageIcon,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import type {
  CtaCopyLibraryItem,
  CtaTemplate,
  CtaWhatsAppFormat,
  MessageTemplateConditionField,
  MessageTemplateConditionOperator,
  MessageTemplateDocument,
  MessageTemplateNode,
  MessageTemplateVariable,
  TemplateEditorMode,
} from "../domain/cta/types";
import type { ProductRecord } from "../domain/products/types";
import { useApp } from "../context/AppContext";
import { ctaApi } from "../services/ctaApi";
import { productsApi } from "../services/productsApi";

const panel = "rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]";
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const id = () => crypto.randomUUID();
const labels: Record<MessageTemplateVariable, string> = {
  produto: "Produto",
  preco: "Preço",
  preco_original: "Preço anterior",
  desconto: "Desconto",
  cupom: "Cupom",
  coupon_link: "Link do cupom",
  affiliate_link: "Link do produto",
  marketplace: "Marketplace",
  frete_gratis: "Frete grátis",
};
const conditionLabels: Record<MessageTemplateConditionField, string> = {
  preco_original: "Preço anterior",
  desconto: "Desconto",
  cupom: "Cupom",
  coupon_link: "Link do cupom",
  frete_gratis: "Frete grátis",
  marketplace: "Marketplace",
  preco: "Preço",
};
const formats: Array<{ value: CtaWhatsAppFormat; label: string }> = [
  { value: "normal", label: "Normal" },
  { value: "bold", label: "Negrito" },
  { value: "italic", label: "Itálico" },
  { value: "strikethrough", label: "Tachado" },
  { value: "monospace", label: "Monoespaçado" },
  { value: "quote", label: "Citação" },
  { value: "bullet_list", label: "Lista" },
  { value: "numbered_list", label: "Lista numerada" },
];
const operators: Array<{ value: MessageTemplateConditionOperator; label: string }> = [
  { value: "exists", label: "existe" },
  { value: "not_exists", label: "não existe" },
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
];

function hasCta(nodes: MessageTemplateNode[]): boolean {
  return nodes.some((node) => node.type === "cta" || (node.type === "conditional" && (hasCta(node.then) || hasCta(node.else))));
}

function makeNode(kind: "cta" | "text" | "conditional" | MessageTemplateVariable): MessageTemplateNode {
  if (kind === "cta") return { id: id(), type: "cta", format: "normal" };
  if (kind === "text") return { id: id(), type: "text", text: "Texto personalizado" };
  if (kind === "conditional") return {
    id: id(),
    type: "conditional",
    condition: { field: "preco_original", operator: "exists" },
    then: [],
    else: [],
  };
  return { id: id(), type: "variable", key: kind, format: "normal" };
}

function appendNode(nodes: MessageTemplateNode[], node: MessageTemplateNode) {
  const next = [...nodes];
  if (next.length && next.at(-1)?.type !== "text") next.push({ id: id(), type: "text", text: "\n\n" });
  next.push(node);
  return next;
}

interface TreeProps {
  nodes: MessageTemplateNode[];
  onChange: (nodes: MessageTemplateNode[]) => void;
  depth?: number;
  ctaExists: boolean;
}

const TemplateTree: React.FC<TreeProps> = ({ nodes, onChange, depth = 0, ctaExists }) => {
  const replace = (index: number, node: MessageTemplateNode) => onChange(nodes.map((item, position) => position === index ? node : item));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= nodes.length) return;
    const next = [...nodes];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  const remove = (index: number) => onChange(nodes.filter((_, position) => position !== index));
  const add = (branch: MessageTemplateNode[], kind: Parameters<typeof makeNode>[0]) => appendNode(branch, makeNode(kind));

  return <div className="space-y-2">
    {nodes.length === 0 && <div className="rounded-lg border border-dashed border-[#D4D4D8] p-4 text-center text-xs text-[#9CA3AF]">Nenhum elemento neste ramo.</div>}
    {nodes.map((node, index) => {
      const controls = <div className="flex shrink-0 flex-wrap justify-end gap-1">
        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded border border-[#D4D4D8] p-1 disabled:opacity-30" title="Mover para cima"><ArrowUp className="h-3 w-3" /></button>
        <button type="button" onClick={() => move(index, 1)} disabled={index === nodes.length - 1} className="rounded border border-[#D4D4D8] p-1 disabled:opacity-30" title="Mover para baixo"><ArrowDown className="h-3 w-3" /></button>
        <button type="button" onClick={() => remove(index)} className="rounded border border-red-950 p-1 text-red-300" title="Remover"><Trash2 className="h-3 w-3" /></button>
      </div>;
      if (node.type === "text") {
        const whitespace = !node.text.trim();
        return <div key={node.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] p-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-[#9CA3AF]">{whitespace ? "Espaçamento / quebra" : "Texto livre"}</p>
            <textarea value={node.text} onChange={(event) => replace(index, { ...node, text: event.target.value })} className="h-16 w-full resize-y rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs" />
          </div>{controls}
        </div>;
      }
      if (node.type === "cta" || node.type === "variable") {
        return <div key={node.id} className="flex min-w-0 flex-col gap-2 rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{node.type === "cta" ? "CTA" : labels[node.key]}</p><p className="text-[10px] text-[#9CA3AF]">{node.type === "cta" ? "Único slot do Treinador" : `{${node.key}}`}</p></div>
          <select value={node.format ?? "normal"} onChange={(event) => replace(index, { ...node, format: event.target.value as CtaWhatsAppFormat })} className="w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs sm:w-auto">
            {formats.map((format) => <option key={format.value} value={format.value}>{format.label}</option>)}
          </select>{controls}
        </div>;
      }
      const needsValue = !["exists", "not_exists"].includes(node.condition.operator);
      const branchButtons = (branch: "then" | "else") => <div className="mt-2 flex flex-wrap gap-1">
        {(["text", "produto", "preco", "cupom", "coupon_link", "affiliate_link", "conditional"] as const).map((kind) => <button type="button" key={kind} onClick={() => replace(index, { ...node, [branch]: add(node[branch], kind) })} className="rounded border border-[#D4D4D8] px-2 py-1 text-[10px]">+ {kind === "conditional" ? "Condição" : kind === "text" ? "Texto" : labels[kind]}</button>)}
        {!ctaExists && <button type="button" onClick={() => replace(index, { ...node, [branch]: add(node[branch], "cta") })} className="rounded border border-[#D4D4D8] px-2 py-1 text-[10px]">+ CTA</button>}
      </div>;
      return <div key={node.id} className="min-w-0 overflow-hidden rounded-lg border border-indigo-950/80 bg-indigo-950/10 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <Braces className="h-4 w-4 shrink-0 text-indigo-300" />
            <span className="text-xs font-medium">Se</span>
            <select value={node.condition.field} onChange={(event) => replace(index, { ...node, condition: { ...node.condition, field: event.target.value as MessageTemplateConditionField } })} className="min-w-0 flex-1 rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs sm:w-auto sm:flex-none">
            {Object.entries(conditionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
            <select value={node.condition.operator} onChange={(event) => replace(index, { ...node, condition: { ...node.condition, operator: event.target.value as MessageTemplateConditionOperator, value: ["exists", "not_exists"].includes(event.target.value) ? undefined : node.condition.value ?? "" } })} className="min-w-0 flex-1 rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs sm:w-auto sm:flex-none">
            {operators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
          </select>
            {needsValue && <input value={String(node.condition.value ?? "")} onChange={(event) => replace(index, { ...node, condition: { ...node.condition, value: event.target.value } })} className="min-w-0 flex-1 rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs sm:w-28 sm:flex-none" placeholder="valor" />}
          </div>
          <div className="sm:ml-auto">{controls}</div>
        </div>
        <div className="mt-3 grid min-w-0 gap-3 2xl:grid-cols-2">
          <div className="min-w-0 rounded-lg border border-[#E8E9ED] p-2"><p className="mb-2 text-[10px] uppercase tracking-wider text-emerald-600">Então</p><TemplateTree nodes={node.then} onChange={(thenNodes) => replace(index, { ...node, then: thenNodes })} depth={depth + 1} ctaExists={ctaExists} />{branchButtons("then")}</div>
          <div className="min-w-0 rounded-lg border border-[#E8E9ED] p-2"><p className="mb-2 text-[10px] uppercase tracking-wider text-amber-300">Senão</p><TemplateTree nodes={node.else} onChange={(elseNodes) => replace(index, { ...node, else: elseNodes })} depth={depth + 1} ctaExists={ctaExists} />{branchButtons("else")}</div>
        </div>
      </div>;
    })}
  </div>;
};

export const AiStudioView: React.FC = () => {
  const { isSidebarCollapsed } = useApp();
  const [templates, setTemplates] = useState<CtaTemplate[]>([]);
  const [copies, setCopies] = useState<CtaCopyLibraryItem[]>([]);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [draft, setDraft] = useState<CtaTemplate | null>(null);
  const [manualDsl, setManualDsl] = useState("");
  const [productId, setProductId] = useState("");
  const [structuralPreview, setStructuralPreview] = useState("");
  const [realPreview, setRealPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copyName, setCopyName] = useState("");
  const [copyText, setCopyText] = useState("");
  const manualRef = useRef<HTMLTextAreaElement>(null);

  const mode: TemplateEditorMode = draft?.editorMode ?? "blocks";
  const document: MessageTemplateDocument = draft?.document ?? { version: 1, nodes: [] };
  const dirty = useMemo(() => {
    const persisted = templates.find((item) => item.id === draft?.id);
    return Boolean(draft && persisted && (JSON.stringify(draft) !== JSON.stringify(persisted) || manualDsl !== (persisted.dsl ?? "")));
  }, [draft, manualDsl, templates]);

  async function load(preferredId?: string) {
    const [nextTemplates, nextCopies, nextProducts] = await Promise.all([ctaApi.templates(), ctaApi.copy(), productsApi.list()]);
    setTemplates(nextTemplates); setCopies(nextCopies); setProducts(nextProducts);
    setProductId((value) => value || nextProducts[0]?.id || "");
    const selected = nextTemplates.find((item) => item.id === (preferredId ?? draft?.id)) ?? nextTemplates.find((item) => item.isDefault) ?? nextTemplates[0] ?? null;
    setDraft(selected ? clone(selected) : null); setManualDsl(selected?.dsl ?? "");
  }
  useEffect(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "Falha ao carregar templates.")); }, []);

  async function act(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setBusyLabel(label); setError(""); setNotice("");
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível concluir a ação."); }
    finally { setBusy(false); setBusyLabel(""); }
  }

  async function switchMode(nextMode: TemplateEditorMode) {
    if (!draft || nextMode === mode) return;
    await act("Convertendo template", async () => {
      if (nextMode === "manual") {
        const converted = await ctaApi.serializeTemplate(document);
        setDraft({ ...draft, document: converted.document, dsl: converted.dsl, editorMode: "manual" });
        setManualDsl(converted.dsl);
      } else {
        const converted = await ctaApi.parseTemplate(manualDsl);
        setDraft({ ...draft, document: converted.document, dsl: converted.dsl, editorMode: "blocks" });
        setManualDsl(converted.dsl);
      }
      setRealPreview(""); setStructuralPreview("");
    });
  }

  async function save() {
    if (!draft) return;
    await act("Salvando template", async () => {
      const converted = mode === "manual" ? await ctaApi.parseTemplate(manualDsl) : await ctaApi.serializeTemplate(document);
      const saved = await ctaApi.updateTemplate(draft.id, {
        name: draft.name,
        description: draft.description,
        active: draft.active,
        document: converted.document,
        dsl: converted.dsl,
        editorMode: mode,
        presentation: draft.presentation,
      });
      if (!saved) throw new Error("Template não encontrado.");
      await load(saved.id); setNotice("Template salvo com a mesma fonte canônica nos dois modos.");
    });
  }

  async function createTemplate() {
    await act("Criando template", async () => {
      const created = await ctaApi.createTemplate({ name: "Novo template", description: null, blocks: [], document: { version: 1, nodes: [] }, dsl: "", editorMode: "blocks", active: true, presentation: { defaultCaption: "", watermark: { enabled: false, text: "", position: "bottom-right", opacity: 0.72 } } });
      await load(created.id);
    });
  }

  async function preview(kind: "structural" | "real") {
    if (!draft) return;
    await act(kind === "real" ? "Gerando preview" : "Atualizando preview", async () => {
      const converted = mode === "manual" ? await ctaApi.parseTemplate(manualDsl) : await ctaApi.serializeTemplate(document);
      if (kind === "structural") setStructuralPreview((await ctaApi.structuralPreview(converted.document)).text);
      else {
        if (!productId) throw new Error("Selecione um produto real para o preview.");
        const result = await ctaApi.previewTemplate(draft.id, { productId, document: converted.document, dsl: converted.dsl });
        setRealPreview(result.text);
      }
    });
  }

  function insertManual(value: string) {
    const field = manualRef.current;
    const start = field?.selectionStart ?? manualDsl.length;
    const end = field?.selectionEnd ?? start;
    const next = `${manualDsl.slice(0, start)}${value}${manualDsl.slice(end)}`;
    setManualDsl(next);
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + value.length, start + value.length); });
  }

  function addTop(kind: Parameters<typeof makeNode>[0]) {
    if (!draft) return;
    if (kind === "cta" && hasCta(document.nodes)) return;
    setDraft({ ...draft, document: { ...document, nodes: appendNode(document.nodes, makeNode(kind)) } });
  }
  function addSavedText(text: string) {
    if (!draft) return;
    setDraft({ ...draft, document: { ...document, nodes: appendNode(document.nodes, { id: id(), type: "text", text }) } });
  }

  const bank = ["cta", "produto", "preco", "preco_original", "desconto", "cupom", "coupon_link", "affiliate_link", "frete_gratis", "marketplace", "text", "conditional"] as const;
  const editorLayout = isSidebarCollapsed
    ? "lg:grid-cols-[minmax(210px,240px)_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_320px]"
    : "lg:grid-cols-[minmax(210px,240px)_minmax(0,1fr)]";
  const previewLayout = isSidebarCollapsed ? "lg:col-span-2 2xl:col-span-1" : "lg:col-span-2";
  return <div className="space-y-5 pb-12">
    <header><p className="text-xs font-medium uppercase tracking-[.2em] text-[#9CA3AF]">Criação</p><h1 className="mt-1 text-2xl font-bold">Templates</h1><p className="mt-1 text-sm text-[#6B6F7B]">Estruture a mensagem por Blocos ou Manual. Os dois modos editam o mesmo template canônico.</p></header>
    {error && <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">{error}</div>}
    {notice && <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-600">{notice}</div>}
    <div className={`grid min-w-0 gap-4 ${editorLayout}`}>
      <aside className={`${panel} h-fit min-w-0 p-3`}>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Templates</h2><button onClick={() => void createTemplate()} disabled={busy} className="rounded border border-[#D4D4D8] p-1.5"><Plus className="h-4 w-4" /></button></div>
        <div className="mt-3 space-y-1">{templates.map((item) => <button key={item.id} onClick={() => { setDraft(clone(item)); setManualDsl(item.dsl ?? ""); setRealPreview(""); setStructuralPreview(""); }} className={`w-full rounded-lg border p-2 text-left text-xs ${draft?.id === item.id ? "border-[#57575F] bg-[#F4F4F6]" : "border-transparent hover:bg-[#F4F4F6]"}`}><span className="flex items-center gap-1 font-medium">{item.isDefault && <Star className="h-3 w-3" />}{item.name}</span><span className="mt-0.5 block text-[10px] text-[#9CA3AF]">v{item.version} · {item.active ? "ativo" : "inativo"}</span></button>)}</div>
        {draft && <div className="mt-4 border-t border-[#E8E9ED] pt-3"><p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Adicionar elemento</p><div className="mt-2 grid grid-cols-2 gap-1">{bank.map((kind) => <button key={kind} disabled={busy || (kind === "cta" && hasCta(document.nodes))} onClick={() => addTop(kind)} className="rounded border border-[#D4D4D8] px-2 py-1.5 text-[10px] disabled:opacity-30">{kind === "conditional" ? "Condicional" : kind === "text" ? "Texto" : kind === "cta" ? "CTA" : labels[kind]}</button>)}</div></div>}
        <div className="mt-4 border-t border-[#E8E9ED] pt-3"><p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Textos salvos</p><div className="mt-2 space-y-1">{copies.filter((item) => item.mode === "EXACT_TEXT").slice(0, 8).map((item) => <button key={item.id} onClick={() => item.exactText && addSavedText(item.exactText)} title={item.exactText ?? ""} className="block w-full truncate rounded border border-[#E8E9ED] px-2 py-1 text-left text-[10px]">{item.name}</button>)}</div><input value={copyName} onChange={(event) => setCopyName(event.target.value)} placeholder="Nome" className="mt-2 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs" /><textarea value={copyText} onChange={(event) => setCopyText(event.target.value)} placeholder="Texto reutilizável" className="mt-1 h-16 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-1.5 text-xs" /><button disabled={busy || !copyName.trim() || !copyText.trim()} onClick={() => void act("Salvando texto", async () => { await ctaApi.createCopy({ name: copyName, type: "custom", mode: "EXACT_TEXT", objective: null, instruction: null, exactText: copyText }); setCopyName(""); setCopyText(""); setCopies(await ctaApi.copy()); })} className="mt-1 w-full rounded border border-[#D4D4D8] py-1.5 text-[10px] disabled:opacity-30">Salvar texto</button></div>
      </aside>

      <main className={`${panel} min-w-0 overflow-hidden p-4`}>
        {!draft ? <div className="p-12 text-center text-sm text-[#9CA3AF]">Crie ou selecione um template.</div> : <>
          <div className="flex flex-wrap items-center gap-2"><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="min-w-56 flex-1 rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-sm font-medium" />
            <div className="flex rounded-lg border border-[#D4D4D8] p-1"><button onClick={() => void switchMode("blocks")} className={`rounded px-3 py-1.5 text-xs ${mode === "blocks" ? "bg-[#EDEDED] text-[#111]" : "text-[#6B6F7B]"}`}>Blocos</button><button onClick={() => void switchMode("manual")} className={`rounded px-3 py-1.5 text-xs ${mode === "manual" ? "bg-[#EDEDED] text-[#111]" : "text-[#6B6F7B]"}`}>Manual</button></div>
            <button disabled={busy || !dirty} onClick={() => void save()} className="rounded-lg bg-[#EDEDED] px-3 py-2 text-xs font-medium text-[#111] disabled:opacity-40"><Save className="mr-1 inline h-3.5 w-3.5" />{busyLabel === "Salvando template" ? "Salvando •••" : "Salvar"}</button>
          </div>
          <textarea value={draft.description ?? ""} onChange={(event) => setDraft({ ...draft, description: event.target.value || null })} placeholder="Descrição opcional" className="mt-2 h-14 w-full rounded border border-[#E8E9ED] bg-[#F8FAFC] p-2 text-xs" />
          <section className="mt-4 space-y-4 rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4">
            <div><h2 className="text-sm font-semibold">Apresentação fixa do template</h2><p className="mt-1 text-xs text-[#9CA3AF]">A descrição aparece no cartão da prévia do link. Fotos escolhidas no app usam a mensagem gerada.</p></div>
            <label className="block text-[10px] uppercase tracking-wider text-[#9CA3AF]">Descrição fixa da prévia do link<textarea value={draft.presentation.defaultCaption} onChange={(event) => setDraft({ ...draft, presentation: { ...draft.presentation, defaultCaption: event.target.value } })} maxLength={500} placeholder="Ex.: @minhaloja" className="mt-1 min-h-24 w-full resize-y rounded border border-[#D4D4D8] bg-[#F8FAFC] p-3 text-xs normal-case tracking-normal" /></label>
            <div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-xs font-medium"><ImageIcon className="h-4 w-4" />Marca d’água</h3><p className="mt-1 text-[10px] text-[#9CA3AF]">Aplicada somente no envio; a imagem original permanece intacta.</p></div><input type="checkbox" checked={draft.presentation.watermark.enabled} onChange={(event) => setDraft({ ...draft, presentation: { ...draft.presentation, watermark: { ...draft.presentation.watermark, enabled: event.target.checked } } })} className="h-4 w-4 accent-[#EDEDED]" /></div>
            {draft.presentation.watermark.enabled && <div className="grid gap-3 sm:grid-cols-2"><label className="text-[10px] uppercase tracking-wider text-[#9CA3AF] sm:col-span-2">Texto<input value={draft.presentation.watermark.text} onChange={(event) => setDraft({ ...draft, presentation: { ...draft.presentation, watermark: { ...draft.presentation.watermark, text: event.target.value } } })} maxLength={120} placeholder="@minhaloja" className="mt-1 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs normal-case tracking-normal" /></label><label className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Posição<select value={draft.presentation.watermark.position} onChange={(event) => setDraft({ ...draft, presentation: { ...draft.presentation, watermark: { ...draft.presentation.watermark, position: event.target.value as CtaTemplate['presentation']['watermark']['position'] } } })} className="mt-1 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs normal-case tracking-normal"><option value="bottom-right">Inferior direita</option><option value="bottom-left">Inferior esquerda</option><option value="top-right">Superior direita</option><option value="top-left">Superior esquerda</option><option value="center">Centro</option></select></label><label className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Opacidade: {Math.round(draft.presentation.watermark.opacity * 100)}%<input type="range" min={10} max={100} value={Math.round(draft.presentation.watermark.opacity * 100)} onChange={(event) => setDraft({ ...draft, presentation: { ...draft.presentation, watermark: { ...draft.presentation.watermark, opacity: Number(event.target.value) / 100 } } })} className="mt-3 w-full accent-[#EDEDED]" /></label></div>}
          </section>
          {busyLabel === "Convertendo template" && <p className="mt-3 text-xs text-[#6B6F7B]">Convertendo template •••</p>}
          {mode === "blocks" ? <div className="mt-4 min-w-0"><TemplateTree nodes={document.nodes} onChange={(nodes) => setDraft({ ...draft, document: { ...document, nodes } })} ctaExists={hasCta(document.nodes)} /></div> : <div className="mt-4 grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1fr)_180px]"><textarea ref={manualRef} value={manualDsl} onChange={(event) => setManualDsl(event.target.value)} spellCheck={false} className="min-h-[620px] w-full min-w-0 resize-y rounded-lg border border-[#D4D4D8] bg-[#F8FAFC] p-4 font-mono text-xs leading-6" /><aside className="space-y-3 rounded-lg border border-[#E8E9ED] p-3"><p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">Variáveis</p>{["{cta_ia}", "{produto}", "{preco}", "{preco_original}", "{desconto}", "{cupom}", "{coupon_link}", "{affiliate_link}", "{marketplace}", "{frete_gratis}"].map((value) => <button key={value} onClick={() => insertManual(value)} className="block w-full rounded border border-[#D4D4D8] px-2 py-1 text-left font-mono text-[10px]">{value}</button>)}<p className="pt-2 text-[10px] uppercase tracking-wider text-[#9CA3AF]">Lógica</p><button onClick={() => insertManual("{if preco_original}\n\n{else}\n\n{/if}")} className="block w-full rounded border border-[#D4D4D8] px-2 py-1 text-left font-mono text-[10px]">if / else</button><p className="pt-2 text-[10px] uppercase tracking-wider text-[#9CA3AF]">WhatsApp</p>{["*negrito*", "_itálico_", "~tachado~", "```código```", "> citação", "- item", "1. item"].map((value) => <button key={value} onClick={() => insertManual(value)} className="block w-full rounded border border-[#D4D4D8] px-2 py-1 text-left text-[10px]">{value}</button>)}</aside></div>}
        </>}
      </main>

      <aside className={`${panel} h-fit min-w-0 p-4 ${previewLayout}`}><h2 className="flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4" />Preview</h2><button disabled={!draft || busy} onClick={() => void preview("structural")} className="mt-3 w-full rounded border border-[#D4D4D8] py-2 text-xs">{busyLabel === "Atualizando preview" ? "Atualizando preview •••" : "Preview estrutural"}</button><div className="mt-2 min-h-24 whitespace-pre-wrap rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-xs text-[#6B6F7B]">{structuralPreview || "A estrutura aparecerá aqui sem chamar IA."}</div><label className="mt-4 block text-[10px] uppercase tracking-wider text-[#9CA3AF]">Produto real<select value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-1 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs"><option value="">Selecione</option>{products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label><button disabled={!draft || !productId || busy} onClick={() => void preview("real")} className="mt-2 w-full rounded bg-[#EDEDED] py-2 text-xs font-medium text-[#111] disabled:opacity-40">{busyLabel === "Gerando preview" ? "Gerando preview •••" : "Gerar preview real"}</button><div className="mt-2 min-h-40 whitespace-pre-wrap rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-xs leading-5">{realPreview || "Product + Trainer + Template atual."}</div>
        {draft && <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[#E8E9ED] pt-3"><button disabled={busy || draft.isDefault} onClick={() => void act("Definindo padrão", async () => { await ctaApi.setDefaultTemplate(draft.id); await load(draft.id); })} className="rounded border border-[#D4D4D8] py-1.5 text-[10px]"><Star className="mr-1 inline h-3 w-3" />Padrão</button><button disabled={busy} onClick={() => void act("Duplicando template", async () => { const value = await ctaApi.duplicateTemplate(draft.id); if (value) await load(value.id); })} className="rounded border border-[#D4D4D8] py-1.5 text-[10px]"><Copy className="mr-1 inline h-3 w-3" />Duplicar</button><button disabled={busy} onClick={() => setDraft({ ...draft, active: !draft.active })} className="rounded border border-[#D4D4D8] py-1.5 text-[10px]"><Check className="mr-1 inline h-3 w-3" />{draft.active ? "Desativar" : "Ativar"}</button><button disabled={busy || draft.isDefault} onClick={() => void act("Excluindo template", async () => { await ctaApi.deleteTemplate(draft.id); await load(); })} className="rounded border border-red-950 py-1.5 text-[10px] text-red-300"><Trash2 className="mr-1 inline h-3 w-3" />Excluir</button></div>}
      </aside>
    </div>
  </div>;
};
