import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  MessageSquareText,
  PackageSearch,
  Plus,
  RotateCcw,
  Save,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";
import type {
  AffiliatePlatform,
  AffiliateAccountSummary,
  ConfigurableAffiliatePlatform,
  ProductSourceType,
} from "../domain/affiliate/types";
import type { CtaGeneration } from "../domain/cta/types";
import type {
  ManualProductInput,
  ProductRecord,
} from "../domain/products/types";
import { reusableSentCtas } from "../domain/products/ReusableProductCtas";
import { ctaApi } from "../services/ctaApi";
import { dispatchApi, dispatchNavigation } from "../services/dispatchApi";
import { productsApi, productsNavigation } from "../services/productsApi";
import { MarketplaceRadarView } from "./MarketplaceRadarView";
import { ProductMediaPanel } from "../components/products/ProductMediaPanel";
import { useApp } from "../context/AppContext";
import { integrationsNavigation } from "../services/whatsappApi";

const marketplaceLabels: Record<string, string> = {
  shopee: "Shopee",
  amazon: "Amazon",
  mercado_livre: "Mercado Livre",
  magalu: "Magalu",
  aliexpress: "AliExpress",
  other: "Outro",
  unsupported: "Não suportado",
  unknown: "Não informado",
};
const originLabels: Record<ProductSourceType, string> = {
  whatsapp: "WhatsApp",
  marketplace_radar: "Radar",
  manual: "Manual",
};
const retryable = new Set(["resolution_failed", "conversion_failed", "awaiting_companion"]);
function canRetryAffiliate(product: Pick<ProductRecord, "affiliateStatus" | "marketplace">): boolean {
  return retryable.has(product.affiliateStatus)
    || (product.affiliateStatus === "invalid_url" && product.marketplace === "mercado_livre");
}
function configurableMarketplace(value: AffiliatePlatform | "unknown"): ConfigurableAffiliatePlatform | null {
  return value === "shopee" || value === "amazon" || value === "mercado_livre" ? value : null;
}
function isAffiliateMarketplaceConfigured(
  accounts: AffiliateAccountSummary[],
  platform: ConfigurableAffiliatePlatform,
): boolean {
  const account = accounts.find((item) => item.platform === platform);
  return Boolean(
    account?.configured
      || account?.configurationStatus === "valid"
      || (platform === "mercado_livre" && account?.sessionConfigured),
  );
}
const emptyForm: ManualProductInput = {
  title: "",
  marketplace: "unknown",
  price: null,
  originalPrice: null,
  couponCode: "",
  couponDescription: "",
  couponLink: "",
  freeShipping: null,
  sourceUrl: "",
  imageUrl: "",
  category: "",
  observations: "",
};
function readShareTarget(): { title: string; url: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const title = (params.get("title") ?? "").trim();
  const directUrl = (params.get("url") ?? "").trim();
  const text = params.get("text") ?? "";
  const url = directUrl || text.match(/https?:\/\/[^\s]+/i)?.[0]?.replace(/[),.;]+$/u, "") || "";
  return url ? { title, url } : null;
}
function marketplaceFromUrl(url: string): ManualProductInput["marketplace"] {
  if (/mercadolivre\.com\.br|meli\.la/i.test(url)) return "mercado_livre";
  if (/shopee\.com\.br/i.test(url)) return "shopee";
  if (/amazon\.com\.br|amzn\.to/i.test(url)) return "amazon";
  return "unknown";
}
function money(value: number | null) {
  return value == null
    ? "—"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function statusText(
  status: ProductRecord["affiliateStatus"],
  marketplace: ProductRecord["marketplace"] = "unknown",
) {
  if (status === "invalid_url" && marketplace === "mercado_livre") {
    return "Link de origem inválido — pronto para validação automática";
  }
  return (
    (
      {
        pending_url: "Sem link do produto",
        pending: "Conversão pendente",
        resolving: "Resolvendo link...",
        resolved: "Link resolvido",
        converting: "Convertendo...",
        awaiting_companion: marketplace === "mercado_livre" ? "Aguardando conversão na nuvem" : "Aguardando extensão AfiliHub",
        converted: "Link afiliado convertido",
        invalid_url: "Link de origem inválido — use a página do produto",
        resolution_failed: "Falha ao resolver link",
        conversion_failed: "Falha ao converter link",
        unsupported_platform: "Marketplace ainda não suportado",
        affiliate_account_not_configured: `${marketplaceLabels[marketplace] ?? "Marketplace"} não configurado`,
      } as Record<string, string>
    )[status] ?? status
  );
}

export const ProductsView: React.FC = () => {
  const { setActiveTab } = useApp();
  const sharedTarget = useMemo(() => readShareTarget(), []);
  const [page, setPage] = useState<"list" | "create">(() =>
    productsNavigation.consume() === "create" || Boolean(readShareTarget()) ? "create" : "list",
  );
  const [section, setSection] = useState<"products" | "radar">("radar");
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [reusableCtas, setReusableCtas] = useState<Map<string, CtaGeneration>>(
    () => new Map(),
  );
  const [origin, setOrigin] = useState<"all" | ProductSourceType>("all");
  const [form, setForm] = useState<ManualProductInput>(() => sharedTarget ? {
    ...emptyForm,
    title: sharedTarget.title,
    sourceUrl: sharedTarget.url,
    marketplace: marketplaceFromUrl(sharedTarget.url),
  } : emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [affiliateAccounts, setAffiliateAccounts] = useState<AffiliateAccountSummary[]>([]);
  const [preparingOriginal, setPreparingOriginal] = useState<string | null>(
    null,
  );
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (!sharedTarget || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    ["title", "text", "url"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [sharedTarget]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [listedProducts, generations, completedItems] = await Promise.all([
        productsApi.list(),
        ctaApi.history(),
        dispatchApi.listQueue("completed"),
      ]);
      setProducts(listedProducts);
      setReusableCtas(reusableSentCtas(generations, completedItems));
      setAffiliateAccounts(await productsApi.listAccounts().catch(() => []));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao carregar produtos.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    let disposed = false;
    let running = false;
    let timer: number | null = null;
    const poll = async () => {
      if (disposed || document.visibilityState === "hidden" || running) return;
      running = true;
      try {
        const latest = await productsApi.list();
        if (!disposed) setProducts(latest);
      } catch {
        // A transient poll failure must not erase the last known phase or
        // replace a useful foreground error from the initial load.
      } finally {
        running = false;
        if (!disposed) timer = window.setTimeout(() => void poll(), 3000);
      }
    };
    const scheduleNow = () => {
      if (disposed || document.visibilityState === "hidden") return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => void poll(), 0);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") scheduleNow();
    };
    window.addEventListener("focus", scheduleNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    timer = window.setTimeout(() => void poll(), 3000);
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("focus", scheduleNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  const visible = useMemo(
    () =>
      origin === "all"
        ? products
        : products.filter((item) => item.sourceType === origin),
    [products, origin],
  );

  async function saveProduct(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await productsApi.createManual(form);
      if (imageFile) await productsApi.uploadMedia(created.id, imageFile);
      setProducts((current) => [created, ...current]);
      setImageFile(null);
      setForm(emptyForm);
      setNotice(
        created.sourceUrl
          ? "Produto salvo. A conversão do link foi iniciada."
          : "Produto salvo sem link.",
      );
      setSection("products");
      setPage("list");
      setTimeout(() => void load(), 2500);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao salvar produto.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function retry(product: ProductRecord) {
    setRetrying(product.id);
    setError(null);
    try {
      await productsApi.retryAffiliate(product.id);
      setNotice("Nova tentativa agendada.");
      setTimeout(() => void load(), 2500);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao reprocessar link.",
      );
    } finally {
      setRetrying(null);
    }
  }
  async function removeProduct(product: ProductRecord) {
    const confirmed = window.confirm(
      `Excluir "${product.title}" de Meus Produtos?\n\nO produto não será mais usado em novas CTAs ou automações. CTAs, itens de fila e envios já registrados continuarão no histórico.`,
    );
    if (!confirmed) return;
    setDeleting(product.id);
    setError(null);
    setNotice(null);
    try {
      await productsApi.delete(product.id);
      setProducts((current) =>
        current.filter((item) => item.id !== product.id),
      );
      setReusableCtas((current) => {
        const next = new Map(current);
        next.delete(product.id);
        return next;
      });
      setNotice(
        "Produto excluído de Meus Produtos. O histórico de envios foi preservado.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Falha ao excluir produto.",
      );
    } finally {
      setDeleting(null);
    }
  }
  async function copy(url: string, id: string) {
    await navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }
  function openCta(productId: string) {
    productsNavigation.openMessageComposer(productId);
    setActiveTab("mensagens");
  }
  function sendSavedCta(productId: string) {
    const generation = reusableCtas.get(productId);
    if (!generation) return;
    dispatchNavigation.openQueueComposer(generation.id);
    setActiveTab("filas");
  }
  async function sendOriginalMessage(productId: string) {
    setPreparingOriginal(productId);
    setError(null);
    setNotice(null);
    try {
      const generation = await ctaApi.originalMessage(productId);
      dispatchNavigation.openQueueComposer(generation.id);
      setActiveTab("filas");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível preparar a mensagem original.",
      );
    } finally {
      setPreparingOriginal(null);
    }
  }
  function openMarketplaceIntegration(platform: ConfigurableAffiliatePlatform) {
    integrationsNavigation.openMarketplace(platform);
    setActiveTab("integracoes");
  }

  if (page === "create")
    return (
      <div className="mx-auto max-w-4xl space-y-6 pb-12">
        <button
          onClick={() => setPage("list")}
          className="flex items-center gap-2 text-sm text-[#6B6F7B] hover:text-[#0F172A]"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para Produtos
        </button>
        <div>
          <h1 className="text-2xl font-bold">Cadastrar produto</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            Cadastro manual. O link, quando informado, passa pela infraestrutura
            afiliada real.
          </p>
        </div>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
        <form
          onSubmit={saveProduct}
          className="space-y-5 rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-6"
        >
          <label className="block text-sm text-[#D4D4D8]">
            Nome do produto *
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm text-[#D4D4D8]">
              Marketplace
              <select
                value={form.marketplace}
                onChange={(e) =>
                  setForm({
                    ...form,
                    marketplace: e.target.value as
                      | AffiliatePlatform
                      | "unknown",
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              >
                <option value="unknown">Não informado</option>
                <option value="shopee">Shopee</option>
                <option value="amazon">Amazon</option>
                <option value="mercado_livre">Mercado Livre</option>
                <option value="magalu">Magalu</option>
                <option value="aliexpress">AliExpress</option>
                <option value="other">Outro</option>
              </select>
            </label>
            <label className="text-sm text-[#D4D4D8]">
              Preço
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.price ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    price: e.target.value ? Number(e.target.value) : null,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              />
            </label>
            <label className="text-sm text-[#D4D4D8]">
              Preço anterior
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.originalPrice ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    originalPrice: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-[#D4D4D8]">
              Cupom
              <input
                value={form.couponCode ?? ""}
                onChange={(e) =>
                  setForm({ ...form, couponCode: e.target.value })
                }
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              />
            </label>
            <label className="text-sm text-[#D4D4D8]">
              Descrição do cupom
              <input
                value={form.couponDescription ?? ""}
                onChange={(e) =>
                  setForm({ ...form, couponDescription: e.target.value })
                }
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm text-[#D4D4D8]">
            Link do cupom
            <input
              type="url"
              value={form.couponLink ?? ""}
              onChange={(e) => setForm({ ...form, couponLink: e.target.value })}
              placeholder="https://..."
              className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
            />
            <span className="mt-1 block text-xs text-[#9CA3AF]">Fato independente do link afiliado do produto.</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-[#D4D4D8]">
            <input
              type="checkbox"
              checked={form.freeShipping === true}
              onChange={(e) =>
                setForm({ ...form, freeShipping: e.target.checked })
              }
            />
            Frete grátis
          </label>
          <label className="block text-sm text-[#D4D4D8]">
            Link do produto
            <input
              type="url"
              value={form.sourceUrl ?? ""}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              placeholder="https://..."
              className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
            />
            <span className="mt-1 block text-xs text-[#9CA3AF]">
              O link original será preservado; ele nunca será usado como link
              afiliado em caso de falha.
            </span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm text-[#D4D4D8]">
              Imagem do produto
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                className="mt-1.5 block w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2 text-xs"
              />
              <span className="mt-1 block text-xs text-[#9CA3AF]">
                Opcional. JPEG, PNG ou WEBP, até 8 MB.
              </span>
            </label>
            <label className="text-sm text-[#D4D4D8]">
              Categoria
              <input
                value={form.category ?? ""}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1.5 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
              />
            </label>
          </div>
          <label className="block text-sm text-[#D4D4D8]">
            Observações
            <textarea
              value={form.observations ?? ""}
              onChange={(e) =>
                setForm({ ...form, observations: e.target.value })
              }
              className="mt-1.5 min-h-24 w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2"
            />
          </label>
          <div className="flex justify-end">
            <button
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar produto
            </button>
          </div>
        </form>
      </div>
    );

  if (section === "radar")
    return (
      <div className="space-y-6 pb-12">
        <div className="flex gap-2 border-b border-[#E8E9ED]">
          <button className="border-b-2 border-white px-4 py-3 text-sm font-medium">
            Radar de Ofertas
          </button>
          <button
            onClick={() => setSection("products")}
            className="px-4 py-3 text-sm text-[#6B6F7B]"
          >
            Meus Produtos
          </button>
        </div>
        <MarketplaceRadarView
          onConfigureMarketplace={openMarketplaceIntegration}
          onCreateManual={() => setPage("create")}
          onPrepared={(product) => {
            setProducts((current) => [
              product,
              ...current.filter((item) => item.id !== product.id),
            ]);
            setOrigin("marketplace_radar");
            setNotice(
              "Produto preparado. Acompanhe a conversão e siga para o CTA quando estiver pronto.",
            );
            setSection("products");
            setTimeout(() => void load(), 2500);
          }}
        />
      </div>
    );

  return (
    <div className="space-y-6 pb-12">
      <div className="flex gap-2 border-b border-[#E8E9ED]">
        <button
          onClick={() => setSection("radar")}
          className="px-4 py-3 text-sm text-[#6B6F7B] hover:text-[#0F172A]"
        >
          Radar de Ofertas
        </button>
        <button className="border-b-2 border-white px-4 py-3 text-sm font-medium">
          Meus Produtos
        </button>
      </div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold">Meus Produtos</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            Produtos do Monitor podem preservar a mensagem original e trocar
            somente os links; itens já enviados também reutilizam a CTA salva.
          </p>
        </div>
        <button
          onClick={() => setPage("create")}
          className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111]"
        >
          <Plus className="h-4 w-4" />
          Cadastrar produto
        </button>
      </div>
      {notice && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-600">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-4">
        <label className="text-sm text-[#6B6F7B]">Origem</label>
        <select
          value={origin}
          onChange={(e) => setOrigin(e.target.value as typeof origin)}
          className="rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2 text-sm"
        >
          <option value="all">Todas</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="marketplace_radar">Radar</option>
          <option value="manual">Manual</option>
        </select>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#6B6F7B]">
          <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
          Carregando produtos...
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] py-16 text-center">
          <ShoppingBag className="mx-auto mb-3 h-8 w-8 text-[#9CA3AF]" />
          <h2 className="font-semibold">Nenhum produto nesta origem</h2>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            Produtos do Radar, WhatsApp e cadastro manual aparecerão aqui.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((product) => (
            <article
              key={product.id}
              className="flex flex-col justify-between rounded-xl border border-[#E8E9ED] bg-[#FFFFFF] p-5"
            >
              <div className="space-y-3">
                <ProductMediaPanel product={product} />
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded bg-[#F4F4F6] px-2 py-1">
                    {originLabels[product.sourceType]}
                  </span>
                  <span className="rounded bg-[#F4F4F6] px-2 py-1">
                    {marketplaceLabels[product.marketplace]}
                  </span>
                  {reusableCtas.has(product.id) && (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-emerald-600">
                      <Check className="h-3 w-3" />
                      CTA validada e enviada
                    </span>
                  )}
                </div>
                <h2 className="font-semibold leading-snug">{product.title}</h2>
                <div>
                  <span className="text-lg font-bold">
                    {money(product.price)}
                  </span>
                  {product.originalPrice != null && (
                    <span className="ml-2 text-sm text-[#9CA3AF] line-through">
                      {money(product.originalPrice)}
                    </span>
                  )}
                </div>
                {product.couponCode && (
                  <span className="inline-flex items-center gap-1 text-xs text-[#6B6F7B]">
                    <Tag className="h-3.5 w-3.5" />
                    Cupom {product.couponCode}
                  </span>
                )}
              </div>
              <div className="mt-5 space-y-3 border-t border-[#E8E9ED] pt-4">
                <div
                      className={`text-xs ${product.affiliateStatus === "converted" ? "text-emerald-700" : canRetryAffiliate(product) || product.affiliateStatus === "invalid_url" ? "text-red-700" : "text-amber-700"}`}
                >
                  {statusText(product.affiliateStatus, product.marketplace)}
                </div>
                {product.affiliateStatus === "converted" &&
                  product.affiliateUrl && (
                    <>
                      {product.sourceType === "whatsapp" && (
                        <button
                          disabled={preparingOriginal === product.id}
                          onClick={() => void sendOriginalMessage(product.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EDEDED] py-2 text-sm font-medium text-[#111] disabled:opacity-50"
                        >
                          {preparingOriginal === product.id ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageSquareText className="h-4 w-4" />
                          )}
                          Usar mensagem original na fila
                        </button>
                      )}
                      {reusableCtas.has(product.id) && (
                        <button
                          onClick={() => sendSavedCta(product.id)}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4D4D8] py-2 text-sm font-medium"
                        >
                          <Send className="h-4 w-4" />
                          Enviar CTA salva para fila
                        </button>
                      )}
                      <button
                        onClick={() => openCta(product.id)}
                        className={`flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium ${reusableCtas.has(product.id) ? "border border-[#D4D4D8]" : "bg-[#EDEDED] text-[#111]"}`}
                      >
                        <Sparkles className="h-4 w-4" />
                        {reusableCtas.has(product.id)
                          ? "Criar nova mensagem"
                          : "Criar mensagem"}
                      </button>
                      <button
                        onClick={() =>
                          void copy(product.affiliateUrl!, product.id)
                        }
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4D4D8] py-2 text-sm"
                      >
                        {copied === product.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        {copied === product.id
                          ? "Copiado"
                          : "Copiar link afiliado"}
                      </button>
                    </>
                  )}
                {canRetryAffiliate(product) && (
                  <button
                    disabled={retrying === product.id}
                    onClick={() => void retry(product)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4D4D8] py-2 text-sm"
                  >
                    <RotateCcw
                      className={`h-4 w-4 ${retrying === product.id ? "animate-spin" : ""}`}
                    />
                    {product.affiliateStatus === "invalid_url" ? "Validar e converter" : "Tentar novamente"}
                  </button>
                )}
                {product.affiliateStatus === "affiliate_account_not_configured" && (() => {
                  const platform = configurableMarketplace(product.marketplace);
                  const configured = platform
                    ? isAffiliateMarketplaceConfigured(affiliateAccounts, platform)
                    : false;
                  if (configured) {
                    return (
                      <button
                        disabled={retrying === product.id}
                        onClick={() => void retry(product)}
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        <RotateCcw className={`h-4 w-4 ${retrying === product.id ? "animate-spin" : ""}`} />
                        Tentar novamente
                      </button>
                    );
                  }
                  return platform ? (
                    <button
                      onClick={() => openMarketplaceIntegration(platform)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                    >
                      <Settings className="h-4 w-4" />
                      Configurar {marketplaceLabels[platform]}
                    </button>
                  ) : null;
                })()}
                {(product.affiliateStatus === "converted" ? product.affiliateUrl : product.sourceUrl) && (
                  <a
                    href={(product.affiliateStatus === "converted" ? product.affiliateUrl : product.sourceUrl)!}
                    target="_blank"
                    rel="noreferrer"
                    title={product.affiliateStatus === "converted" ? "Link de afiliado AfiliHub" : "Link de origem aguardando conversão"}
                    className={`flex min-w-0 items-center gap-1.5 text-xs hover:underline ${product.affiliateStatus === "converted" ? "text-emerald-700" : "text-slate-600"}`}
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="shrink-0 font-medium">{product.affiliateStatus === "converted" ? "Link AfiliHub:" : "Origem:"}</span>
                    <span className="truncate">{product.affiliateStatus === "converted" ? product.affiliateUrl : product.sourceUrl}</span>
                  </a>
                )}
                <button
                  disabled={deleting === product.id}
                  onClick={() => void removeProduct(product)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-900/60 py-2 text-sm text-red-300 hover:bg-red-950/20 disabled:opacity-50"
                >
                  {deleting === product.id ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  {deleting === product.id ? "Excluindo…" : "Excluir produto"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};
