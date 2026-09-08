import React, { useCallback, useEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  Loader2,
  Pause,
  Pencil,
  Play,
  Plus,
  Save,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { automationApi } from "../services/automationApi";
import type {
  AutomationCondition,
  AutomationConditionField,
  AutomationConfiguration,
  AutomationExecution,
  AutomationOperator,
  AutomationOptions,
  AutomationReview,
  AutomationRule,
} from "../domain/automation/types";
import { eligibleDryRunProducts } from "../domain/automation/AutomationDryRun";
const panel = "rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]";
const input =
  "w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2 text-sm text-[#0F172A] outline-none focus:border-[#6B6F7B]";
const fields: Array<{
  value: AutomationConditionField;
  label: string;
  type: "string" | "number" | "boolean" | "nullable";
}> = [
  ["marketplace", "Marketplace", "string"],
  ["monitor", "Monitor", "string"],
  ["source_group", "Grupo de origem", "string"],
  ["source_type", "Origem do produto", "string"],
  ["price", "Preço", "number"],
  ["original_price", "Preço original", "number"],
  ["discount_percent", "Desconto (%)", "number"],
  ["coupon_exists", "Possui cupom", "boolean"],
  ["free_shipping", "Frete grátis", "boolean"],
  ["category", "Categoria", "string"],
  ["product_title", "Nome do produto", "string"],
  ["keywords", "Palavras-chave", "string"],
  ["image_available", "Imagem disponível", "boolean"],
  ["affiliate_conversion_status", "Status afiliado", "string"],
  ["deal_score", "Score da oferta", "number"],
  ["commission", "Comissão", "number"],
].map(([value, label, type]) => ({
  value: value as AutomationConditionField,
  label,
  type: type as any,
}));
const operatorOptions = (
  values: Array<[AutomationOperator, string]>,
): Array<{ value: AutomationOperator; label: string }> =>
  values.map(([value, label]) => ({ value, label }));
const ops: Record<
  string,
  Array<{ value: AutomationOperator; label: string }>
> = {
  string: operatorOptions([
    ["equals", "é"],
    ["not_equals", "não é"],
    ["contains", "contém"],
    ["not_contains", "não contém"],
    ["starts_with", "começa com"],
    ["exists", "existe"],
    ["not_exists", "não existe"],
  ]),
  number: operatorOptions([
    ["equals", "é igual a"],
    ["not_equals", "é diferente de"],
    ["greater_than", "maior que"],
    ["greater_or_equal", "pelo menos"],
    ["less_than", "menor que"],
    ["less_or_equal", "no máximo"],
    ["exists", "existe"],
    ["not_exists", "não existe"],
  ]),
  boolean: operatorOptions([
    ["is_true", "sim"],
    ["is_false", "não"],
    ["exists", "informado"],
    ["not_exists", "não informado"],
  ]),
  nullable: operatorOptions([
    ["exists", "existe"],
    ["not_exists", "não existe"],
  ]),
};
const empty = (): AutomationConfiguration => ({
  name: "",
  triggerType: "PROMOTION_DETECTED",
  triggerConfig: { scope: "any" },
  conditionMode: "all",
  conditions: [],
  preparationConfig: {
    messageMode: "generated_cta",
    useDefaultTemplate: true,
    templateId: null,
    instruction: null,
    autoSelectMedia: true,
    requireImage: false,
  },
  actionType: "REVIEW_FIRST",
  actionConfig: { queueId: null, placement: "end", allowDuplicate: false },
  evaluationOrder: 0,
  stopAfterMatch: true,
});
const triggerLabel = {
  PROMOTION_DETECTED: "Nova promoção detectada",
  MARKETPLACE_DEAL: "Nova oportunidade do Radar",
  PRODUCT_CREATED: "Produto criado",
};
const actionLabel = {
  QUEUE_AUTOMATICALLY: "Adicionar automaticamente à fila",
  REVIEW_FIRST: "Aguardar minha aprovação",
  PRODUCT_ONLY: "Apenas cadastrar/preparar produto",
};
const preparationLabel = (item: AutomationConfiguration) =>
  item.preparationConfig.messageMode === "original_message"
    ? "Mensagem original + links convertidos"
    : "CTA + Template";
const statusMeta: Record<string, { label: string; color: string }> = {
  draft: { label: "Rascunho", color: "text-[#6B6F7B]" },
  active: { label: "Ativa", color: "text-[#16A34A]" },
  paused: { label: "Pausada", color: "text-[#CA8A04]" },
  error: { label: "Erro", color: "text-red-600" },
  archived: { label: "Arquivada", color: "text-[#9CA3AF]" },
};
const executionStatusMeta: Record<string, { label: string; color: string }> = {
  received: { label: "Recebida", color: "text-[#6B6F7B]" },
  evaluating: { label: "Avaliando", color: "text-sky-300" },
  matched: { label: "Correspondente", color: "text-sky-300" },
  processing: { label: "Processando", color: "text-sky-300" },
  awaiting_review: { label: "Aguardando revisão", color: "text-amber-300" },
  queued: { label: "Adicionada à fila", color: "text-emerald-600" },
  completed: { label: "Concluída", color: "text-emerald-600" },
  ignored: { label: "Ignorada", color: "text-[#6B6F7B]" },
  failed: { label: "Falhou", color: "text-red-300" },
  cancelled: { label: "Cancelada", color: "text-[#6B6F7B]" },
  waiting_dependency: { label: "Aguardando conversão do link", color: "text-amber-300" },
  retry_wait: { label: "Nova tentativa agendada", color: "text-amber-300" },
};

export const AutomationsView: React.FC = () => {
  const [items, setItems] = useState<AutomationRule[]>([]),
    [options, setOptions] = useState<AutomationOptions>({
      queues: [],
      templates: [],
      monitors: [],
      products: [],
    }),
    [reviews, setReviews] = useState<AutomationReview[]>([]),
    [executions, setExecutions] = useState<AutomationExecution[]>([]),
    [screen, setScreen] = useState<"list" | "builder" | "detail" | "reviews">(
      "list",
    ),
    [selected, setSelected] = useState<AutomationRule | null>(null),
    [draft, setDraft] = useState<AutomationConfiguration>(empty()),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<string | null>(null),
    [testResult, setTestResult] = useState<any>(null),
    [testProduct, setTestProduct] = useState(""),
    [dragged, setDragged] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, o, r, x] = await Promise.all([
        automationApi.list(),
        automationApi.options(),
        automationApi.reviews(),
        automationApi.executions(),
      ]);
      setItems(a);
      setOptions(o);
      setReviews(r);
      setExecutions(x);
      setError(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao carregar automações.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return automationApi.subscribe(
      () => {
        clearTimeout(timer);
        timer = setTimeout(() => void load(), 150);
      },
      () => undefined,
    );
  }, [load]);
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operação não concluída.");
    } finally {
      setBusy(null);
    }
  };
  const latestFailureFor = (automationId: string) =>
    executions.find(
      (execution) =>
        execution.automationId === automationId &&
        execution.status === "failed",
    );
  const create = () => {
    setSelected(null);
    setDraft({ ...empty(), evaluationOrder: items.length });
    setScreen("builder");
  };
  const edit = (item: AutomationRule) => {
    setSelected(item);
    setDraft({
      name: item.name,
      triggerType: item.triggerType,
      triggerConfig: item.triggerConfig,
      conditionMode: item.conditionMode,
      conditions: item.conditions,
      preparationConfig: item.preparationConfig,
      actionType: item.actionType,
      actionConfig: item.actionConfig,
      evaluationOrder: item.evaluationOrder,
      stopAfterMatch: item.stopAfterMatch,
    });
    setScreen("builder");
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    void run("save", async () => {
      const value = selected
        ? await automationApi.update(selected.id, draft)
        : await automationApi.create(draft);
      setItems((c) =>
        selected
          ? c.map((x) => (x.id === value.id ? value : x))
          : [...c, value],
      );
      setSelected(value);
      setScreen("detail");
    });
  };
  const activate = (item: AutomationRule) => {
    let confirmed = true;
    if (item.actionType === "QUEUE_AUTOMATICALLY") {
      const queue =
        options.queues.find((x) => x.id === item.actionConfig.queueId)?.name ??
        "indisponível";
      confirmed = window.confirm(
        `Esta automação poderá preparar mensagens e adicioná-las automaticamente à fila.\n\nOrigem: ${triggerLabel[item.triggerType]}\nDestino: ${queue}\n\nDeseja ativar?`,
      );
    }
    if (!confirmed) return;
    void run(`activate:${item.id}`, async () => {
      const value = await automationApi.activate(item.id, confirmed);
      setItems((c) => c.map((x) => (x.id === value.id ? value : x)));
      setSelected(value);
    });
  };
  const change = (
    item: AutomationRule,
    action: "pause" | "resume" | "archive",
  ) =>
    void run(`${action}:${item.id}`, async () => {
      const value =
        action === "pause"
          ? await automationApi.pause(item.id)
          : action === "resume"
            ? await automationApi.resume(item.id)
            : await automationApi.archive(item.id);
      setItems((c) =>
        action === "archive"
          ? c.filter((x) => x.id !== item.id)
          : c.map((x) => (x.id === value.id ? value : x)),
      );
      if (action === "archive") {
        setSelected(null);
        setScreen("list");
      } else setSelected(value);
    });
  const addCondition = () => {
    const condition: AutomationCondition = {
      id: crypto.randomUUID(),
      field: "marketplace",
      operator: "equals",
      value: "shopee",
    };
    setDraft({ ...draft, conditions: [...draft.conditions, condition] });
  };
  const updateCondition = (id: string, patch: Partial<AutomationCondition>) =>
    setDraft({
      ...draft,
      conditions: draft.conditions.map((x) =>
        x.id === id ? { ...x, ...patch } : x,
      ),
    });
  const move = async (source: string, target: string) => {
    if (source === target) return;
    const ordered = [...items];
    const from = ordered.findIndex((x) => x.id === source),
      to = ordered.findIndex((x) => x.id === target);
    if (from < 0 || to < 0) return;
    const [picked] = ordered.splice(from, 1);
    ordered.splice(to, 0, picked);
    setItems(ordered);
    await run("reorder", async () =>
      setItems(await automationApi.reorder(ordered.map((x) => x.id))),
    );
  };
  const test = () => {
    if (!selected || !testProduct) {
      setError("Selecione um produto real para testar.");
      return;
    }
    if (
      selected.preparationConfig.messageMode === "original_message" &&
      !options.products.some(
        (product) => product.id === testProduct && product.sourceType === "whatsapp",
      )
    ) {
      setError(
        "No modo Mensagem original, selecione um produto capturado pelo Monitor de Grupos.",
      );
      return;
    }
    void run("dry-run", async () =>
      setTestResult(
        await automationApi.dryRun(selected.id, {
          productId: testProduct,
          fullPreview: true,
        }),
      ),
    );
  };
  const deleteExecution = (execution: AutomationExecution) => {
    if (execution.status !== "failed" && execution.status !== "retry_wait")
      return;
    if (
      !window.confirm(
        "Excluir esta falha do histórico? O produto, a CTA e os envios já realizados serão preservados.",
      )
    )
      return;
    void run(`delete-execution:${execution.id}`, async () => {
      await automationApi.deleteExecution(execution.id);
      setExecutions((current) =>
        current.filter((item) => item.id !== execution.id),
      );
      setItems((current) =>
        current.map((item) =>
          item.id === execution.automationId
            ? {
                ...item,
                metrics: item.metrics
                  ? {
                      ...item.metrics,
                      failed: Math.max(
                        0,
                        item.metrics.failed -
                          (execution.status === "failed" ? 1 : 0),
                      ),
                    }
                  : item.metrics,
              }
            : item,
        ),
      );
    });
  };
  const reviewAction = (
    review: AutomationReview,
    action: "approve" | "reject" | "edit",
  ) =>
    void run(`${action}:${review.id}`, async () => {
      if (action === "approve") await automationApi.approveReview(review.id);
      else if (action === "reject") await automationApi.rejectReview(review.id);
      else {
        const text = window.prompt(
          "Edite a mensagem preparada. Os fatos serão validados antes de salvar.",
          review.snapshot.finalText,
        );
        if (text === null) return;
        await automationApi.editReview(review.id, text);
      }
      await load();
    });
  if (screen === "builder") return <Builder />;
  if (screen === "detail" && selected) return <Detail item={selected} />;
  if (screen === "reviews") return <Reviews />;
  return <List />;
  function Header({ back }: { back?: () => void }) {
    return (
      <>
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            {back && (
              <button
                onClick={back}
                className="mb-3 flex items-center gap-2 text-xs text-[#6B6F7B]"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            )}
            <h1 className="flex items-center gap-2.5 text-2xl font-medium">
              <Zap className="h-5 w-5" />
              Automações
            </h1>
            <p className="mt-1 text-sm text-[#6B6F7B]">
              Quando → Se → Preparar → Fila ou Revisão.
            </p>
          </div>
          {!back && (
            <div className="flex gap-2">
              <button
                onClick={() => setScreen("reviews")}
                className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-4 py-2 text-sm"
              >
                <ClipboardCheck className="h-4 w-4" />
                Revisão {reviews.length > 0 && `(${reviews.length})`}
              </button>
              <button
                onClick={create}
                className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111]"
              >
                <Plus className="h-4 w-4" />
                Nova automação
              </button>
            </div>
          )}
        </header>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </>
    );
  }
  function List() {
    return (
      <div className="space-y-6 pb-12">
        <Header />
        {loading ? (
          <div className={`${panel} flex justify-center py-20 text-[#6B6F7B]`}>
            Carregando automações •••
          </div>
        ) : items.length === 0 ? (
          <div className={`${panel} py-16 text-center`}>
            <Zap className="mx-auto mb-3 h-9 w-9 text-[#D4D4D8]" />
            <p className="text-sm text-[#6B6F7B]">
              Nenhuma automação configurada.
            </p>
            <button
              onClick={create}
              className="mt-5 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm text-[#111]"
            >
              Criar rascunho
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <article
                draggable
                onDragStart={() => setDragged(item.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragged) void move(dragged, item.id);
                  setDragged(null);
                }}
                key={item.id}
                className={`${panel} p-5`}
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="cursor-grab text-[#6B6F7B]">≡</span>
                      <h2 className="font-medium">{item.name}</h2>
                      <span
                        className={`text-xs ${statusMeta[item.status].color}`}
                      >
                        {statusMeta[item.status].label}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[#6B6F7B]">
                      {triggerLabel[item.triggerType]} →{" "}
                      {preparationLabel(item)} → {actionLabel[item.actionType]}
                    </p>
                    <p className="mt-2 text-[11px] text-[#9CA3AF]">
                      {item.metrics?.analyzed ?? 0} analisadas ·{" "}
                      {item.metrics?.completed ?? 0} concluídas ·{" "}
                      {item.metrics?.failed ?? 0} falhas
                    </p>
                    {latestFailureFor(item.id) && (
                      <div className="mt-3 flex max-w-2xl items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-200">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p>
                            <span className="font-medium">Última falha:</span>{" "}
                            {latestFailureFor(item.id)?.errorMessageSafe ??
                              "O motivo não foi registrado."}
                          </p>
                          {latestFailureFor(item.id)?.errorCode && (
                            <p className="mt-1 text-[10px] text-red-300/70">
                              Código: {latestFailureFor(item.id)?.errorCode}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelected(item);
                      setScreen("detail");
                    }}
                    className="self-end rounded-lg border border-[#E8E9ED] px-3 py-2 text-xs"
                  >
                    Abrir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }
  function Builder() {
    const needsQueue = draft.actionType !== "PRODUCT_ONLY";
    return (
      <div className="space-y-6 pb-12">
        <Header back={() => setScreen(selected ? "detail" : "list")} />
        <form onSubmit={save} className="mx-auto max-w-4xl space-y-5">
          <section className={`${panel} p-6`}>
            <h2 className="font-medium">Nome</h2>
            <input
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Ofertas Shopee acima de 30%"
              className={`${input} mt-3`}
            />
          </section>
          <section className={`${panel} p-6`}>
            <h2 className="font-medium">1. QUANDO</h2>
            <select
              value={draft.triggerType}
              onChange={(e) => {
                const triggerType = e.target
                  .value as AutomationConfiguration["triggerType"];
                setDraft({
                  ...draft,
                  triggerType,
                  preparationConfig: {
                    ...draft.preparationConfig,
                    messageMode:
                      triggerType === "PROMOTION_DETECTED"
                        ? draft.preparationConfig.messageMode
                        : "generated_cta",
                  },
                });
              }}
              className={`${input} mt-4`}
            >
              <option value="PROMOTION_DETECTED">
                Nova promoção for detectada
              </option>
              <option value="MARKETPLACE_DEAL">
                Nova oportunidade aparecer no Radar
              </option>
              <option value="PRODUCT_CREATED">Produto for criado</option>
            </select>
            {draft.triggerType === "PROMOTION_DETECTED" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select
                  value={draft.triggerConfig.scope ?? "any"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      triggerConfig: { scope: e.target.value as any },
                    })
                  }
                  className={input}
                >
                  <option value="any">Qualquer monitor</option>
                  <option value="monitor">Monitor específico</option>
                  <option value="group">Grupo específico</option>
                </select>
                {draft.triggerConfig.scope === "monitor" && (
                  <select
                    required
                    value={draft.triggerConfig.monitorId ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        triggerConfig: {
                          ...draft.triggerConfig,
                          monitorId: e.target.value,
                        },
                      })
                    }
                    className={input}
                  >
                    <option value="">Selecione</option>
                    {options.monitors.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
                {draft.triggerConfig.scope === "group" && (
                  <select
                    required
                    value={draft.triggerConfig.groupId ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        triggerConfig: {
                          ...draft.triggerConfig,
                          groupId: e.target.value,
                        },
                      })
                    }
                    className={input}
                  >
                    <option value="">Selecione</option>
                    {options.monitors.map((x) => (
                      <option key={x.groupId} value={x.groupId}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </section>
          <section className={`${panel} p-6`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">2. SE</h2>
                <select
                  value={draft.conditionMode}
                  onChange={(e) =>
                    setDraft({ ...draft, conditionMode: e.target.value as any })
                  }
                  className="mt-2 bg-transparent text-xs text-[#6B6F7B]"
                >
                  <option value="all">TODAS as condições</option>
                  <option value="any">QUALQUER condição</option>
                </select>
              </div>
              <button
                type="button"
                onClick={addCondition}
                className="rounded-lg border border-[#E8E9ED] px-3 py-2 text-xs"
              >
                + Adicionar condição
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {draft.conditions.map((c) => {
                const meta = fields.find((x) => x.value === c.field)!;
                const available = ops[meta.type];
                const noValue = [
                  "exists",
                  "not_exists",
                  "is_true",
                  "is_false",
                ].includes(c.operator);
                return (
                  <div
                    key={c.id}
                    className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <select
                      value={c.field}
                      onChange={(e) => {
                        const m = fields.find(
                          (x) => x.value === e.target.value,
                        )!;
                        updateCondition(c.id, {
                          field: m.value,
                          operator: ops[m.type][0].value,
                          value: "",
                        });
                      }}
                      className={input}
                    >
                      {fields.map((x) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <select
                      value={c.operator}
                      onChange={(e) =>
                        updateCondition(c.id, {
                          operator: e.target.value as AutomationOperator,
                        })
                      }
                      className={input}
                    >
                      {available.map((x: any) => (
                        <option key={x.value} value={x.value}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    {noValue ? (
                      <div />
                    ) : (
                      <input
                        required
                        type={meta.type === "number" ? "number" : "text"}
                        value={String(c.value ?? "")}
                        onChange={(e) =>
                          updateCondition(c.id, {
                            value:
                              meta.type === "number"
                                ? Number(e.target.value)
                                : e.target.value,
                          })
                        }
                        className={input}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          conditions: draft.conditions.filter(
                            (x) => x.id !== c.id,
                          ),
                        })
                      }
                      aria-label="Remover condição"
                      className="p-2 text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
          <section className={`${panel} p-6`}>
            <h2 className="font-medium">3. PREPARAR</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs text-[#6B6F7B]">
                Base da mensagem
                <select
                  value={draft.preparationConfig.messageMode ?? "generated_cta"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      preparationConfig: {
                        ...draft.preparationConfig,
                        messageMode: e.target.value as
                          | "generated_cta"
                          | "original_message",
                      },
                    })
                  }
                  className={`${input} mt-1`}
                >
                  <option value="generated_cta">
                    Preparar nova mensagem com CTA + Template
                  </option>
                  <option
                    value="original_message"
                    disabled={draft.triggerType !== "PROMOTION_DETECTED"}
                  >
                    Preservar mensagem e converter somente os links
                  </option>
                </select>
                <span className="mt-1 block text-[11px] text-[#9CA3AF]">
                  {draft.preparationConfig.messageMode === "generated_cta"
                    ? "Quando a cota mensal de IA deste produto acabar, a automação usa automaticamente a mensagem capturada com os links convertidos."
                    : "Preserva exatamente o texto, a estrutura e os emojis capturados."}
                </span>
              </label>
              <label className="text-xs text-[#6B6F7B]">
                Template
                <select
                  disabled={
                    draft.preparationConfig.messageMode === "original_message"
                  }
                  value={
                    draft.preparationConfig.useDefaultTemplate
                      ? "default"
                      : (draft.preparationConfig.templateId ?? "")
                  }
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      preparationConfig: {
                        ...draft.preparationConfig,
                        useDefaultTemplate: e.target.value === "default",
                        templateId:
                          e.target.value === "default" ? null : e.target.value,
                      },
                    })
                  }
                  className={`${input} mt-1`}
                >
                  <option value="default">Usar template padrão</option>
                  {options.templates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 self-end text-sm">
                <input
                  type="checkbox"
                  checked={draft.preparationConfig.requireImage === true}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      preparationConfig: {
                        ...draft.preparationConfig,
                        requireImage: e.target.checked,
                      },
                    })
                  }
                />
                Exigir imagem válida
              </label>
              <label className="sm:col-span-2 text-xs text-[#6B6F7B]">
                Instrução adicional
                <textarea
                  disabled={
                    draft.preparationConfig.messageMode === "original_message"
                  }
                  value={draft.preparationConfig.instruction ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      preparationConfig: {
                        ...draft.preparationConfig,
                        instruction: e.target.value,
                      },
                    })
                  }
                  className={`${input} mt-1 min-h-20`}
                  placeholder="Opcional; não pode alterar fatos do produto."
                />
              </label>
            </div>
          </section>
          <section className={`${panel} p-6`}>
            <h2 className="font-medium">4. AÇÃO</h2>
            <div className="mt-4 space-y-2">
              {(
                ["QUEUE_AUTOMATICALLY", "REVIEW_FIRST", "PRODUCT_ONLY"] as const
              ).map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={draft.actionType === value}
                    onChange={() => setDraft({ ...draft, actionType: value })}
                  />
                  {actionLabel[value]}
                </label>
              ))}
            </div>
            {needsQueue && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <select
                  required
                  value={draft.actionConfig.queueId ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actionConfig: {
                        ...draft.actionConfig,
                        queueId: e.target.value,
                      },
                    })
                  }
                  className={input}
                >
                  <option value="">Selecione a fila</option>
                  {options.queues.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
                <select
                  value={draft.actionConfig.placement ?? "end"}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      actionConfig: {
                        ...draft.actionConfig,
                        placement: e.target.value as any,
                      },
                    })
                  }
                  className={input}
                >
                  <option value="end">Final da fila</option>
                  <option value="next">Próximo item</option>
                </select>
              </div>
            )}
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.stopAfterMatch}
                onChange={(e) =>
                  setDraft({ ...draft, stopAfterMatch: e.target.checked })
                }
              />
              Ao corresponder, executar e parar a avaliação
            </label>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.actionConfig.allowDuplicate === true}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    actionConfig: {
                      ...draft.actionConfig,
                      allowDuplicate: e.target.checked,
                    },
                  })
                }
              />
              Permitir que outra automação enfileire o mesmo produto
            </label>
          </section>
          <div className="flex justify-end">
            <button
              disabled={busy !== null}
              className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-5 py-2.5 text-sm font-medium text-[#111]"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {selected ? "Salvar nova versão" : "Salvar rascunho"}
            </button>
          </div>
        </form>
      </div>
    );
  }
  function Detail({ item }: { item: AutomationRule }) {
    const history = executions
      .filter((execution) => execution.automationId === item.id)
      .slice(0, 20);
    return (
      <div className="space-y-6 pb-12">
        <Header back={() => setScreen("list")} />
        <section className={`${panel} p-6`}>
          <div className="flex flex-col justify-between gap-4 sm:flex-row">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-medium">{item.name}</h2>
                <span className={statusMeta[item.status].color}>
                  {statusMeta[item.status].label}
                </span>
              </div>
              <p className="mt-3 text-sm text-[#6B6F7B]">
                {triggerLabel[item.triggerType]} ↓ {item.conditions.length}{" "}
                condição(ões) ↓ {preparationLabel(item)} ↓{" "}
                {actionLabel[item.actionType]}
              </p>
              <p className="mt-2 text-xs text-[#9CA3AF]">
                Versão {item.currentVersion} · ordem {item.evaluationOrder + 1}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.status === "active" ? (
                <button
                  onClick={() => change(item, "pause")}
                  className="rounded-lg border border-[#E8E9ED] p-2"
                  title="Pausar"
                >
                  <Pause className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() =>
                    item.status === "draft"
                      ? activate(item)
                      : change(item, "resume")
                  }
                  className="rounded-lg bg-[#EDEDED] p-2 text-[#111]"
                  title="Ativar"
                >
                  <Play className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => edit(item)}
                className="rounded-lg border border-[#E8E9ED] p-2"
                title="Editar"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => change(item, "archive")}
                className="rounded-lg border border-[#E8E9ED] p-2 text-red-300"
                title="Arquivar"
              >
                <Archive className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              ["Analisados", item.metrics?.analyzed],
              ["Corresponderam", item.metrics?.matched],
              ["Concluídos", item.metrics?.completed],
              ["Revisão", item.metrics?.awaitingReview],
              ["Falhas", item.metrics?.failed],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-[#F8FAFC] p-3">
                <p className="text-xl font-medium">{value ?? 0}</p>
                <p className="text-xs text-[#9CA3AF]">{label}</p>
              </div>
            ))}
          </div>
        </section>
        <section className={`${panel} p-6`}>
          <h2 className="font-medium">Histórico de execuções</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            As falhas mostram o motivo seguro registrado pelo motor da
            automação.
          </p>
          {history.length === 0 ? (
            <div className="mt-4 rounded-lg bg-[#F8FAFC] p-4 text-sm text-[#6B6F7B]">
              Esta automação ainda não possui execuções.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {history.map((execution) => {
                const meta = executionStatusMeta[execution.status] ?? {
                  label: execution.status,
                  color: "text-[#6B6F7B]",
                };
                return (
                  <article
                    key={execution.id}
                    className="rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-4"
                  >
                    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
                      <p
                        className={`flex items-center gap-2 text-sm ${meta.color}`}
                      >
                        {execution.status === "failed" ? (
                          <XCircle className="h-4 w-4" />
                        ) : execution.status === "queued" ||
                          execution.status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        {meta.label}
                      </p>
                      <time className="text-[11px] text-[#9CA3AF]">
                        {new Date(execution.createdAt).toLocaleString("pt-BR")}
                      </time>
                    </div>
                    {execution.errorMessageSafe && (
                      <p className={`mt-3 rounded-md border p-3 text-xs ${execution.status === "waiting_dependency" ? "border-amber-500/20 bg-amber-500/10 text-amber-200" : "border-red-500/20 bg-red-500/10 text-red-200"}`}>
                        <span className="font-medium">Motivo:</span>{" "}
                        {execution.errorMessageSafe}
                      </p>
                    )}
                    {execution.errorCode && (
                      <p className="mt-2 text-[10px] text-[#9CA3AF]">
                        Código: {execution.errorCode}
                      </p>
                    )}
                    {(execution.status === "failed" ||
                      execution.status === "retry_wait") && (
                      <button
                        onClick={() => deleteExecution(execution)}
                        disabled={busy === `delete-execution:${execution.id}`}
                        className="mt-3 inline-flex items-center gap-2 rounded-md border border-red-500/30 px-3 py-1.5 text-xs text-red-200 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        {busy === `delete-execution:${execution.id}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Excluir falha
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <section className={`${panel} p-6`}>
          <h2 className="font-medium">Testar automação</h2>
          <p className="mt-1 text-xs text-[#9CA3AF]">
            Dry run: não cria produto, revisão ou item de fila.
          </p>
          {selected?.preparationConfig.messageMode === "original_message" && (
            <p className="mt-1 text-xs text-[#6B6F7B]">
              Este modo usa a copy capturada; por isso, somente produtos do Monitor de Grupos aparecem aqui.
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <select
              value={testProduct}
              onChange={(e) => setTestProduct(e.target.value)}
              className={input}
            >
              <option value="">Selecione um produto real</option>
              {eligibleDryRunProducts(
                options.products,
                selected?.preparationConfig.messageMode ?? "generated_cta",
              ).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.title}
                </option>
              ))}
            </select>
            <button
              onClick={test}
              disabled={busy !== null}
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-[#E8E9ED] px-4 py-2 text-sm"
            >
              <FlaskConical className="h-4 w-4" />
              Testar •••
            </button>
          </div>
          {testResult && (
            <div className="mt-4 rounded-lg bg-[#F8FAFC] p-4 text-sm">
              <p
                className={
                  testResult.wouldExecute
                    ? "text-emerald-600"
                    : "text-amber-300"
                }
              >
                {testResult.wouldExecute
                  ? "Esta automação seria executada."
                  : "Esta automação ignoraria o produto."}
              </p>
              {testResult.preparation?.errors?.map((message: string) => (
                <p key={message} className="mt-2 text-xs text-amber-300">
                  {message}
                </p>
              ))}
              <div className="mt-3 space-y-1 text-xs text-[#6B6F7B]">
                {testResult.conditions.results.map((x: any) => (
                  <p key={x.conditionId}>
                    {x.passed ? "✓" : "✕"} {x.field} {x.operator}{" "}
                    {String(x.expected ?? "")} — encontrado:{" "}
                    {String(x.actual ?? "não informado")}
                  </p>
                ))}
              </div>
              {testResult.preview?.text && (
                <pre className="mt-4 whitespace-pre-wrap rounded border border-[#E8E9ED] p-3 text-xs">
                  {testResult.preview.text}
                </pre>
              )}
            </div>
          )}
        </section>
      </div>
    );
  }
  function Reviews() {
    return (
      <div className="space-y-6 pb-12">
        <Header back={() => setScreen("list")} />
        <h2 className="text-lg font-medium">
          Revisão · {reviews.length} aguardando
        </h2>
        {reviews.length === 0 ? (
          <div className={`${panel} py-16 text-center text-sm text-[#6B6F7B]`}>
            Nenhuma mensagem aguardando revisão.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {reviews.map((r) => (
              <article key={r.id} className={`${panel} p-5`}>
                <div className="flex justify-between gap-3">
                  <div>
                    <h3 className="font-medium">{r.product.title}</h3>
                    <p className="mt-1 text-xs text-[#9CA3AF]">
                      {r.product.marketplace} ·{" "}
                      {r.product.price?.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }) ?? "—"}{" "}
                      · {r.product.discountPercent ?? 0}% OFF
                    </p>
                  </div>
                  <span className="text-xs text-[#6B6F7B]">
                    {r.automationName}
                  </span>
                </div>
                <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-[#F8FAFC] p-4 text-xs">
                  {r.snapshot.finalText}
                </pre>
                <p className="mt-3 text-xs text-[#9CA3AF]">
                  Fila prevista: {r.plannedQueueName ?? "indisponível"}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => reviewAction(r, "reject")}
                    className="flex items-center justify-center gap-1 rounded-lg border border-[#E8E9ED] py-2 text-xs text-red-300"
                  >
                    <XCircle className="h-4 w-4" />
                    Rejeitar
                  </button>
                  <button
                    onClick={() => reviewAction(r, "edit")}
                    className="flex items-center justify-center gap-1 rounded-lg border border-[#E8E9ED] py-2 text-xs"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </button>
                  <button
                    onClick={() => reviewAction(r, "approve")}
                    className="flex items-center justify-center gap-1 rounded-lg bg-[#EDEDED] py-2 text-xs text-[#111]"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }
};
