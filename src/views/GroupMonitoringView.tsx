import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Link2, LoaderCircle, MessageSquare, Pause, Play, Plus, RefreshCw, RotateCcw, Tag, Trash2, Truck, X } from 'lucide-react';
import type { CapturedMessage, GroupMonitor, WhatsAppMessageType } from '../domain/monitoring/types';
import type { WhatsAppConnection, WhatsAppGroup } from '../domain/whatsapp/types';
import { monitoringApi } from '../services/monitoringApi';
import { whatsappApi } from '../services/whatsappApi';
import { ProductReviewRulesEditor } from '../components/monitoring/ProductReviewRulesEditor';
import type { ProductReviewRule } from '../domain/monitoring/ReviewSettingsRepository';
import { supabase } from '../lib/supabase';

const card = 'rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]';
function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
function excerpt(value: string): string { return value.trim() || 'Mensagem sem texto'; }
function typeLabel(type: WhatsAppMessageType): string {
  return ({ text: 'Texto', image: 'Imagem', video: 'Vídeo', document: 'Documento', audio: 'Áudio', sticker: 'Sticker', unknown: 'Outro' })[type];
}
function money(value: number | null): string | null {
  return value == null ? null : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
const marketplaceLabels: Record<string, string> = {
  shopee: 'Shopee', amazon: 'Amazon', mercado_livre: 'Mercado Livre', magalu: 'Magalu',
  aliexpress: 'AliExpress', other: 'Outro', unknown: 'Marketplace não identificado',
};

function AnalysisPanel({ capture, reprocessing, reviewing, onReprocess, onApprove, onReject }: {
  capture: CapturedMessage; reprocessing: boolean; reviewing: boolean;
  onReprocess: () => void; onApprove: () => void; onReject: () => void;
}): React.ReactNode {
  if (capture.processingStatus === 'raw') return <div className="mt-3 text-xs text-amber-300">Análise pendente</div>;
  if (capture.processingStatus === 'processing') return <div className="mt-3 flex items-center gap-2 text-xs text-sky-300"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />Analisando...</div>;
  if (capture.processingStatus === 'ignored') return <div className="mt-3 text-xs text-[#6B6F7B]">Não é promoção</div>;
  if (capture.processingStatus === 'failed' || capture.processingStatus === 'needs_review') {
    const failed = capture.processingStatus === 'failed';
    return <div className={`mt-3 rounded-lg border p-3 ${failed ? 'border-red-900/60 bg-red-950/15' : 'border-amber-900/60 bg-amber-950/15'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs"><AlertCircle className="h-3.5 w-3.5" /><span>{failed ? 'Não foi possível analisar' : 'Análise inconclusiva'}</span>{capture.analysis?.reason === 'insufficient_text_content' && <span className="text-[#9CA3AF]">Conteúdo textual insuficiente</span>}</div>
      <button disabled={reprocessing} onClick={onReprocess} className="flex items-center gap-1.5 rounded-md border border-[#D4D4D8] px-2.5 py-1.5 text-xs text-[#D4D4D8] disabled:opacity-50"><RotateCcw className={`h-3.5 w-3.5 ${reprocessing ? 'animate-spin' : ''}`} />{reprocessing ? 'Reprocessando...' : 'Reprocessar'}</button></div>
    </div>;
  }
  const analysis = capture.analysis;
  if (!analysis) return <div className="mt-3 text-xs text-amber-300">Análise pendente</div>;
  return <div className="mt-3 rounded-lg border border-emerald-900/60 bg-emerald-950/15 p-3">
    <div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-emerald-600">Promoção detectada</span><span className="text-[11px] text-[#9CA3AF]">{Math.round(analysis.confidence * 100)}% confiança</span></div>
    {analysis.productName && <p className="text-sm font-medium text-[#0F172A]">{analysis.productName}</p>}
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6B6F7B]">
      {analysis.price != null && <span className="font-medium text-emerald-600">{money(analysis.price)}</span>}
      {analysis.originalPrice != null && <span className="line-through">{money(analysis.originalPrice)}</span>}
      {analysis.discountPercent != null && <span>{analysis.discountPercent}% OFF</span>}
      <span>{marketplaceLabels[analysis.marketplace] ?? analysis.marketplace}</span>
      {analysis.coupon?.code && <span className="flex items-center gap-1"><Tag className="h-3 w-3" />Cupom {analysis.coupon.code}</span>}
      {analysis.freeShipping && <span className="flex items-center gap-1"><Truck className="h-3 w-3" />Frete grátis</span>}
    </div>
    {capture.reviewStatus === 'pending' ? <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={reviewing} onClick={onApprove} className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-950 disabled:opacity-50"><Check className="h-3.5 w-3.5" />Aprovar e cadastrar</button>
      <button disabled={reviewing} onClick={onReject} className="flex items-center gap-1.5 rounded-md border border-[#D4D4D8] px-3 py-1.5 text-xs text-[#D4D4D8] disabled:opacity-50"><X className="h-3.5 w-3.5" />Rejeitar</button>
    </div> : <div className={`mt-3 text-xs font-medium ${capture.reviewStatus === 'approved' ? 'text-emerald-600' : 'text-[#6B6F7B]'}`}>
      {capture.reviewStatus === 'approved' ? 'Oferta aprovada e cadastrada em Produtos' : 'Oferta rejeitada'}
    </div>}
  </div>;
}

export const GroupMonitoringView: React.FC = () => {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [monitors, setMonitors] = useState<GroupMonitor[]>([]);
  const [captures, setCaptures] = useState<CapturedMessage[]>([]);
  const [connectionId, setConnectionId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [filterConnectionId, setFilterConnectionId] = useState('');
  const [reviewRequired, setReviewRequired] = useState(true);
  const [reviewRules, setReviewRules] = useState<ProductReviewRule[]>([]);
  const [reviewRulesDirty, setReviewRulesDirty] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const capturesLiveRef = useRef(false);

  const loadBase = useCallback(async () => {
    try {
      setError('');
      const [connectionRows, monitorRows, reviewSettings] = await Promise.all([
        whatsappApi.listConnections(), monitoringApi.listMonitors(), monitoringApi.getReviewSettings(),
      ]);
      setConnections(connectionRows); setMonitors(monitorRows);
      setReviewRequired(reviewSettings.reviewRequired);
      setReviewRules(reviewSettings.autoApprovalRules ?? []);
      setReviewRulesDirty(false);
      setConnectionId((current) => current || connectionRows.find((item) => item.status === 'connected')?.id || connectionRows[0]?.id || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar o monitoramento.'); }
    finally { setLoading(false); }
  }, []);

  const loadCaptures = useCallback(async (append = false, cursor?: string) => {
    try {
      const page = await monitoringApi.listCaptures({ connectionId: filterConnectionId || undefined, cursor, limit: 50 });
      setCaptures((current) => append ? [...current, ...page.items] : page.items);
      setNextCursor(page.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao carregar capturas.'); }
  }, [filterConnectionId]);

  useEffect(() => { void loadBase(); }, [loadBase]);
  useEffect(() => { void loadCaptures(); }, [loadCaptures]);
  useEffect(() => {
    if (!connectionId) { setGroups([]); setGroupId(''); return; }
    void whatsappApi.listConnectionGroups(connectionId).then((rows) => {
      const active = rows.filter((item) => item.syncStatus === 'active');
      setGroups(active); setGroupId((current) => active.some((item) => item.id === current) ? current : active[0]?.id || '');
    }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao carregar grupos.'));
  }, [connectionId]);
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let debounceTimer: number | null = null;
    let disposed = false;
    const scheduleLoad = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => { if (!disposed) void loadCaptures(); }, 200);
    };
    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || disposed) return;
      channel = supabase.channel(`captured-messages:${userId}`)
        .on('postgres_changes', { event:'*', schema:'public', table:'captured_messages', filter:`user_id=eq.${userId}` }, scheduleLoad)
        .subscribe((status) => { capturesLiveRef.current = status === 'SUBSCRIBED'; });
    }).catch(() => { capturesLiveRef.current = false; });
    const interval = window.setInterval(() => {
      if (!capturesLiveRef.current && document.visibilityState === 'visible') void loadCaptures();
    }, 30_000);
    return () => {
      disposed = true;
      capturesLiveRef.current = false;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.clearInterval(interval);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [loadCaptures]);

  const monitoredGroupIds = useMemo(() => new Set(monitors.map((item) => item.groupId)), [monitors]);
  const availableGroups = groups.filter((item) => !monitoredGroupIds.has(item.id));

  async function createMonitor(): Promise<void> {
    if (!groupId) return;
    setSaving(true); setError('');
    try {
      await monitoringApi.createMonitor(groupId, reviewRequired);
      await loadBase(); setGroupId('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao ativar monitor.'); }
    finally { setSaving(false); }
  }
  async function toggleReviewRequired(): Promise<void> {
    const previous = reviewRequired;
    const next = !previous;
    setReviewRequired(next); setSavingReview(true); setError('');
    try {
      const settings = await monitoringApi.updateReviewSettings({ reviewRequired: next, autoApprovalRules: reviewRules });
      setReviewRequired(settings.reviewRequired);
      setReviewRules(settings.autoApprovalRules ?? []);
    } catch (cause) {
      setReviewRequired(previous);
      setError(cause instanceof Error ? cause.message : 'Falha ao alterar a revisão global.');
    } finally { setSavingReview(false); }
  }
  async function saveReviewRules(): Promise<void> {
    setSavingReview(true); setError('');
    try {
      const settings = await monitoringApi.updateReviewSettings({ reviewRequired, autoApprovalRules: reviewRules });
      setReviewRequired(settings.reviewRequired);
      setReviewRules(settings.autoApprovalRules ?? []);
      setReviewRulesDirty(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar as regras do revisor.');
    } finally { setSavingReview(false); }
  }
  async function toggle(monitor: GroupMonitor): Promise<void> {
    try { await monitoringApi.updateMonitor(monitor.id, { enabled: !monitor.enabled }); await loadBase(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao alterar monitor.'); }
  }
  async function remove(monitor: GroupMonitor): Promise<void> {
    if (!window.confirm(`Remover o monitor de "${monitor.groupName}"? O histórico capturado será preservado.`)) return;
    try { await monitoringApi.deleteMonitor(monitor.id); await loadBase(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao remover monitor.'); }
  }
  async function reprocess(captureId: string): Promise<void> {
    setReprocessingId(captureId); setError('');
    try { await monitoringApi.reprocessCapture(captureId); await loadCaptures(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao reprocessar captura.'); }
    finally { setReprocessingId(null); }
  }
  async function clearCaptureHistory(): Promise<void> {
    if (!window.confirm('Apagar todo o histórico de capturas? Produtos, CTAs, filas e envios já realizados serão preservados.')) return;
    setClearingHistory(true); setError(''); setNotice('');
    try {
      const result = await monitoringApi.clearCaptureHistory();
      setCaptures([]); setNextCursor(null);
      setNotice(`${result.deletedCount} captura${result.deletedCount === 1 ? '' : 's'} removida${result.deletedCount === 1 ? '' : 's'} do histórico.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao apagar o histórico de capturas.'); }
    finally { setClearingHistory(false); }
  }
  async function review(captureId: string, decision: 'approved' | 'rejected'): Promise<void> {
    setReviewingId(captureId); setError('');
    try { await monitoringApi.reviewCapture(captureId, decision); await loadCaptures(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao revisar oferta.'); }
    finally { setReviewingId(null); }
  }

  return (
    <div className="space-y-6 pb-16 text-[#0F172A]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Monitoramento de grupos</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">Capture mensagens reais de grupos selecionados, sem interpretar ou publicar o conteúdo.</p>
        </div>
        <button onClick={() => { void loadBase(); void loadCaptures(); }} className="flex items-center gap-2 self-start rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm text-[#6B6F7B] hover:text-[#0F172A]">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-900/60 bg-red-950/20 px-4 py-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-600">{notice}</div>}

      <section className={`${card} p-5`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-medium">Revisão antes de cadastrar</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-[#9CA3AF]">Interruptor global: vale para todos os grupos monitorados e impede que uma automação crie produtos sem sua aprovação.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={reviewRequired}
            aria-label="Revisão global antes de cadastrar"
            disabled={savingReview}
            onClick={() => void toggleReviewRequired()}
            className={`flex min-w-36 items-center justify-between gap-3 rounded-full border px-3 py-2 text-xs font-medium transition ${reviewRequired ? 'border-emerald-700/70 bg-emerald-950/30 text-emerald-200' : 'border-amber-700/70 bg-amber-950/20 text-amber-200'} disabled:cursor-wait disabled:opacity-60`}
          >
            <span>{reviewRequired ? 'ON · revisar' : 'OFF · automático'}</span>
            <span className={`relative h-5 w-9 rounded-full transition ${reviewRequired ? 'bg-emerald-500' : 'bg-[#D4D4D8]'}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${reviewRequired ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
          </button>
        </div>
        <p className={`mt-3 text-xs ${reviewRequired ? 'text-emerald-600' : 'text-amber-300'}`}>
          {reviewRequired ? 'Ligado: o revisor decide primeiro; somente aprovações manuais ou regras correspondentes liberam o produto.' : 'Desligado: automações ativas podem cadastrar promoções automaticamente.'}
        </p>
        <ProductReviewRulesEditor
          rules={reviewRules}
          active={reviewRequired}
          saving={savingReview}
          dirty={reviewRulesDirty}
          onChange={(rules) => { setReviewRules(rules); setReviewRulesDirty(true); }}
          onSave={() => void saveReviewRules()}
        />
      </section>

      <section className={`${card} p-5`}>
        <div className="mb-5 flex items-center gap-2"><Plus className="h-4 w-4" /><h2 className="text-sm font-medium">Ativar novo monitor</h2></div>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto] lg:items-end">
          <label className="space-y-2 text-xs text-[#6B6F7B]">WhatsApp
            <select value={connectionId} onChange={(event) => setConnectionId(event.target.value)} className="block w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2.5 text-sm text-white">
              <option value="">Selecione uma conexão</option>
              {connections.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.status === 'connected' ? 'conectado' : item.status}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-xs text-[#6B6F7B]">Grupo real
            <select value={groupId} onChange={(event) => setGroupId(event.target.value)} disabled={!connectionId} className="block w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2.5 text-sm text-white disabled:opacity-50">
              <option value="">{availableGroups.length ? 'Selecione um grupo' : 'Nenhum grupo disponível'}</option>
              {availableGroups.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.participantsCount})</option>)}
            </select>
          </label>
          <button disabled={!groupId || saving} onClick={() => void createMonitor()} className="rounded-lg bg-[#EDEDED] px-4 py-2.5 text-sm font-medium text-[#111] disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Ativando…' : 'Ativar monitor'}
          </button>
        </div>
        {connectionId && groups.length === 0 && <p className="mt-4 text-xs text-[#9CA3AF]">Nenhum grupo sincronizado nesta conexão. Sincronize os grupos na tela de Integrações.</p>}
      </section>

      <section className={card}>
        <div className="border-b border-[#E8E9ED] px-5 py-4"><h2 className="text-sm font-medium">Grupos monitorados</h2></div>
        {loading ? <p className="p-6 text-sm text-[#9CA3AF]">Carregando…</p> : monitors.length === 0 ? (
          <div className="p-8 text-center"><MessageSquare className="mx-auto mb-3 h-6 w-6 text-[#6B6F7B]" /><p className="text-sm text-[#6B6F7B]">Nenhum grupo monitorado.</p><p className="mt-1 text-xs text-[#9CA3AF]">Selecione uma conexão e um grupo real acima.</p></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="text-xs text-[#9CA3AF]"><tr className="border-b border-[#E8E9ED]"><th className="px-5 py-3 font-medium">Grupo</th><th className="px-5 py-3 font-medium">WhatsApp</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Última captura</th><th className="px-5 py-3 text-right font-medium">Ações</th></tr></thead>
          <tbody>{monitors.map((monitor) => <tr key={monitor.id} className="border-b border-[#ECECEF] last:border-0"><td className="px-5 py-4 font-medium">{monitor.groupName}</td><td className="px-5 py-4 text-[#6B6F7B]">{monitor.connectionLabel}</td><td className="px-5 py-4"><span className={`rounded-full border px-2 py-1 text-xs ${monitor.enabled ? 'border-emerald-900 bg-emerald-950/30 text-emerald-600' : 'border-[#D4D4D8] text-[#6B6F7B]'}`}>{monitor.enabled ? 'Ativo' : 'Pausado'}</span></td><td className="px-5 py-4 text-[#9CA3AF]">{monitor.lastActivityAt ? dateTime(monitor.lastActivityAt) : 'Sem capturas'}</td><td className="px-5 py-4"><div className="flex justify-end gap-1"><button title={monitor.enabled ? 'Pausar' : 'Reativar'} onClick={() => void toggle(monitor)} className="rounded-md p-2 text-[#6B6F7B] hover:bg-[#F4F4F6] hover:text-[#0F172A]">{monitor.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button><button title="Remover" onClick={() => void remove(monitor)} className="rounded-md p-2 text-[#6B6F7B] hover:bg-red-950/30 hover:text-red-300"><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>
        )}
      </section>

      <section className={card}>
        <div className="flex flex-col gap-3 border-b border-[#E8E9ED] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-medium">Capturas recentes</h2><p className="mt-1 text-xs text-[#9CA3AF]">Mais recentes primeiro · atualização automática</p></div>
          <div className="flex flex-wrap items-center justify-end gap-2"><label className="relative text-xs text-[#9CA3AF]"><select value={filterConnectionId} onChange={(event) => setFilterConnectionId(event.target.value)} className="appearance-none rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] py-2 pl-3 pr-9 text-sm text-[#D4D4D8]"><option value="">Todos os WhatsApps</option>{connections.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4" /></label><button type="button" onClick={() => void clearCaptureHistory()} disabled={clearingHistory} className="flex items-center gap-1.5 rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 hover:bg-red-950/30 disabled:cursor-wait disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />{clearingHistory ? 'Apagando…' : 'Apagar histórico'}</button></div>
        </div>
        {captures.length === 0 ? <div className="p-10 text-center"><MessageSquare className="mx-auto mb-3 h-6 w-6 text-[#6B6F7B]" /><p className="text-sm text-[#6B6F7B]">Nenhuma mensagem capturada.</p><p className="mt-1 text-xs text-[#9CA3AF]">Ative um monitor e aguarde uma mensagem enviada por outro participante.</p></div> : (
          <div className="divide-y divide-[#ECECEF]">{captures.map((capture) => {
            const source = capture.sources[0];
            return <article key={capture.id} className="px-5 py-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2 text-xs"><span className="font-medium text-[#D4D4D8]">{source?.groupName ?? capture.externalGroupId}</span><ChevronRight className="h-3 w-3 text-[#6B6F7B]" /><span className="text-[#6B6F7B]">{source?.connectionLabel ?? 'WhatsApp'}</span><span className="rounded border border-[#E8E9ED] px-1.5 py-0.5 text-[#6B6F7B]">{typeLabel(capture.messageType)}</span>{capture.sources.length > 1 && <span className="text-[#9CA3AF]">{capture.sources.length} origens</span>}</div><p className="line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-[#D4D4D8]">{excerpt(capture.rawContent)}</p>{capture.links.length > 0 && <div className="mt-2 flex items-center gap-1.5 text-xs text-[#6B6F7B]"><Link2 className="h-3.5 w-3.5" /> {capture.links.length} {capture.links.length === 1 ? 'link' : 'links'}</div>}<AnalysisPanel capture={capture} reprocessing={reprocessingId === capture.id} reviewing={reviewingId === capture.id} onReprocess={() => void reprocess(capture.id)} onApprove={() => void review(capture.id, 'approved')} onReject={() => void review(capture.id, 'rejected')} /></div><div className="shrink-0 text-xs text-[#9CA3AF]"><div>Mensagem capturada</div><time>{dateTime(capture.sentAt)}</time></div></div></article>;
          })}</div>
        )}
        {nextCursor && <div className="border-t border-[#E8E9ED] p-4 text-center"><button onClick={() => void loadCaptures(true, nextCursor)} className="rounded-lg border border-[#E8E9ED] px-4 py-2 text-sm text-[#6B6F7B] hover:text-[#0F172A]">Carregar mais</button></div>}
      </section>
    </div>
  );
};
