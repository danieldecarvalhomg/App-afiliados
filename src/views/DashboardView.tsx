import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  CircleOff,
  Clock3,
  Loader2,
  Megaphone,
  PackageCheck,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Wifi,
  Zap,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Campaign, QueueItem, QueueItemStatus } from '../domain/dispatch/types';
import type { ProductRecord } from '../domain/products/types';
import type { WhatsAppConnection, WhatsAppConnectionStatus } from '../domain/whatsapp/types';
import { dispatchApi, dispatchNavigation } from '../services/dispatchApi';
import { productsApi, productsNavigation } from '../services/productsApi';
import { integrationsNavigation, whatsappApi } from '../services/whatsappApi';

type Timeframe = '24h' | '7d' | '30d' | '90d';

interface DashboardData {
  products: ProductRecord[];
  queueItems: QueueItem[];
  campaigns: Campaign[];
  connections: WhatsAppConnection[];
}

const EMPTY_DATA: DashboardData = { products: [], queueItems: [], campaigns: [], connections: [] };
const timeframeMs: Record<Timeframe, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

function withDashboardTimeout<T>(source: string, promise: Promise<T>, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${source} demorou mais de ${timeoutMs / 1000}s para responder.`)), timeoutMs);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (cause) => { window.clearTimeout(timer); reject(cause); },
    );
  });
}

const queueStatus: Record<QueueItemStatus, { label: string; dot: string; text: string }> = {
  draft: { label: 'Rascunho', dot: 'bg-[#9CA3AF]', text: 'text-[#6B6F7B]' },
  scheduled: { label: 'Agendado', dot: 'bg-[#3B82F6]', text: 'text-[#2563EB]' },
  queued: { label: 'Aguardando', dot: 'bg-[#EAB308]', text: 'text-[#CA8A04]' },
  sending: { label: 'Enviando', dot: 'bg-[#3B82F6]', text: 'text-[#2563EB]' },
  completed: { label: 'Concluído', dot: 'bg-[#22C55E]', text: 'text-[#16A34A]' },
  partially_failed: { label: 'Falha parcial', dot: 'bg-[#F97316]', text: 'text-[#EA580C]' },
  failed: { label: 'Falhou', dot: 'bg-[#EF4444]', text: 'text-red-600' },
  paused: { label: 'Pausado', dot: 'bg-[#EAB308]', text: 'text-[#CA8A04]' },
  cancelled: { label: 'Cancelado', dot: 'bg-[#9CA3AF]', text: 'text-[#6B6F7B]' },
};

const connectionStatus: Record<WhatsAppConnectionStatus, { label: string; color: string }> = {
  disconnected: { label: 'Desconectado', color: 'text-[#6B6F7B]' },
  qr_required: { label: 'Aguardando QR', color: 'text-[#CA8A04]' },
  connecting: { label: 'Conectando', color: 'text-[#2563EB]' },
  connected: { label: 'Conectado', color: 'text-[#16A34A]' },
  reconnecting: { label: 'Reconectando', color: 'text-[#CA8A04]' },
  logged_out: { label: 'Sessão encerrada', color: 'text-red-600' },
  error: { label: 'Erro', color: 'text-red-600' },
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatUpdatedAt(value: Date | null): string {
  if (!value) return 'Ainda não atualizado';
  return `Atualizado às ${value.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function buildVolumeSeries(items: QueueItem[], timeframe: Timeframe, now: number) {
  const duration = timeframeMs[timeframe];
  const bucketCount = timeframe === '24h' ? 8 : timeframe === '7d' ? 7 : timeframe === '30d' ? 10 : 9;
  const bucketSize = duration / bucketCount;
  const start = now - duration;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    start: start + index * bucketSize,
    value: 0,
  }));

  for (const item of items) {
    const timestamp = new Date(item.scheduledAt || item.createdAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp < start || timestamp > now) continue;
    const index = Math.min(bucketCount - 1, Math.floor((timestamp - start) / bucketSize));
    buckets[index].value += item.progress.sent;
  }

  return buckets.map((bucket) => ({
    ...bucket,
    label: timeframe === '24h'
      ? new Date(bucket.start).toLocaleTimeString('pt-BR', { hour: '2-digit' })
      : new Date(bucket.start).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
  }));
}

export const DashboardView: React.FC = () => {
  const { integrations, setActiveTab, currentUser } = useApp();
  const [timeframe, setTimeframe] = useState<Timeframe>('7d');
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const loadingRequest = useRef(false);

  const loadDashboard = useCallback(async (silent = false) => {
    if (loadingRequest.current) return;
    loadingRequest.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const results = await Promise.allSettled([
        withDashboardTimeout('Produtos', productsApi.list()),
        withDashboardTimeout('Itens da fila', dispatchApi.listQueue()),
        withDashboardTimeout('Filas', dispatchApi.listQueues()),
        withDashboardTimeout('Conexões do WhatsApp', whatsappApi.listConnections()),
      ]);
      const [products, queueItems, campaigns, connections] = results;
      setData((current) => ({
        products: products.status === 'fulfilled' ? products.value : current.products,
        queueItems: queueItems.status === 'fulfilled' ? queueItems.value : current.queueItems,
        campaigns: campaigns.status === 'fulfilled' ? campaigns.value : current.campaigns,
        connections: connections.status === 'fulfilled' ? connections.value : current.connections,
      }));
      const failures = results.flatMap((result) => result.status === 'rejected'
        ? [result.reason instanceof Error ? result.reason.message : 'Uma fonte da Dashboard não respondeu.']
        : []);
      if (results.some((result) => result.status === 'fulfilled')) setUpdatedAt(new Date());
      setError(failures.length ? `Dados parciais: ${failures.join(' ')}` : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível atualizar a dashboard.');
    } finally {
      loadingRequest.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void loadDashboard(true), 250);
    };
    const unsubscribeDispatch = dispatchApi.subscribe(scheduleRefresh);
    const unsubscribeWhatsApp = whatsappApi.subscribe(scheduleRefresh);
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsubscribeDispatch();
      unsubscribeWhatsApp();
    };
  }, [loadDashboard]);

  const now = Date.now();
  const rangeStart = now - timeframeMs[timeframe];
  const periodQueueItems = data.queueItems.filter((item) => {
    const timestamp = new Date(item.scheduledAt || item.createdAt).getTime();
    return Number.isFinite(timestamp) && timestamp >= rangeStart && timestamp <= now;
  });
  const sentCount = periodQueueItems.reduce((total, item) => total + item.progress.sent, 0);
  const failedCount = periodQueueItems.reduce((total, item) => total + item.progress.failed + item.progress.uncertain, 0);
  const pendingCount = data.queueItems.reduce((total, item) => total + item.progress.pending, 0);
  const deliveryRate = sentCount + failedCount > 0 ? (sentCount / (sentCount + failedCount)) * 100 : 0;
  const readyProducts = data.products.filter((product) => product.affiliateStatus === 'converted').length;
  const productsCreated = data.products.filter((product) => new Date(product.createdAt).getTime() >= rangeStart).length;
  const activeCampaigns = data.campaigns.filter((campaign) => campaign.status === 'active').length;
  const connectedWhatsApp = data.connections.filter((connection) => connection.status === 'connected').length;
  const recentQueueItems = [...data.queueItems]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const volumeSeries = buildVolumeSeries(data.queueItems, timeframe, now);
  const maxVolume = Math.max(...volumeSeries.map((item) => item.value), 1);
  const userName = currentUser?.user_metadata?.full_name?.split(' ')[0]
    || currentUser?.email?.split('@')[0]
    || 'Afiliado';

  const recommendation = useMemo(() => {
    if (data.products.length === 0) return {
      title: 'Cadastre sua primeira oferta',
      description: 'Adicione um produto para gerar o link afiliado e preparar uma CTA publicável.',
      label: 'Cadastrar oferta',
      icon: PackageCheck,
      action: () => {
        productsNavigation.openCreate();
        setActiveTab('produtos');
      },
    };
    if (connectedWhatsApp === 0) return {
      title: 'Conecte seu WhatsApp',
      description: 'A fila precisa de uma conexão ativa para enviar ofertas aos grupos sincronizados.',
      label: 'Conectar WhatsApp',
      icon: Wifi,
      action: () => {
        integrationsNavigation.openWhatsAppComposer();
        setActiveTab('integracoes');
      },
    };
    if (data.campaigns.length === 0) return {
      title: 'Crie uma campanha',
      description: 'Escolha a conexão, os grupos reais e o intervalo seguro entre os envios.',
      label: 'Criar campanha',
      icon: Megaphone,
      action: () => {
        dispatchNavigation.openCampaignComposer();
        setActiveTab('campanhas');
      },
    };
    if (failedCount > 0) return {
      title: 'Revise os envios com falha',
      description: `${formatNumber(failedCount)} entrega${failedCount === 1 ? '' : 's'} requer${failedCount === 1 ? '' : 'em'} atenção neste período.`,
      label: 'Abrir filas',
      icon: AlertTriangle,
      action: () => setActiveTab('filas'),
    };
    return {
      title: 'Prepare a próxima oferta',
      description: `${readyProducts} produto${readyProducts === 1 ? '' : 's'} com link afiliado pronto${readyProducts === 1 ? '' : 's'} para uma nova mensagem.`,
      label: 'Gerar mensagem',
      icon: Sparkles,
      action: () => setActiveTab('mensagens'),
    };
  }, [connectedWhatsApp, data.campaigns.length, data.products.length, failedCount, readyProducts, setActiveTab]);

  const RecommendationIcon = recommendation.icon;

  const openProductCreate = () => {
    productsNavigation.openCreate();
    setActiveTab('produtos');
  };

  const openCampaignCreate = () => {
    dispatchNavigation.openCampaignComposer();
    setActiveTab('campanhas');
  };

  const openQueueItem = (id: string) => {
    dispatchNavigation.openQueueItem(id);
    setActiveTab('filas');
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-[#6B6F7B]">
        <Loader2 className="h-5 w-5 animate-spin" /> Carregando dados reais da operação •••
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-12">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">Olá, {userName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#6B6F7B]">
            <span>Visão operacional do AfiliHub</span>
            <span className="text-[#D4D4D8]">•</span>
            <span className="text-xs text-[#9CA3AF]">{formatUpdatedAt(updatedAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => void loadDashboard(true)} disabled={refreshing} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 text-xs text-[#6B6F7B] transition-colors hover:border-[#D4D4D8] hover:text-[#0F172A] disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button onClick={openProductCreate} className="inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-[#FF2D7D] via-[#FF6B6B] to-[#FF9F43] px-4 text-sm font-semibold text-white hover:opacity-90"><Plus className="h-4 w-4" /> Nova oferta</button>
          <button onClick={() => setActiveTab('mensagens')} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#E8E9ED] px-4 text-sm font-medium text-[#0F172A] hover:border-[#D4D4D8]"><Sparkles className="h-4 w-4" /> Gerar mensagem</button>
        </div>
      </header>

      {error && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 sm:flex-row sm:items-center">
          <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> {error}</span>
          <button onClick={() => void loadDashboard()} className="text-left text-xs font-medium underline sm:text-right">Tentar novamente</button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 overflow-x-auto rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-2">
        <span className="hidden pl-2 text-xs text-[#9CA3AF] sm:block">Período dos resultados</span>
        <div className="flex min-w-max gap-1">
          {(['24h', '7d', '30d', '90d'] as Timeframe[]).map((value) => (
            <button key={value} onClick={() => setTimeframe(value)} aria-pressed={timeframe === value} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${timeframe === value ? 'bg-[#EDEDED] text-[#111]' : 'text-[#6B6F7B] hover:bg-[#F4F4F6] hover:text-[#0F172A]'}`}>
              {value === '24h' ? '24 horas' : value === '7d' ? '7 dias' : value === '30d' ? '30 dias' : '90 dias'}
            </button>
          ))}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <button onClick={() => setActiveTab('produtos')} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5 text-left transition-colors hover:border-[#D4D4D8]">
          <div className="flex items-start justify-between"><span className="text-xs font-medium uppercase tracking-wider text-[#9CA3AF]">Ofertas prontas</span><PackageCheck className="h-4 w-4 text-[#9CA3AF]" /></div>
          <div className="mt-3 text-2xl font-bold text-[#0F172A]">{readyProducts} <span className="text-base font-normal text-[#9CA3AF]">/ {data.products.length}</span></div>
          <p className="mt-2 text-xs text-[#9CA3AF]">{productsCreated} cadastrada{productsCreated === 1 ? '' : 's'} no período</p>
        </button>
        <button onClick={() => setActiveTab('filas')} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5 text-left transition-colors hover:border-[#D4D4D8]">
          <div className="flex items-start justify-between"><span className="text-xs font-medium uppercase tracking-wider text-[#9CA3AF]">Disparos enviados</span><Send className="h-4 w-4 text-[#9CA3AF]" /></div>
          <div className="mt-3 text-2xl font-bold text-[#0F172A]">{formatNumber(sentCount)}</div>
          <p className="mt-2 text-xs text-[#9CA3AF]">{pendingCount} entrega{pendingCount === 1 ? '' : 's'} aguardando na fila</p>
        </button>
        <button onClick={() => setActiveTab('filas')} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5 text-left transition-colors hover:border-[#D4D4D8]">
          <div className="flex items-start justify-between"><span className="text-xs font-medium uppercase tracking-wider text-[#9CA3AF]">Taxa de entrega</span><CheckCircle2 className="h-4 w-4 text-[#9CA3AF]" /></div>
          <div className="mt-3 text-2xl font-bold text-[#0F172A]">{deliveryRate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#F4F4F6]"><div className="h-full rounded-full bg-[#EDEDED] transition-all" style={{ width: `${Math.min(deliveryRate, 100)}%` }} /></div>
          <p className="mt-2 text-xs text-[#9CA3AF]">{failedCount} falha{failedCount === 1 ? '' : 's'} ou envio{failedCount === 1 ? '' : 's'} incerto{failedCount === 1 ? '' : 's'}</p>
        </button>
        <button onClick={() => setActiveTab('campanhas')} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5 text-left transition-colors hover:border-[#D4D4D8]">
          <div className="flex items-start justify-between"><span className="text-xs font-medium uppercase tracking-wider text-[#9CA3AF]">Campanhas ativas</span><Megaphone className="h-4 w-4 text-[#9CA3AF]" /></div>
          <div className="mt-3 text-2xl font-bold text-[#0F172A]">{activeCampaigns} <span className="text-base font-normal text-[#9CA3AF]">/ {data.campaigns.length}</span></div>
          <p className="mt-2 text-xs text-[#9CA3AF]">{connectedWhatsApp} WhatsApp{connectedWhatsApp === 1 ? '' : 's'} conectado{connectedWhatsApp === 1 ? '' : 's'}</p>
        </button>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] xl:col-span-8">
          <div className="flex flex-col justify-between gap-3 border-b border-[#E8E9ED] p-5 sm:flex-row sm:items-center">
            <div><h2 className="text-sm font-semibold text-[#0F172A]">Fila de disparos</h2><p className="mt-1 text-xs text-[#9CA3AF]">Progresso real do Dispatch Engine por campanha e conexão.</p></div>
            <button onClick={() => setActiveTab('filas')} className="inline-flex items-center gap-1.5 text-xs font-medium text-[#6B6F7B] hover:text-[#0F172A]">Ver todas <ArrowRight className="h-3.5 w-3.5" /></button>
          </div>
          {recentQueueItems.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <Boxes className="mx-auto h-8 w-8 text-[#D4D4D8]" /><h3 className="mt-3 text-sm font-medium text-[#0F172A]">Nenhum disparo preparado</h3><p className="mt-1 text-xs text-[#9CA3AF]">Crie uma CTA publicável e envie para uma campanha.</p>
              <button onClick={() => setActiveTab('cta-studio')} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-4 py-2 text-xs text-[#0F172A] hover:border-[#D4D4D8]"><Sparkles className="h-3.5 w-3.5" /> Abrir Treinador de IA</button>
            </div>
          ) : (
            <div>
              {recentQueueItems.map((item) => {
                const status = queueStatus[item.status];
                const progress = item.progress.total > 0 ? (item.progress.sent / item.progress.total) * 100 : 0;
                return (
                  <button key={item.id} onClick={() => openQueueItem(item.id)} className="grid w-full gap-3 border-b border-[#E8E9ED] px-5 py-4 text-left transition-colors last:border-0 hover:bg-[#F4F4F6] sm:grid-cols-[minmax(0,1fr)_150px_130px_18px] sm:items-center">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-[#0F172A]">{item.contentSnapshot.productTitle || 'Mensagem preparada'}</p><p className="mt-1 truncate text-xs text-[#9CA3AF]">{item.campaignName} · {item.connectionLabel}</p></div>
                    <div className="text-xs"><div className="flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /><span className={status.text}>{status.label}</span></div><p className="mt-1 text-[#9CA3AF]">{item.progress.sent}/{item.progress.total} entregas</p></div>
                    <div><div className="h-1.5 overflow-hidden rounded-full bg-[#F4F4F6]"><div className="h-full rounded-full bg-[#EDEDED]" style={{ width: `${Math.min(progress, 100)}%` }} /></div><p className="mt-1.5 text-right text-[10px] text-[#9CA3AF]">{progress.toFixed(0)}%</p></div>
                    <ArrowRight className="h-4 w-4 text-[#6B6F7B]" />
                  </button>
                );
              })}
            </div>
          )}
          <div className="border-t border-[#E8E9ED] p-5">
            <div className="mb-4 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-[#6B6F7B]"><BarChart3 className="h-4 w-4" /> Entregas concluídas no período</div><span className="text-xs font-medium text-[#0F172A]">{formatNumber(sentCount)}</span></div>
            <div className="flex h-24 items-end gap-1.5" aria-label="Volume de entregas por intervalo">
              {volumeSeries.map((item) => (
                <div key={item.start} className="group flex h-full min-w-0 flex-1 flex-col justify-end gap-1.5">
                  <div className="relative flex flex-1 items-end rounded-sm bg-[#F4F4F6]"><div className="w-full rounded-sm bg-gradient-to-t from-[#FF9F43] to-[#FF2D7D] transition-all group-hover:opacity-80" style={{ height: `${item.value === 0 ? 2 : Math.max(8, (item.value / maxVolume) * 100)}%` }} /><span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 rounded bg-[#0F172A] px-1.5 py-0.5 text-[9px] text-white group-hover:block">{item.value}</span></div>
                  <span className="truncate text-center text-[9px] text-[#6B6F7B]">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-5 xl:col-span-4">
          <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]">
            <div className="flex items-center justify-between border-b border-[#E8E9ED] p-5"><div><h2 className="text-sm font-semibold text-[#0F172A]">Integrações</h2><p className="mt-1 text-xs text-[#9CA3AF]">Status informado pelos serviços reais.</p></div><button onClick={() => setActiveTab('integracoes')} className="text-xs text-[#6B6F7B] hover:text-[#0F172A]">Ver todas</button></div>
            <div className="space-y-2 p-4">
              {data.connections.slice(0, 3).map((connection) => {
                const status = connectionStatus[connection.status];
                return <button key={connection.id} onClick={() => { integrationsNavigation.openWhatsApp(connection.id); setActiveTab('integracoes'); }} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-left hover:border-[#D4D4D8]"><span className="min-w-0"><span className="block truncate text-sm font-medium text-[#0F172A]">{connection.label}</span><span className="mt-0.5 block truncate text-[10px] text-[#9CA3AF]">{connection.phone || 'WhatsApp'}</span></span><span className={`shrink-0 text-[10px] font-medium ${status.color}`}>{status.label}</span></button>;
              })}
              {integrations.filter((integration) => integration.key !== 'whatsapp').slice(0, Math.max(0, 3 - data.connections.length)).map((integration) => (
                <button key={integration.id} onClick={() => { integrationsNavigation.openGeneric(integration.id); setActiveTab('integracoes'); }} className="flex w-full items-center justify-between gap-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-left hover:border-[#D4D4D8]"><span className="truncate text-sm font-medium text-[#0F172A]">{integration.name}</span><span className={`shrink-0 text-[10px] font-medium ${integration.connectionStatus === 'connected' ? 'text-[#16A34A]' : integration.connectionStatus === 'error' ? 'text-red-600' : 'text-[#6B6F7B]'}`}>{integration.connectionStatus === 'connected' ? 'Conectada' : integration.configurationStatus === 'configured' ? 'Configurada' : 'Configurar'}</span></button>
              ))}
              {data.connections.length === 0 && integrations.filter((integration) => integration.key !== 'whatsapp').length === 0 && (
                <button onClick={() => { integrationsNavigation.openWhatsAppComposer(); setActiveTab('integracoes'); }} className="w-full rounded-lg border border-dashed border-[#D4D4D8] p-6 text-center hover:border-[#6B6F7B]"><CircleOff className="mx-auto h-6 w-6 text-[#6B6F7B]" /><span className="mt-2 block text-xs text-[#6B6F7B]">Nenhuma integração configurada</span><span className="mt-1 block text-[10px] text-[#9CA3AF]">Conectar WhatsApp</span></button>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5">
            <div className="flex items-start gap-3"><div className="rounded-lg bg-[#FFF0F4] p-2"><RecommendationIcon className="h-4 w-4 text-[#FF2D7D]" /></div><div className="min-w-0"><span className="text-[10px] font-medium uppercase tracking-wider text-[#9CA3AF]">Próxima ação</span><h2 className="mt-1 text-sm font-semibold text-[#0F172A]">{recommendation.title}</h2></div></div>
            <p className="mt-3 text-sm leading-6 text-[#6B6F7B]">{recommendation.description}</p>
            <button onClick={recommendation.action} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#FF2D7D] via-[#FF6B6B] to-[#FF9F43] py-2.5 text-sm font-semibold text-white hover:opacity-90">{recommendation.label} <ArrowRight className="h-4 w-4" /></button>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <button onClick={openCampaignCreate} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-4 text-left hover:border-[#D4D4D8]"><Megaphone className="h-4 w-4 text-[#6B6F7B]" /><span className="mt-3 block text-xs font-medium text-[#0F172A]">Nova campanha</span></button>
            <button onClick={() => setActiveTab('automacoes')} className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-4 text-left hover:border-[#D4D4D8]"><Zap className="h-4 w-4 text-[#6B6F7B]" /><span className="mt-3 block text-xs font-medium text-[#0F172A]">Automações</span></button>
          </section>
        </aside>
      </div>

      <p className="flex items-center gap-2 text-xs text-[#6B6F7B]"><Clock3 className="h-3.5 w-3.5" /> A dashboard não estima receita ou cliques: exibe somente dados que o backend atual consegue comprovar.</p>
    </div>
  );
};
