import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, LockKeyhole, RefreshCw, ShoppingBag, Sparkles } from 'lucide-react';
import { marketplaceRadarApi } from '../services/marketplaceRadarApi';
import type { MarketplaceDeal, RadarFilters, RadarSort } from '../domain/marketplaces/discovery/types';
import type { ProductRecord } from '../domain/products/types';
import type { ConfigurableAffiliatePlatform } from '../domain/affiliate/types';
import { supabase } from '../lib/supabase';

interface Props { onConfigureMarketplace: (platform: ConfigurableAffiliatePlatform) => void; onCreateManual: () => void; onPrepared?: (product: ProductRecord) => void; }
type AffiliateStatus = 'not_configured' | 'pending_validation' | 'valid' | 'invalid' | 'error';
const marketplaceNames: Record<ConfigurableAffiliatePlatform, string> = { shopee: 'Shopee', amazon: 'Amazon', mercado_livre: 'Mercado Livre' };
const money = (value: number | null | undefined) => value == null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = (value: string | null | undefined) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
const selectedMarketplace = (value: unknown): ConfigurableAffiliatePlatform => value === 'amazon' || value === 'mercado_livre' ? value : 'shopee';

export const MarketplaceRadarView: React.FC<Props> = ({ onConfigureMarketplace, onCreateManual, onPrepared }) => {
  const [deals, setDeals] = useState<MarketplaceDeal[]>([]);
  const [filters, setFilters] = useState<RadarFilters>({ marketplace: 'shopee', sort: 'score', limit: 24 });
  const [affiliateStatus, setAffiliateStatus] = useState<AffiliateStatus>('not_configured');
  const [loading, setLoading] = useState(true), [refreshing, setRefreshing] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const liveConnectedRef = useRef(false);
  const [preparing, setPreparing] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const marketplace = selectedMarketplace(filters.marketplace), marketplaceName = marketplaceNames[marketplace];

  const load = async (silent = false) => {
    if (!silent) setLoading(true); setError(null);
    try { const page = await marketplaceRadarApi.list(filters); setDeals(page.items); setAffiliateStatus(page.affiliateStatus ?? 'not_configured'); }
    catch (cause) { setDeals([]); setError(cause instanceof Error ? cause.message : 'Falha ao carregar Radar.'); }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { void load(); }, [JSON.stringify(filters)]);
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let debounceTimer: number | null = null;
    let disposed = false;
    const scheduleLoad = () => {
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => { if (!disposed) void load(true); }, 250);
    };
    void supabase.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId || disposed) return;
      channel = supabase.channel(`marketplace-radar:${userId}:${marketplace}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_deals', filter: `user_id=eq.${userId}` }, (payload) => {
          const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (row.marketplace === marketplace) scheduleLoad();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_discovery_runs', filter: `user_id=eq.${userId}` }, (payload) => {
          const row = (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>;
          if (row.marketplace === marketplace) scheduleLoad();
        })
        .subscribe((status) => { liveConnectedRef.current = status === 'SUBSCRIBED'; setLiveConnected(liveConnectedRef.current); });
    }).catch(() => { liveConnectedRef.current = false; setLiveConnected(false); });
    const pollTimer = window.setInterval(() => { if (!liveConnectedRef.current && document.visibilityState === 'visible') void load(true); }, 30_000);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      disposed = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.clearInterval(pollTimer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      if (channel) void supabase.removeChannel(channel);
      liveConnectedRef.current = false;
      setLiveConnected(false);
    };
  }, [JSON.stringify(filters), marketplace]);
  const refresh = async () => {
    setRefreshing(true); setError(null);
    try { const data = await marketplaceRadarApi.refresh(marketplace); await load(true); setNotice(`Consulta concluída: ${data.received} recebidas · ${data.inserted} novas · ${data.updated} alteradas · ${data.unchanged} sem mudanças.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao atualizar.'); }
    finally { setRefreshing(false); }
  };
  const prepare = async (id: string) => {
    setPreparing(id); setError(null);
    try {
      const data = await marketplaceRadarApi.prepare(id);
      setNotice(data.created ? marketplace === 'mercado_livre' ? 'Produto preparado. A conversão será gerada automaticamente pelo Portal usando sua sessão conectada.' : 'Produto preparado. A conversão afiliada foi iniciada.' : 'Produto já estava preparado.');
      onPrepared?.(data.product);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao preparar.'); }
    finally { setPreparing(null); }
  };
  const chooseMarketplace = (value: string) => { setNotice(null); setFilters({ ...filters, marketplace: selectedMarketplace(value), cursor: undefined }); };
  const marketplacePicker = <select value={marketplace} onChange={(event) => chooseMarketplace(event.target.value)} className="rounded-lg border border-slate-300 bg-white p-2 text-sm font-medium text-slate-900 shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"><option value="shopee">Shopee</option><option value="amazon">Amazon</option><option value="mercado_livre">Mercado Livre</option></select>;

  if (loading) return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Radar de Ofertas</h1><p className="mt-1 text-sm text-[#6B6F7B]">Ofertas da sua conta {marketplaceName}.</p></div><div className="flex justify-center py-20 text-[#6B6F7B]"><LoaderCircle className="mr-2 animate-spin" />Verificando sua conta {marketplaceName}...</div></div>;
  if (error && affiliateStatus !== 'valid') return <div className="space-y-6"><h1 className="text-2xl font-bold">Radar de Ofertas</h1><div>{marketplacePicker}</div><div className="rounded-xl border border-red-600 bg-red-50 p-6 text-red-800">{error}</div></div>;
  if (affiliateStatus !== 'valid') {
    const pending = affiliateStatus === 'pending_validation';
    return <div className="space-y-6"><div><h1 className="text-2xl font-bold">Radar de Ofertas</h1><div className="mt-4">{marketplacePicker}</div></div><div className="rounded-xl border border-slate-300 bg-white px-6 py-16 text-center"><LockKeyhole className="mx-auto mb-4 h-9 w-9 text-slate-600" /><h2 className="text-lg font-semibold">{pending ? `Validando sua conta ${marketplaceName}...` : `Conecte e valide sua conta ${marketplaceName}`}</h2><p className="mx-auto mt-2 max-w-lg text-sm text-slate-700">{pending ? 'O Radar será liberado após a validação das credenciais.' : 'Abra Integrações, informe as credenciais oficiais e volte ao Radar.'}</p>{!pending && <button onClick={() => onConfigureMarketplace(marketplace)} className="mt-6 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">Configurar {marketplaceName}</button>}</div></div>;
  }

  const latestSeen = deals.reduce<string | null>((latest, item) => !item.lastSeenAt ? latest : !latest || item.lastSeenAt > latest ? item.lastSeenAt : latest, null);
  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-bold">Radar de Ofertas</h1><span className={`rounded-full border px-2 py-0.5 text-[11px] ${liveConnected ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>{liveConnected ? 'Ao vivo' : 'Sincronizando'}</span></div><p className="mt-1 text-sm text-[#6B6F7B]">Ofertas da sua conta {marketplaceName} validada.</p><p className="mt-1 text-xs text-[#9CA3AF]">Atualização automática diária às 12h (horário de Brasília). Última consulta: {dateTime(latestSeen)}</p></div><button onClick={() => void refresh()} disabled={refreshing} className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Atualizar</button></div>
    {marketplace === 'mercado_livre' && <div className="rounded-lg border border-blue-600 bg-blue-50 p-3 text-sm font-medium text-blue-900">O catálogo usa a API autenticada do Mercado Livre e é verificado automaticamente. Mudanças são entregues ao app pelo Supabase Realtime; ao preparar uma oferta, o backend gera o link com comissão em segundo plano.</div>}
    {notice && <div className="rounded-lg border border-emerald-600 bg-emerald-50 p-3 text-sm font-medium text-emerald-800">{notice}</div>}{error && <div className="rounded-lg border border-amber-600 bg-amber-50 p-3 text-sm font-medium text-amber-900">{error}</div>}
    <div className="flex flex-wrap gap-3 rounded-xl border border-slate-300 bg-white p-4"><label className="text-sm font-medium text-slate-800">Marketplace <span className="ml-2">{marketplacePicker}</span></label><label className="text-sm font-medium text-slate-800">Categoria<input value={filters.category ?? ''} onChange={e => setFilters({ ...filters, category: e.target.value || undefined })} className="ml-2 w-28 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 placeholder:text-slate-500 focus:border-blue-600 focus:outline-none" /></label><label className="text-sm font-medium text-slate-800">Preço mín.<input type="number" value={filters.minPrice ?? ''} onChange={e => setFilters({ ...filters, minPrice: e.target.value ? Number(e.target.value) : undefined })} className="ml-2 w-20 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none" /></label><label className="text-sm font-medium text-slate-800">Preço máx.<input type="number" value={filters.maxPrice ?? ''} onChange={e => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })} className="ml-2 w-20 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none" /></label><label className="text-sm font-medium text-slate-800">Desconto mín.<input type="number" value={filters.minDiscount ?? ''} onChange={e => setFilters({ ...filters, minDiscount: e.target.value ? Number(e.target.value) : undefined })} className="ml-2 w-20 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none" /></label><label className="text-sm font-medium text-slate-800">Comissão mín.<input type="number" value={filters.minCommission ?? ''} onChange={e => setFilters({ ...filters, minCommission: e.target.value ? Number(e.target.value) : undefined })} className="ml-2 w-20 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none" /></label><label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" checked={filters.freeShipping ?? false} onChange={e => setFilters({ ...filters, freeShipping: e.target.checked })} className="h-4 w-4 accent-blue-700" />Frete grátis</label><label className="flex items-center gap-2 text-sm font-medium text-slate-800"><input type="checkbox" checked={filters.coupon ?? false} onChange={e => setFilters({ ...filters, coupon: e.target.checked })} className="h-4 w-4 accent-blue-700" />Cupom</label><label className="text-sm font-medium text-slate-800">Ordenar<select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value as RadarSort })} className="ml-2 rounded-lg border border-slate-300 bg-white p-2 text-slate-900 focus:border-blue-600 focus:outline-none"><option value="score">Melhor oportunidade</option><option value="discount">Maior desconto</option><option value="commission">Maior comissão</option><option value="sales">Mais vendidos</option><option value="price">Menor preço</option><option value="recent">Mais recentes</option></select></label></div>
    {deals.length === 0 ? <div className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] py-16 text-center"><ShoppingBag className="mx-auto mb-3 text-[#9CA3AF]" /><h2 className="font-semibold">Nenhuma oferta encontrada nesta conta</h2><p className="mt-1 text-sm text-[#6B6F7B]">Você também pode <button onClick={onCreateManual} className="underline">cadastrar um produto manualmente</button>.</p></div> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{deals.map(deal => <article key={deal.id} className="flex flex-col rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5"><div className="flex h-40 items-center justify-center overflow-hidden rounded-lg bg-[#F8FAFC]">{deal.imageUrl ? <img src={deal.imageUrl} alt={deal.title} className="h-full w-full object-cover" /> : <ShoppingBag className="text-[#6B6F7B]" />}</div><div className="mt-4 flex items-start justify-between gap-3"><h2 className="font-semibold leading-snug">{deal.title}</h2><span className="shrink-0 rounded bg-violet-500/15 px-2 py-1 text-xs text-violet-200">Score {deal.dealScore ?? 0}</span></div><p className="mt-2 text-lg font-bold">{money(deal.price)}</p>{deal.originalPrice != null && <p className="text-sm text-[#9CA3AF] line-through">{money(deal.originalPrice)}</p>}<div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6B6F7B]">{deal.discountPercent != null && <span>{deal.discountPercent}% off</span>}{deal.commissionRate != null && <span>Comissão {deal.commissionRate}%</span>}{deal.salesCount != null && <span>{deal.salesCount} vendas</span>}{deal.rating != null && <span>★ {deal.rating}</span>}{deal.coupon && <span>Com cupom</span>}{deal.freeShipping && <span>Frete grátis</span>}</div>{deal.scoreReasons?.length ? <p className="mt-3 text-xs text-[#9CA3AF]">Em alta: {deal.scoreReasons.join(' · ')}</p> : null}<div className="mt-auto flex gap-2 pt-5"><a href={deal.productUrl} target="_blank" rel="noreferrer" className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-[#D4D4D8] py-2 text-sm"><ExternalLink className="h-4 w-4" />Ver oferta</a><button onClick={() => deal.id && void prepare(deal.id)} disabled={preparing === deal.id} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#EDEDED] py-2 text-sm font-medium text-[#111] disabled:opacity-50">{preparing === deal.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{marketplace === 'mercado_livre' ? 'Preparar produto' : 'Preparar promoção'}</button></div></article>)}</div>}
  </div>;
};
