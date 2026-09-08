import React, { useEffect, useState } from "react";
import {
  Check,
  ImageIcon,
  ListPlus,
  Package,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import type { CtaGeneration, CtaTemplate } from "../domain/cta/types";
import type { DispatchWatermarkSettings } from "../domain/dispatch/types";
import type { ProductPresentationContext } from "../domain/media/types";
import type { ProductRecord } from "../domain/products/types";
import { useApp } from "../context/AppContext";
import { ctaApi, type CtaProductAiGenerationUsage } from "../services/ctaApi";
import { dispatchNavigation } from "../services/dispatchApi";
import { productsApi, productsNavigation } from "../services/productsApi";

const panel = "rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]";
const marketplaceLabels: Record<string, string> = {
  shopee: "Shopee",
  amazon: "Amazon",
  mercado_livre: "Mercado Livre",
  magalu: "Magalu",
  aliexpress: "AliExpress",
  other: "Outro",
  unsupported: "Não suportado",
  unknown: "Marketplace",
};
const money = (value: number | null) =>
  value == null
    ? "Preço não informado"
    : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const MessagesView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [requestedProductId] = useState(() =>
    productsNavigation.consumeMessageComposer(),
  );
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [templates, setTemplates] = useState<CtaTemplate[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [productId, setProductId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [generations, setGenerations] = useState<CtaGeneration[]>([]);
  const [selected, setSelected] = useState(0);
  const [editedText, setEditedText] = useState("");
  const [learnCta, setLearnCta] = useState("");
  const [edited, setEdited] = useState(false);
  const [media, setMedia] = useState<ProductPresentationContext | null>(null);
  const [productAiUsage, setProductAiUsage] =
    useState<CtaProductAiGenerationUsage | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [captionMode, setCaptionMode] = useState<
    "message" | "fixed" | "custom"
  >("message");
  const [customCaption, setCustomCaption] = useState("");
  const [watermark, setWatermark] = useState<DispatchWatermarkSettings>({
    enabled: false,
    text: "",
    position: "bottom-right",
    opacity: 0.72,
  });

  const current = generations[selected];
  const selectedTemplate = templates.find(
    (template) => template.id === templateId,
  );
  useEffect(() => {
    void productsApi
      .list()
      .then((nextProducts) => {
        setProducts(nextProducts);
        setProductId(
          nextProducts.some((item) => item.id === requestedProductId)
            ? requestedProductId!
            : (nextProducts[0]?.id ?? ""),
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Falha ao carregar produtos.",
        ),
      )
      .finally(() => setProductsLoading(false));
    void ctaApi
      .templates()
      .then((nextTemplates) => {
        setTemplates(nextTemplates);
        setTemplateId(
          nextTemplates.find((item) => item.isDefault)?.id ??
            nextTemplates[0]?.id ??
            "",
        );
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : "Falha ao carregar templates.",
        ),
      )
      .finally(() => setTemplatesLoading(false));
  }, [requestedProductId]);
  useEffect(() => {
    if (!productId) {
      setMedia(null);
      return;
    }
    void productsApi
      .media(productId)
      .then(setMedia)
      .catch(() => setMedia(null));
  }, [productId]);
  async function refreshProductAiUsage(id = productId) {
    if (!id) {
      setProductAiUsage(undefined);
      return;
    }
    const usage = await ctaApi.productAiGenerationUsage(id);
    if (id === productId) setProductAiUsage(usage);
  }
  useEffect(() => {
    let active = true;
    if (!productId) {
      setProductAiUsage(undefined);
      return () => { active = false; };
    }
    setProductAiUsage(undefined);
    void ctaApi.productAiGenerationUsage(productId)
      .then((usage) => { if (active) setProductAiUsage(usage); })
      .catch(() => { if (active) setProductAiUsage(null); });
    return () => { active = false; };
  }, [productId]);
  useEffect(() => {
    setEditedText(current?.finalText ?? "");
    setLearnCta(current?.ctaText ?? "");
    setEdited(false);
  }, [current?.id]);
  useEffect(() => {
    if (!selectedTemplate) return;
    setCaptionMode(
      selectedTemplate.presentation.defaultCaption.trim() ? "fixed" : "message",
    );
    setCustomCaption("");
    setWatermark({ ...selectedTemplate.presentation.watermark });
  }, [templateId, selectedTemplate?.version]);

  async function act(label: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setBusyLabel(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir a ação.",
      );
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  }

  async function generate(count: 1 | 3) {
    if (!productId || !templateId) return;
    await act(count === 3 ? "Gerando 3 CTAs" : "Gerando mensagem", async () => {
      const values = await ctaApi.generate(productId, { count, templateId });
      setGenerations(values);
      setSelected(0);
      await refreshProductAiUsage(productId);
      if (count === 3 && values.length < 3)
        setNotice(
          `${values.length} ângulos distintos passaram pela validação.`,
        );
    });
  }

  async function regenerateCta() {
    if (!current) return;
    await act("Gerando outro CTA", async () => {
      const value = await ctaApi.regenerateCta(
        current.id,
        "Use outro ângulo e evite padrões recentes",
      );
      setGenerations((items) => [value, ...items]);
      setSelected(0);
      await refreshProductAiUsage(current.productId);
      setNotice(
        "Somente o CTA mudou; fatos, links, ordem e template vieram do snapshot anterior.",
      );
    });
  }

  async function saveEdit() {
    if (!current) return;
    await act("Salvando edição", async () => {
      const value = await ctaApi.edit(current.id, editedText);
      if (!value) throw new Error("A geração não foi encontrada.");
      setGenerations((items) =>
        items.map((item) => (item.id === value.id ? value : item)),
      );
      setEdited(true);
      setNotice(
        "Mensagem editada e validada. O Treinador não aprendeu automaticamente.",
      );
    });
  }

  async function learnFromEdit() {
    if (!current || !learnCta.trim()) return;
    await act("Ensinando o Treinador", async () => {
      await ctaApi.learnFromEdit(current.id, learnCta);
      setNotice("Alteração de CTA enviada explicitamente ao Treinador.");
    });
  }

  function addQueue() {
    if (!current?.publishable || current.status !== "valid") return;
    dispatchNavigation.openQueueComposer(current.id, {
      captionMode,
      caption: captionMode === "custom" ? customCaption : undefined,
      watermark,
    });
    setActiveTab("filas");
  }

  const images = [
    media?.primaryImage,
    ...(media?.alternativeImages ?? []),
  ].filter(Boolean) as NonNullable<
    ProductPresentationContext["primaryImage"]
  >[];
  const usesCustomPhoto =
    media?.primaryImage?.selectionStatus === "manual_selected";
  const visibleProducts = products.filter((product) =>
    `${product.title} ${marketplaceLabels[product.marketplace] ?? ""}`
      .toLocaleLowerCase("pt-BR")
      .includes(productSearch.trim().toLocaleLowerCase("pt-BR")),
  );
  return (
    <div className="space-y-5 pb-12">
      <header>
        <p className="text-xs font-medium uppercase tracking-[.2em] text-[#9CA3AF]">
          Criação
        </p>
        <h1 className="mt-1 text-2xl font-bold">Mensagens</h1>
        <p className="mt-1 text-sm text-[#6B6F7B]">
          Combine Product + CTA do Treinador + Template escolhido e prepare o
          snapshot para a fila.
        </p>
      </header>
      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/20 p-3 text-sm text-emerald-600">
          {notice}
        </div>
      )}

      <section className={`${panel} p-4`}>
        <div className="space-y-4">
          <div>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                  Produto
                </p>
                <p className="mt-1 text-xs text-[#6B6F7B]">
                  Escolha visualmente qual oferta será usada na mensagem.
                </p>
              </div>
              <label className="relative block sm:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  aria-label="Buscar produto"
                  placeholder="Buscar produto"
                  className="w-full rounded-lg border border-[#D4D4D8] bg-[#F8FAFC] py-2 pl-9 pr-3 text-sm outline-none focus:border-[#9CA3AF]"
                />
              </label>
            </div>
            <div
              role="listbox"
              aria-label="Produtos disponíveis"
              className="mt-3 grid max-h-80 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3"
            >
              {visibleProducts.map((product) => {
                const active = product.id === productId;
                return (
                  <button
                    key={product.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      setProductId(product.id);
                      setGenerations([]);
                    }}
                    className={`group flex min-h-24 items-center gap-3 rounded-xl border p-3 text-left transition ${active ? "border-emerald-500/70 bg-emerald-500/10" : "border-[#E8E9ED] bg-[#F8FAFC] hover:border-[#6B6F7B]"}`}
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#F4F4F6]">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-6 w-6 text-[#6B6F7B]" />
                      )}
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className="line-clamp-2 text-sm font-medium leading-snug">
                          {product.title}
                        </span>
                        {active && (
                          <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                        )}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-[#D4D4D8]">
                        {money(product.price)}
                      </span>
                      <span className="mt-1 block truncate text-[10px] text-[#9CA3AF]">
                        {marketplaceLabels[product.marketplace] ?? "Marketplace"}
                        {product.affiliateStatus === "converted"
                          ? " · link afiliado pronto"
                          : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
              {productsLoading ? (
                <div className="col-span-full rounded-xl border border-dashed border-[#E8E9ED] p-8 text-center text-xs text-[#9CA3AF]">
                  Carregando produtos •••
                </div>
              ) : !visibleProducts.length && (
                <div className="col-span-full rounded-xl border border-dashed border-[#E8E9ED] p-8 text-center text-xs text-[#9CA3AF]">
                  Nenhum produto encontrado.
                </div>
              )}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
            Template
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="mt-1 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-sm"
            >
              <option value="">
                {templatesLoading ? "Carregando templates •••" : "Selecione"}
              </option>
              {templates
                .filter((template) => template.active)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.isDefault ? " — padrão" : ""}
                  </option>
                ))}
            </select>
            <span className="mt-1 block normal-case tracking-normal text-[#6B6F7B]">
              Esta escolha vale só para esta mensagem.
            </span>
          </label>
          <div className="flex flex-wrap gap-2">
          <button
            disabled={!productId || !templateId || busy}
            onClick={() => void generate(1)}
            className="rounded bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111] disabled:opacity-40"
          >
            <Sparkles className="mr-1 inline h-4 w-4" />
            {busyLabel === "Gerando mensagem"
              ? "Gerando mensagem •••"
              : "Gerar mensagem"}
          </button>
          <button
            disabled={!productId || !templateId || busy}
            onClick={() => void generate(3)}
            className="rounded border border-[#D4D4D8] px-4 py-2 text-sm"
          >
            {busyLabel === "Gerando 3 CTAs"
              ? "Gerando opções •••"
              : "Gerar 3 CTAs"}
          </button>
          </div>
        </div>
        {productId && (
          <p aria-live="polite" className="-mt-1 text-xs text-[#6B6F7B]">
            {productAiUsage === undefined
              ? "Carregando limite de IA deste produto..."
              : productAiUsage === null
                ? "O limite de IA deste produto será conferido ao gerar."
                : productAiUsage.limit == null
                  ? `Gerações de IA deste produto: ${productAiUsage.used.toLocaleString("pt-BR")} usadas neste mês · limite sob medida.`
                  : `Gerações de IA deste produto: ${productAiUsage.used.toLocaleString("pt-BR")} / ${productAiUsage.limit.toLocaleString("pt-BR")} neste mês.`}
          </p>
        )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className={`${panel} h-fit p-4`}>
          <h2 className="text-sm font-semibold">Product Media</h2>
          {images.length ? (
            <>
              <img
                src={images[0].displayUrl ?? ""}
                alt="Mídia principal do produto"
                className="mt-3 aspect-square w-full rounded-xl object-cover"
              />
              <div className="mt-2 grid grid-cols-4 gap-1">
                {images.map((asset) => (
                  <button
                    key={asset.id}
                    disabled={busy || asset.isPrimary}
                    onClick={() =>
                      void act("Trocando imagem", async () => {
                        await productsApi.selectMedia(productId, asset.id);
                        setMedia(await productsApi.media(productId));
                      })
                    }
                    className={`overflow-hidden rounded border ${asset.isPrimary ? "border-emerald-500" : "border-[#D4D4D8]"}`}
                  >
                    <img
                      src={asset.displayUrl ?? ""}
                      alt="Alternativa"
                      className="aspect-square w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="mt-3 flex aspect-square items-center justify-center rounded-xl border border-dashed border-[#E8E9ED] text-xs text-[#9CA3AF]">
              <ImageIcon className="mr-2 h-4 w-4" />
              Sem mídia válida
            </div>
          )}
          <p className="mt-2 text-[10px] text-[#9CA3AF]">
            A seleção reutiliza os assets existentes do Product Media.
          </p>
        </aside>

        <main className={`${panel} min-w-0 p-4`}>
          {!current ? (
            <div className="p-12 text-center text-sm text-[#9CA3AF]">
              Selecione Product e Template para gerar a mensagem.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-semibold">Mensagem preparada</h2>
                  <p className="text-xs text-[#9CA3AF]">
                    Template v
                    {(current.structureSnapshot as { templateVersion?: number })
                      .templateVersion ?? "—"}{" "}
                    · CTA{" "}
                    {current.ctaText ? "gerado" : "não usado pelo template"}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs ${current.status === "valid" ? "bg-emerald-950/40 text-emerald-600" : "bg-red-950/40 text-red-300"}`}
                >
                  {current.status === "valid" ? (
                    <>
                      <Check className="mr-1 inline h-3 w-3" />
                      Validada
                    </>
                  ) : (
                    current.status
                  )}
                </span>
              </div>
              {generations.length > 1 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {generations.map((item, index) => (
                    <button
                      key={item.id}
                      onClick={() => setSelected(index)}
                      className={`rounded-lg border p-3 text-left text-xs ${selected === index ? "border-[#EDEDED] bg-[#F4F4F6]" : "border-[#D4D4D8]"}`}
                    >
                      <span className="font-medium">Opção {index + 1}</span>
                      <span className="mt-1 line-clamp-3 block text-[#6B6F7B]">
                        {item.ctaText || "Template sem CTA"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={editedText}
                onChange={(event) => setEditedText(event.target.value)}
                className="mt-4 min-h-72 w-full resize-y rounded-xl border border-[#D4D4D8] bg-[#F8FAFC] p-4 text-sm leading-6"
              />
              <section className="mt-4 space-y-4 rounded-xl border border-[#E8E9ED] bg-[#F8FAFC] p-4">
                <div>
                  <h3 className="text-sm font-semibold">
                    Personalizar esta mensagem
                  </h3>
                  <p className="mt-1 text-xs text-[#9CA3AF]">
                    A descrição personalizada ocupa a área do cartão de link e
                    afeta somente este item.
                  </p>
                </div>
                {usesCustomPhoto ? (
                  <div className="rounded-lg border border-[#E8E9ED] p-3 text-xs text-[#6B6F7B]">
                    Este item usa uma foto escolhida no app. A descrição fixa do
                    link não será aplicada; a foto seguirá com a mensagem
                    gerada.
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {(
                        [
                          ["message", "Descrição original"],
                          ["fixed", "Descrição do template"],
                          ["custom", "Descrição personalizada"],
                        ] as const
                      ).map(([mode, label]) => (
                        <button
                          key={mode}
                          onClick={() => setCaptionMode(mode)}
                          className={`rounded-lg border px-3 py-2 text-xs ${captionMode === mode ? "border-[#EDEDED] bg-[#F4F4F6]" : "border-[#D4D4D8]"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {captionMode === "fixed" && (
                      <div className="whitespace-pre-wrap rounded-lg border border-[#E8E9ED] p-3 text-xs text-[#6B6F7B]">
                        {selectedTemplate?.presentation.defaultCaption ||
                          "Este template não possui descrição fixa para o link."}
                      </div>
                    )}
                    {captionMode === "custom" && (
                      <textarea
                        value={customCaption}
                        onChange={(event) =>
                          setCustomCaption(event.target.value)
                        }
                        maxLength={500}
                        placeholder="Descrição exibida acima do domínio no cartão"
                        className="min-h-24 w-full resize-y rounded border border-[#D4D4D8] bg-[#F8FAFC] p-3 text-xs"
                      />
                    )}
                  </>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-[#E8E9ED] pt-3">
                  <div>
                    <h3 className="text-xs font-medium">
                      Marca d’água desta mensagem
                    </h3>
                    <p className="mt-1 text-[10px] text-[#9CA3AF]">
                      Você pode substituir o padrão do template sem alterá-lo.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={watermark.enabled}
                    onChange={(event) =>
                      setWatermark({
                        ...watermark,
                        enabled: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-[#EDEDED]"
                  />
                </div>
                {watermark.enabled && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      value={watermark.text}
                      onChange={(event) =>
                        setWatermark({ ...watermark, text: event.target.value })
                      }
                      maxLength={120}
                      placeholder="Texto da marca d’água"
                      className="rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs sm:col-span-2"
                    />
                    <select
                      value={watermark.position}
                      onChange={(event) =>
                        setWatermark({
                          ...watermark,
                          position: event.target
                            .value as DispatchWatermarkSettings["position"],
                        })
                      }
                      className="rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs"
                    >
                      <option value="bottom-right">Inferior direita</option>
                      <option value="bottom-left">Inferior esquerda</option>
                      <option value="top-right">Superior direita</option>
                      <option value="top-left">Superior esquerda</option>
                      <option value="center">Centro</option>
                    </select>
                    <label className="text-[10px] uppercase tracking-wider text-[#9CA3AF]">
                      Opacidade: {Math.round(watermark.opacity * 100)}%
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round(watermark.opacity * 100)}
                        onChange={(event) =>
                          setWatermark({
                            ...watermark,
                            opacity: Number(event.target.value) / 100,
                          })
                        }
                        className="mt-2 w-full accent-[#EDEDED]"
                      />
                    </label>
                  </div>
                )}
              </section>
              {current.validationErrors.length > 0 && (
                <div className="mt-2 rounded border border-red-900/50 p-2 text-xs text-red-300">
                  {current.validationErrors.join(" · ")}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  disabled={busy || editedText === current.finalText}
                  onClick={() => void saveEdit()}
                  className="rounded border border-[#D4D4D8] px-3 py-2 text-xs disabled:opacity-30"
                >
                  <Save className="mr-1 inline h-3.5 w-3.5" />
                  {busyLabel === "Salvando edição"
                    ? "Salvando •••"
                    : "Salvar edição"}
                </button>
                <button
                  disabled={busy || !current.ctaText}
                  onClick={() => void regenerateCta()}
                  className="rounded border border-[#D4D4D8] px-3 py-2 text-xs disabled:opacity-30"
                >
                  <RefreshCw className="mr-1 inline h-3.5 w-3.5" />
                  {busyLabel === "Gerando outro CTA"
                    ? "Gerando CTA •••"
                    : "Gerar outro CTA"}
                </button>
                <button
                  disabled={
                    busy ||
                    !current.publishable ||
                    current.status !== "valid" ||
                    (watermark.enabled && !watermark.text.trim())
                  }
                  onClick={addQueue}
                  className="ml-auto rounded bg-[#EDEDED] px-4 py-2 text-xs font-medium text-[#111] disabled:opacity-40"
                >
                  <ListPlus className="mr-1 inline h-3.5 w-3.5" />
                  Adicionar à fila
                </button>
              </div>
              {edited && (
                <div className="mt-4 rounded-lg border border-[#D4D4D8] p-3">
                  <p className="text-xs font-medium">
                    Quer que o Treinador aprenda com a alteração do CTA?
                  </p>
                  <p className="mt-1 text-[10px] text-[#9CA3AF]">
                    Confirme somente o trecho inicial que deve virar exemplo
                    positivo.
                  </p>
                  <textarea
                    value={learnCta}
                    onChange={(event) => setLearnCta(event.target.value)}
                    className="mt-2 h-20 w-full rounded border border-[#D4D4D8] bg-[#F8FAFC] p-2 text-xs"
                  />
                  <button
                    disabled={busy || !learnCta.trim()}
                    onClick={() => void learnFromEdit()}
                    className="mt-2 rounded border border-[#D4D4D8] px-3 py-2 text-xs"
                  >
                    Ensinar esta alteração
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};
