import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Info,
  RefreshCw,
} from "lucide-react";
import {
  getAnalyticsOverview,
  type AnalyticsFilters,
  type AnalyticsResponse,
} from "../services/analyticsApi";
import type {
  AnalyticsBreakdownRow,
  AnalyticsMetric,
  AnalyticsPeriodPreset,
} from "../domain/analytics/types";

const periods: Array<{ value: AnalyticsPeriodPreset; label: string }> = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "custom", label: "Personalizado" },
];
const marketplaceNames: Record<string, string> = {
  shopee: "Shopee",
  mercado_livre: "Mercado Livre",
  amazon: "Amazon",
  unknown: "Não identificado",
};
const modeNames: Record<string, string> = {
  monitor_passthrough: "Mensagem original do Monitor",
  cta_template: "CTA + Template",
  manual: "Manual",
};

function integer(value: number | null | undefined) {
  return value == null ? "Indisponível" : value.toLocaleString("pt-BR");
}
function percent(value: number | null | undefined) {
  return value == null ? "Indisponível" : `${(value * 100).toFixed(1).replace(".", ",")}%`;
}
function currency(value: number | null | undefined) {
  return value == null
    ? "Indisponível"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateTime(value: string | null, timezone?: string) {
  if (!value) return "Indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

function EmptyState({ unsupported = false }: { unsupported?: boolean }) {
  return (
    <div className="rounded-lg border border-dashed border-[#D4D4D8] p-6 text-center text-sm text-[#6B6F7B]">
      {unsupported
        ? "Esta fonte ainda não disponibiliza esta métrica."
        : "Ainda não há dados suficientes neste período."}
    </div>
  );
}

function MetricCard({
  label,
  metric,
  format = integer,
  suffix,
}: {
  label: string;
  metric: AnalyticsMetric | undefined;
  format?: (value: number | null | undefined) => string;
  suffix?: string;
}) {
  const unavailable = metric && !metric.available;
  return (
    <div className={`rounded-xl border bg-[#FFFFFF] p-5 ${unavailable ? "border-dashed border-[#D4D4D8]" : "border-[#E8E9ED]"}`}>
      <div className="flex items-center gap-1.5 text-sm text-[#6B6F7B]">
        <span>{label}</span>
        {metric && (
          <span title={`${metric.definition}${metric.unavailableReason ? ` ${metric.unavailableReason}` : ""}`}>
            <Info className="h-3.5 w-3.5" aria-label={`Definição de ${label}`} />
          </span>
        )}
      </div>
      <p className={`mt-3 text-2xl font-semibold ${unavailable ? "text-[#9CA3AF]" : ""}`}>
        {metric ? format(metric.value) : "…"}
      </p>
      {suffix && metric?.available && <p className="mt-1 text-xs text-[#6B6F7B]">{suffix}</p>}
      {unavailable && <p className="mt-2 text-xs text-[#9CA3AF]">{metric.unavailableReason}</p>}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: React.PropsWithChildren<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="space-y-1 text-xs text-[#6B6F7B]">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="block w-full min-w-40 rounded-lg border border-[#E8E9ED] bg-[#FFFFFF] px-3 py-2 text-sm text-[#0F172A]"
      >
        {children}
      </select>
    </label>
  );
}

function BreakdownTable({
  rows,
  firstColumn,
  showMarketplace = false,
  showCaptured = false,
  showPrepared = false,
}: {
  rows: AnalyticsBreakdownRow[];
  firstColumn: string;
  showMarketplace?: boolean;
  showCaptured?: boolean;
  showPrepared?: boolean;
}) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-[#E8E9ED] text-xs text-[#6B6F7B]">
          <tr>
            <th className="px-3 py-3 font-medium">{firstColumn}</th>
            {showMarketplace && <th className="px-3 py-3 font-medium">Marketplace</th>}
            {showCaptured && <th className="px-3 py-3 text-right font-medium">Capturadas</th>}
            {showPrepared && <th className="px-3 py-3 text-right font-medium">Preparadas</th>}
            <th className="px-3 py-3 text-right font-medium">Enviadas</th>
            {rows.some((row) => row.delivered != null) && <th className="px-3 py-3 text-right font-medium">Entregues</th>}
            {rows.some((row) => row.read != null) && <th className="px-3 py-3 text-right font-medium">Lidas</th>}
            <th className="px-3 py-3 text-right font-medium">Falhas</th>
            {rows.some((row) => row.groups !== undefined) && <th className="px-3 py-3 text-right font-medium">Grupos</th>}
            {rows.some((row) => row.products !== undefined) && <th className="px-3 py-3 text-right font-medium">Produtos</th>}
            {rows.some((row) => row.linksGenerated !== undefined) && <th className="px-3 py-3 text-right font-medium">Links</th>}
            <th className="px-3 py-3 text-right font-medium">Cliques</th>
            <th className="px-3 py-3 text-right font-medium">Pedidos</th>
            <th className="px-3 py-3 text-right font-medium">Comissão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E8E9ED]">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-3 font-medium">{row.name}</td>
              {showMarketplace && <td className="px-3 py-3">{marketplaceNames[row.marketplace ?? ""] ?? row.marketplace}</td>}
              {showCaptured && <td className="px-3 py-3 text-right">{integer(row.captured)}</td>}
              {showPrepared && <td className="px-3 py-3 text-right">{integer(row.prepared)}</td>}
              <td className="px-3 py-3 text-right">{integer(row.sent)}</td>
              {rows.some((item) => item.delivered != null) && <td className="px-3 py-3 text-right">{integer(row.delivered)}</td>}
              {rows.some((item) => item.read != null) && <td className="px-3 py-3 text-right">{integer(row.read)}</td>}
              <td className="px-3 py-3 text-right">{integer(row.failed)}</td>
              {rows.some((item) => item.groups !== undefined) && <td className="px-3 py-3 text-right">{row.groups === undefined ? "—" : integer(row.groups)}</td>}
              {rows.some((item) => item.products !== undefined) && <td className="px-3 py-3 text-right">{row.products === undefined ? "—" : integer(row.products)}</td>}
              {rows.some((item) => item.linksGenerated !== undefined) && <td className="px-3 py-3 text-right">{row.linksGenerated === undefined ? "—" : integer(row.linksGenerated)}</td>}
              <td className="px-3 py-3 text-right text-[#9CA3AF]">{integer(row.clicks)}</td>
              <td className="px-3 py-3 text-right text-[#9CA3AF]">{integer(row.orders)}</td>
              <td className={`px-3 py-3 text-right ${row.confirmedCommission == null && row.estimatedCommission == null ? "text-[#9CA3AF]" : ""}`}>{currency(row.confirmedCommission ?? row.estimatedCommission)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimeSeries({ data }: { data: AnalyticsResponse }) {
  const [metric, setMetric] = useState<"captured" | "promotions" | "prepared" | "sent" | "delivered" | "read" | "failed">("sent");
  const labels = {
    captured: "Mensagens capturadas",
    promotions: "Promoções detectadas",
    prepared: "Mensagens preparadas",
    sent: "Mensagens enviadas",
    delivered: "Mensagens entregues",
    read: "Mensagens lidas",
    failed: "Falhas terminais",
  };
  const enabledMetrics = Object.entries(labels).filter(([value]) =>
    value !== "delivered" && value !== "read" || data.capabilities.whatsapp[value as "delivered" | "read"]);
  const max = Math.max(1, ...data.series.map((point) => point[metric] ?? 0));
  return (
    <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">WhatsApp ao longo do tempo</h2>
          <p className="mt-1 text-xs text-[#6B6F7B]">Agrupado em {data.period.timezone}.</p>
        </div>
        <select value={metric} onChange={(event) => setMetric(event.target.value as typeof metric)} className="rounded-lg border border-[#E8E9ED] bg-white px-3 py-2 text-sm">
          {enabledMetrics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {!data.series.some((point) => (point[metric] ?? 0) > 0) ? <EmptyState /> : (
        <div className="flex h-48 items-end gap-1 overflow-x-auto border-b border-[#E8E9ED] px-1 pt-4" aria-label={`Série temporal: ${labels[metric]}`}>
          {data.series.map((point) => (
            <div key={point.date} className="group flex h-full min-w-3 flex-1 items-end" title={`${new Date(`${point.date}T12:00:00Z`).toLocaleDateString("pt-BR")}: ${point[metric]}`}>
              <div className="w-full rounded-t bg-[#FB5A1E]/75 transition-colors group-hover:bg-[#FB5A1E]" style={{ height: `${Math.max(point[metric] ? 5 : 0, (point[metric] ?? 0) / max * 100)}%` }} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

type AnalyticsTab = "overview" | "whatsapp" | "marketplaces" | "groups" | "products" | "automations";

export const AnalyticsView: React.FC = () => {
  const [filters, setFilters] = useState<AnalyticsFilters>({ preset: "30d" });
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<AnalyticsTab>("overview");

  const queryReady = filters.preset !== "custom" || Boolean(filters.from && filters.to);
  async function load() {
    if (!queryReady) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getAnalyticsOverview(filters));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [filters]);

  const options = data?.filterOptions;
  const visibleGroups = useMemo(() =>
    options?.groups.filter((group) => !filters.connectionId || group.connectionId === filters.connectionId) ?? [],
  [options, filters.connectionId]);
  const visibleProducts = useMemo(() =>
    options?.products.filter((product) => !filters.marketplace || product.marketplace === filters.marketplace) ?? [],
  [options, filters.marketplace]);
  const updateFilter = (key: keyof AnalyticsFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value || undefined }));
  };

  const tabs: Array<{ id: AnalyticsTab; label: string }> = [
    { id: "overview", label: "Visão geral" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "marketplaces", label: "Marketplaces" },
    { id: "groups", label: "Grupos" },
    { id: "products", label: "Produtos" },
    { id: "automations", label: "Automações" },
  ];

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">Dados operacionais reais; desconhecido nunca é tratado como zero.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || !queryReady} className="flex items-center gap-2 rounded-lg border border-[#D4D4D8] px-3 py-2 text-sm text-[#6B6F7B] hover:text-[#0F172A] disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      <section className="space-y-4 rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5">
        <div className="flex flex-wrap gap-2">
          {periods.map((period) => (
            <button key={period.value} type="button" onClick={() => setFilters((current) => ({ ...current, preset: period.value }))} className={`rounded-lg px-3 py-2 text-sm ${filters.preset === period.value ? "bg-[#FB5A1E] text-white" : "border border-[#E8E9ED] text-[#6B6F7B]"}`}>
              {period.label}
            </button>
          ))}
        </div>
        {filters.preset === "custom" && (
          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-[#6B6F7B]">De<input type="date" value={filters.from ?? ""} onChange={(event) => updateFilter("from", event.target.value)} className="ml-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm" /></label>
            <label className="text-xs text-[#6B6F7B]">Até<input type="date" value={filters.to ?? ""} onChange={(event) => updateFilter("to", event.target.value)} className="ml-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm" /></label>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="Marketplace" value={filters.marketplace ?? ""} onChange={(value) => updateFilter("marketplace", value)}><option value="">Todos</option>{options?.marketplaces.map((item) => <option key={item} value={item}>{marketplaceNames[item] ?? item}</option>)}</FilterSelect>
          <FilterSelect label="Conexão WhatsApp" value={filters.connectionId ?? ""} onChange={(value) => { updateFilter("connectionId", value); if (filters.groupId && !options?.groups.some((group) => group.id === filters.groupId && (!value || group.connectionId === value))) updateFilter("groupId", ""); }}><option value="">Todas</option>{options?.connections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
          <FilterSelect label="Grupo" value={filters.groupId ?? ""} onChange={(value) => updateFilter("groupId", value)}><option value="">Todos</option>{visibleGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
          <FilterSelect label="Automação" value={filters.automationId ?? ""} onChange={(value) => updateFilter("automationId", value)}><option value="">Todas</option>{options?.automations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
          <FilterSelect label="Produto" value={filters.productId ?? ""} onChange={(value) => updateFilter("productId", value)}><option value="">Todos</option>{visibleProducts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
          <FilterSelect label="Template" value={filters.templateId ?? ""} onChange={(value) => updateFilter("templateId", value)}><option value="">Todos</option>{options?.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</FilterSelect>
          <FilterSelect label="Modo de geração" value={filters.generationMode ?? ""} onChange={(value) => updateFilter("generationMode", value)}><option value="">Todos</option>{options?.generationModes.map((item) => <option key={item} value={item}>{modeNames[item]}</option>)}</FilterSelect>
        </div>
        {data && <p className="text-xs text-[#9CA3AF]">Período: {dateTime(data.period.from, data.period.timezone)} a {dateTime(data.period.to, data.period.timezone)} · timezone {data.period.timezone}</p>}
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600"><AlertCircle className="mr-2 inline h-4 w-4" />{error}</div>}

      <nav className="flex gap-1 overflow-x-auto border-b border-[#E8E9ED]">
        {tabs.map((item) => <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm ${tab === item.id ? "border-[#FB5A1E] font-medium text-[#0F172A]" : "border-transparent text-[#6B6F7B]"}`}>{item.label}</button>)}
      </nav>

      {(tab === "overview" || tab === "whatsapp") && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Mensagens capturadas" metric={data?.overview.captured} />
            <MetricCard label="Promoções detectadas" metric={data?.overview.promotions} />
            <MetricCard label="Mensagens preparadas" metric={data?.overview.prepared} />
            <MetricCard label="Mensagens enviadas" metric={data?.overview.sent} />
            <MetricCard label="Falhas" metric={data?.overview.failed} />
            <MetricCard label="Taxa de sucesso" metric={data?.overview.successRate} format={percent} />
            <MetricCard label="Mensagens entregues" metric={data?.overview.delivered} />
            <MetricCard label="Mensagens lidas" metric={data?.overview.read} />
            <MetricCard label="Grupos impactados" metric={data?.overview.activeGroups} />
            <MetricCard label="Produtos divulgados" metric={data?.overview.productsAdvertised} />
            <MetricCard label="Links afiliados gerados" metric={data?.overview.linksGenerated} />
            <MetricCard label="Cliques" metric={data?.overview.clicks} />
            <MetricCard label="Pedidos" metric={data?.overview.orders} />
            <MetricCard label="Valor vendido" metric={data?.overview.salesValue} format={currency} />
            <MetricCard label="Comissão estimada" metric={data?.overview.estimatedCommission} format={currency} suffix="Estimativa" />
            <MetricCard label="Comissão confirmada" metric={data?.overview.confirmedCommission} format={currency} suffix="Confirmada" />
          </div>
          {data && (
            <section className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-6">
              <h2 className="font-medium">Funil operacional</h2>
              <p className="mt-1 text-xs text-[#6B6F7B]">Etapas sem capability comprovada são mostradas como indisponíveis.</p>
              <div className="mt-5 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  ["Capturadas", data.overview.captured], ["Promoções", data.overview.promotions],
                  ["Preparadas", data.overview.prepared], ["Enviadas", data.overview.sent],
                  ["Entregues", data.overview.delivered], ["Lidas", data.overview.read],
                ].map(([label, metric]) => {
                  const value = metric as AnalyticsMetric;
                  return <div key={label as string} className="rounded-lg bg-[#F7F7F8] p-4"><p className="text-xs text-[#6B6F7B]">{label as string}</p><p className="mt-2 text-xl font-semibold">{integer(value.value)}</p></div>;
                })}
              </div>
            </section>
          )}
          {data && <TimeSeries data={data} />}
          {tab === "whatsapp" && data && (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Por conexão</h2><BreakdownTable rows={data.connections} firstColumn="Conexão" /></section>
                <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Automático vs manual</h2><BreakdownTable rows={data.generationModes} firstColumn="Modo" showPrepared /></section>
              </div>
              <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Por grupo</h2><BreakdownTable rows={data.groups} firstColumn="Grupo" /></section>
            </>
          )}
        </>
      )}

      {(tab === "overview" || tab === "marketplaces") && data && (
        <section className="space-y-5 rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-6">
          <div><h2 className="flex items-center gap-2 font-medium"><BarChart3 className="h-4 w-4" />Marketplaces</h2><p className="mt-1 text-xs text-[#6B6F7B]">Comparação restrita às capabilities comprovadas.</p></div>
          <div className="grid gap-4 lg:grid-cols-3">
            {data.marketplaces.map((item) => (
              <article key={item.id} className="rounded-xl border border-[#E8E9ED] p-5">
                <div className="flex items-center justify-between"><h3 className="font-semibold">{marketplaceNames[item.marketplace ?? ""] ?? item.name}</h3>{item.syncStatus === "SYNCED" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Clock3 className="h-4 w-4 text-[#9CA3AF]" />}</div>
                <dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><dt>Links gerados</dt><dd>{integer(item.linksGenerated)}</dd></div><div className="flex justify-between"><dt>Mensagens enviadas</dt><dd>{integer(item.sent)}</dd></div><div className="flex justify-between"><dt>Pedidos</dt><dd className={item.capabilities.orders ? "" : "text-[#9CA3AF]"}>{item.capabilities.orders ? integer(item.orders) : "Indisponível"}</dd></div><div className="flex justify-between"><dt>Valor vendido</dt><dd className={item.capabilities.salesValue ? "" : "text-[#9CA3AF]"}>{item.capabilities.salesValue ? currency(item.salesValue) : "Indisponível"}</dd></div><div className="flex justify-between"><dt>Comissão estimada</dt><dd className={item.capabilities.commissionEstimated ? "" : "text-[#9CA3AF]"}>{item.capabilities.commissionEstimated ? currency(item.estimatedCommission) : "Indisponível"}</dd></div><div className="flex justify-between"><dt>Comissão confirmada</dt><dd className="text-[#9CA3AF]">Indisponível</dd></div></dl>
                <p className="mt-4 border-t border-[#E8E9ED] pt-3 text-xs text-[#6B6F7B]">Sync: {item.syncStatus} · {dateTime(item.lastSyncAt, data.period.timezone)}</p>
              </article>
            ))}
          </div>
          {tab === "marketplaces" && <BreakdownTable rows={data.marketplaces} firstColumn="Marketplace" />}
        </section>
      )}

      {(tab === "overview" || tab === "groups") && data && <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Desempenho por grupo</h2><BreakdownTable rows={data.groups} firstColumn="Grupo" /></section>}
      {(tab === "overview" || tab === "products") && data && <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Produtos</h2><BreakdownTable rows={data.products} firstColumn="Produto" showMarketplace /></section>}
      {(tab === "overview" || tab === "automations") && data && (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Automações</h2><BreakdownTable rows={data.automations} firstColumn="Automação" showCaptured showPrepared /></section>
          <section className="rounded-xl border border-[#E8E9ED] bg-white p-6"><h2 className="mb-4 font-medium">Templates versionados</h2><BreakdownTable rows={data.templates} firstColumn="Template" showPrepared /></section>
        </div>
      )}

      {tab === "marketplaces" && data && (
        <section className="space-y-4 rounded-xl border border-[#E8E9ED] bg-white p-6">
          <h2 className="font-medium">Últimas vendas</h2>
          {!data.sales.length ? <EmptyState unsupported={!Object.values(data.capabilities.marketplaces).some((capability) => capability.lastSales)} /> : (
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-[#E8E9ED] text-xs text-[#6B6F7B]"><tr><th className="px-3 py-3 font-medium">Produto</th><th className="px-3 py-3 font-medium">Marketplace</th><th className="px-3 py-3 font-medium">Data</th><th className="px-3 py-3 text-right font-medium">Valor</th><th className="px-3 py-3 text-right font-medium">Comissão estimada</th><th className="px-3 py-3 text-right font-medium">Confirmada</th><th className="px-3 py-3 font-medium">Status</th></tr></thead><tbody className="divide-y divide-[#E8E9ED]">{data.sales.map((sale) => <tr key={sale.id}><td className="px-3 py-3 font-medium">{sale.product}</td><td className="px-3 py-3">{marketplaceNames[sale.marketplace] ?? sale.marketplace}</td><td className="px-3 py-3">{dateTime(sale.purchasedAt, data.period.timezone)}</td><td className="px-3 py-3 text-right">{currency(sale.salesValue)}</td><td className="px-3 py-3 text-right">{currency(sale.estimatedCommission)}</td><td className="px-3 py-3 text-right text-[#9CA3AF]">{currency(sale.confirmedCommission)}</td><td className="px-3 py-3">{{ PENDING: "Pendente", CONFIRMED: "Confirmada", CANCELLED: "Cancelada", REFUNDED: "Reembolsada" }[sale.status]}</td></tr>)}</tbody></table></div>
          )}
          <p className="text-xs text-[#6B6F7B]">Vendas e comissão estimada vêm do relatório oficial do marketplace. Comissão confirmada permanece separada e indisponível até a sincronização do relatório de validação.</p>
        </section>
      )}
    </div>
  );
};
