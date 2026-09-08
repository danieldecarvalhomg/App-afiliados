import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  GripVertical,
  ListOrdered,
  Loader2,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Send,
  Settings2,
  Users,
  Wifi,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  Campaign,
  CampaignCollection,
  CreateCampaignCollectionInput,
  CreateCampaignInput,
  CreateQueueInput,
  QueueDeliveryStatus,
  QueueItem,
  QueueMode,
  QueuePreview,
} from "../domain/dispatch/types";
import type {
  WhatsAppConnection,
  WhatsAppGroup,
} from "../domain/whatsapp/types";
import {
  dispatchApi,
  dispatchNavigation,
  type DispatchQueueDetail,
  type DispatchStreamState,
  type QueueItemDetail,
} from "../services/dispatchApi";
import { whatsappApi } from "../services/whatsappApi";

type Screen = "list" | "form" | "queue" | "compose" | "item";
type QueueTab = "upcoming" | "history";
const panel = "rounded-xl border border-[#E8E9ED] bg-[#FFFFFF]";
const field =
  "w-full rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] px-3 py-2.5 text-sm text-[#0F172A] outline-none focus:border-[#6B6F7B]";
const terminal = ["completed", "partially_failed", "failed", "cancelled"];
const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const modeLabels: Record<QueueMode, string> = {
  continuous: "Contínua",
  fixed_slots: "Horários fixos",
  manual: "Manual",
};
const statusLabels: Record<string, string> = {
  active: "Ativa",
  pause_requested: "Pausando após o item",
  paused: "Pausada",
  draft: "Rascunho",
  archived: "Arquivada",
  cancelled: "Cancelada",
  completed: "Concluída",
  queued: "Aguardando",
  scheduled: "Agendado",
  sending: "Enviando •••",
  partially_failed: "Falha parcial",
  failed: "Falhou",
};
const deliveryLabels: Record<QueueDeliveryStatus, string> = {
  pending: "Aguardando",
  scheduled: "Agendada",
  claimed: "Preparando",
  sending: "Enviando •••",
  sent: "Enviada",
  retry_wait: "Nova tentativa",
  failed: "Falhou",
  cancelled: "Cancelada",
  skipped: "Ignorada",
  uncertain: "Verificar",
};

const formatDate = (value?: string | null, timezone?: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(value))
    : "—";
const intervalLabel = (seconds: number) =>
  seconds % 3600 === 0
    ? `${seconds / 3600}h`
    : seconds % 60 === 0
      ? `${seconds / 60} min`
      : `${seconds}s`;
const emptyForm = (): CreateCampaignInput => ({
  name: "",
  connectionId: "",
  groupIds: [],
  mode: "continuous",
  intervalBetweenItemsSeconds: 300,
  timezone: "America/Sao_Paulo",
  allowedStartTime: "08:00",
  allowedEndTime: "22:00",
  allowedDays: [1, 2, 3, 4, 5, 6, 7],
  fixedSlots: ["09:00"],
});

function Badge({ value }: { value: string }) {
  const positive = ["active", "completed", "sent"].includes(value);
  const warn = [
    "pause_requested",
    "paused",
    "scheduled",
    "queued",
    "retry_wait",
  ].includes(value);
  return (
    <span
      className={`rounded-md px-2 py-1 text-[10px] ${positive ? "bg-emerald-50 text-[#16A34A]" : warn ? "bg-amber-50 text-[#CA8A04]" : value.includes("fail") || value === "uncertain" ? "bg-red-50 text-red-600" : "bg-[#F4F4F6] text-[#6B6F7B]"}`}
    >
      {statusLabels[value] ??
        deliveryLabels[value as QueueDeliveryStatus] ??
        value}
    </span>
  );
}

export const QueuesView: React.FC = () => {
  const { setActiveTab } = useApp();
  const [screen, setScreen] = useState<Screen>("list");
  const [queues, setQueues] = useState<Campaign[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignCollection[]>([]);
  const [selectedQueue, setSelectedQueue] =
    useState<DispatchQueueDetail | null>(null);
  const [selectedItem, setSelectedItem] = useState<QueueItemDetail | null>(
    null,
  );
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [form, setForm] = useState<CreateCampaignInput>(emptyForm);
  const [formDestinationMode, setFormDestinationMode] = useState<"campaign" | "group">("campaign");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaignDraft, setCampaignDraft] = useState<CreateCampaignCollectionInput>({ name: "", connectionId: "", groupIds: [] });
  const [campaignGroups, setCampaignGroups] = useState<WhatsAppGroup[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>("upcoming");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<DispatchStreamState>("connecting");
  const [generationId, setGenerationId] = useState("");
  const [destinationMode, setDestinationMode] = useState<
    "campaign" | "group"
  >("campaign");
  const [composerQueueId, setComposerQueueId] = useState("");
  const [composerGroupId, setComposerGroupId] = useState("");
  const [placement, setPlacement] = useState<"end" | "next">("end");
  const [preview, setPreview] = useState<QueuePreview | null>(null);
  const [prepared, setPrepared] = useState<CreateQueueInput | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [presentationOverrides, setPresentationOverrides] = useState<
    Pick<CreateQueueInput, "captionMode" | "caption" | "watermark">
  >({});

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [queueData, campaignData, connectionData] = await Promise.all([
        dispatchApi.listQueues(),
        dispatchApi.listCampaigns(),
        whatsappApi.listConnections(),
      ]);
      setQueues(queueData);
      setCampaigns(campaignData);
      setConnections(connectionData);
      setError(null);
    } catch (cause) {
      if (!silent)
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar as filas.",
        );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);
  const openQueue = useCallback(async (id: string, silent = false) => {
    try {
      const value = await dispatchApi.getQueue(id);
      setSelectedQueue(value);
      setQueues((all) =>
        all.map((queue) => (queue.id === value.id ? value : queue)),
      );
      if (!silent) {
        setScreen("queue");
        setError(null);
      }
    } catch (cause) {
      if (!silent)
        setError(
          cause instanceof Error ? cause.message : "Fila não encontrada.",
        );
    }
  }, []);
  const openItem = useCallback(async (id: string, silent = false) => {
    try {
      const value = await dispatchApi.getQueueItem(id);
      setSelectedItem(value);
      if (!silent) {
        setScreen("item");
        setError(null);
      }
    } catch (cause) {
      if (!silent)
        setError(
          cause instanceof Error ? cause.message : "Item não encontrado.",
        );
    }
  }, []);

  useEffect(() => {
    const composeIntent = dispatchNavigation.consumeQueueComposer();
    const itemIntent = dispatchNavigation.consumeQueueItem();
    if (composeIntent) {
      setGenerationId(composeIntent.generationId);
      setPresentationOverrides({
        captionMode: composeIntent.captionMode,
        caption: composeIntent.caption,
        watermark: composeIntent.watermark,
      });
      setScreen("compose");
    } else if (itemIntent) void openItem(itemIntent);
    void load();
  }, [load, openItem]);
  useEffect(
    () =>
      dispatchApi.subscribe(() => {
        void load(true);
        if (selectedQueue) void openQueue(selectedQueue.id, true);
        if (selectedItem) void openItem(selectedItem.id, true);
      }, setStream),
    [load, openItem, openQueue, selectedItem?.id, selectedQueue?.id],
  );
  useEffect(() => {
    if (!form.connectionId) {
      setGroups([]);
      return;
    }
    void whatsappApi
      .listConnectionGroups(form.connectionId)
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [form.connectionId]);
  useEffect(() => {
    if (!campaignDraft.connectionId || !creatingCampaign) {
      setCampaignGroups([]);
      return;
    }
    void whatsappApi.listConnectionGroups(campaignDraft.connectionId).then(setCampaignGroups).catch(() => setCampaignGroups([]));
  }, [campaignDraft.connectionId, creatingCampaign]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível concluir esta ação.",
      );
    } finally {
      setBusy(null);
    }
  };
  const startCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormDestinationMode("campaign");
    setSelectedCampaignId("");
    setCreatingCampaign(false);
    setScreen("form");
  };
  const startEdit = (queue: Campaign) => {
    setEditingId(queue.id);
    setForm({
      name: queue.name,
      connectionId: queue.connectionId,
      groupIds: queue.groups.map((group) => group.whatsappGroupId),
      mode: queue.mode,
      intervalBetweenItemsSeconds: queue.intervalBetweenItemsSeconds,
      timezone: queue.timezone,
      allowedStartTime: queue.allowedStartTime,
      allowedEndTime: queue.allowedEndTime,
      allowedDays: queue.allowedDays,
      fixedSlots: queue.fixedSlots,
    });
    const queueGroupIds = queue.groups.map((group) => group.whatsappGroupId).sort();
    const matchingCampaign = campaigns.find((campaign) => campaign.connectionId === queue.connectionId && campaign.groups.map((group) => group.whatsappGroupId).sort().join(":") === queueGroupIds.join(":"));
    setFormDestinationMode(matchingCampaign ? "campaign" : "group");
    setSelectedCampaignId(matchingCampaign?.id ?? "");
    setCreatingCampaign(false);
    setScreen("form");
  };
  const selectCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
    const campaign = campaigns.find((item) => item.id === campaignId);
    if (!campaign) return;
    setForm((current) => ({
      ...current,
      connectionId: campaign.connectionId,
      groupIds: campaign.groups.map((group) => group.whatsappGroupId),
    }));
  };
  const saveInlineCampaign = () =>
    void run("save-campaign", async () => {
      const saved = await dispatchApi.createCampaign(campaignDraft);
      setCampaigns((current) => [saved, ...current]);
      setCreatingCampaign(false);
      setCampaignDraft({ name: "", connectionId: "", groupIds: [] });
      setFormDestinationMode("campaign");
      selectCampaign(saved.id);
      setSelectedCampaignId(saved.id);
      setForm((current) => ({ ...current, connectionId: saved.connectionId, groupIds: saved.groups.map((group) => group.whatsappGroupId) }));
    });
  const saveQueue = () =>
    void run("save", async () => {
      const saved = editingId
        ? await dispatchApi.updateQueue(editingId, form)
        : await dispatchApi.createQueue(form);
      await load(true);
      await openQueue(saved.id);
    });
  const setQueueStatus = (action: "pause" | "resume" | "archive" | "next") =>
    selectedQueue &&
    void run(action, async () => {
      if (action === "pause") await dispatchApi.pauseQueue(selectedQueue.id);
      else if (action === "resume")
        await dispatchApi.resumeQueue(selectedQueue.id);
      else if (action === "archive")
        await dispatchApi.archiveQueue(selectedQueue.id);
      else await dispatchApi.sendNext(selectedQueue.id);
      await Promise.all([load(true), openQueue(selectedQueue.id, true)]);
    });

  const upcoming = useMemo(
    () =>
      selectedQueue?.items
        .filter((item) => !terminal.includes(item.status))
        .sort((a, b) => a.position - b.position) ?? [],
    [selectedQueue],
  );
  const history = useMemo(
    () =>
      selectedQueue?.items
        .filter((item) => terminal.includes(item.status))
        .sort(
          (a, b) =>
            new Date(b.completedAt ?? b.updatedAt).getTime() -
            new Date(a.completedAt ?? a.updatedAt).getTime(),
        ) ?? [],
    [selectedQueue],
  );
  const reorder = (targetId: string) => {
    if (!selectedQueue || !draggedId || draggedId === targetId) return;
    const ids = upcoming.map((item) => item.id);
    const from = ids.indexOf(draggedId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setSelectedQueue({
      ...selectedQueue,
      items: selectedQueue.items.map((item) => ({
        ...item,
        position:
          ids.indexOf(item.id) >= 0 ? ids.indexOf(item.id) + 1 : item.position,
      })),
    });
    setDraggedId(null);
    void run("reorder", async () => {
      await dispatchApi.reorderQueue(selectedQueue.id, ids);
      await openQueue(selectedQueue.id, true);
    });
  };

  const prepareCta = () => {
    const queue = queues.find((value) => value.id === composerQueueId);
    if (!queue || !generationId) return;
    void run("preview", async () => {
      const input: CreateQueueInput = {
        campaignId: queue.id,
        whatsappGroupId:
          destinationMode === "group" ? composerGroupId : null,
        sourceType: "cta_generation",
        sourceReferenceId: generationId,
        ...presentationOverrides,
        scheduledAt: new Date().toISOString(),
        placement,
        idempotencyKey: crypto.randomUUID(),
      };
      const value = await dispatchApi.previewQueue(input);
      setPrepared(input);
      setPreview(value);
    });
  };
  const confirmCta = () =>
    prepared &&
    preview &&
    void run("confirm", async () => {
      const item = await dispatchApi.createQueueItem({
        ...prepared,
        expectedSnapshotHash: preview.snapshotHash,
      });
      setPreview(null);
      await openItem(item.id);
    });

  if (screen === "form")
    return (
      <div className="space-y-6 pb-12">
        <button
          onClick={() =>
            editingId ? selectedQueue && setScreen("queue") : setScreen("list")
          }
          className="flex items-center gap-2 text-sm text-[#6B6F7B]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <header>
          <h1 className="text-2xl font-medium">
            {editingId ? "Editar fila" : "Nova fila"}
          </h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            A conexão, os grupos e a cadência ficam configurados uma única vez.
          </p>
        </header>
        {error && <ErrorBox value={error} />}
        <div className="grid gap-5 lg:grid-cols-2">
          <section className={`${panel} space-y-4 p-5`}>
            <h2 className="text-sm font-medium">Identidade e destinos</h2>
            <label className="block text-xs text-[#6B6F7B]">
              Nome
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                className={`${field} mt-1.5`}
                placeholder="Ofertas do dia"
              />
            </label>
            <div>
              <p className="text-xs text-[#6B6F7B]">Destino da fila</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  ["campaign", "Campanha", "Vários grupos", Megaphone],
                  ["group", "Grupo individual", "Um único grupo", Users],
                ] as const).map(([value, title, subtitle, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFormDestinationMode(value);
                      setSelectedCampaignId("");
                      setCreatingCampaign(false);
                      setForm((current) => ({ ...current, connectionId: "", groupIds: [] }));
                    }}
                    disabled={Boolean(editingId && selectedQueue?.pendingItems)}
                    className={`rounded-lg border p-3 text-left ${formDestinationMode === value ? "border-[#6B6F7B] bg-[#F4F4F6]" : "border-[#E8E9ED]"}`}
                  >
                    <Icon className="mb-2 h-4 w-4 text-[#6B6F7B]" />
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="mt-0.5 block text-[10px] text-[#9CA3AF]">{subtitle}</span>
                  </button>
                ))}
              </div>
            </div>

            {formDestinationMode === "campaign" ? (
              <div className="space-y-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-4">
                <div className="flex items-end gap-2">
                  <label className="min-w-0 flex-1 text-xs text-[#6B6F7B]">
                    Campanha
                    <select value={selectedCampaignId} onChange={(event) => selectCampaign(event.target.value)} className={`${field} mt-1.5 bg-white`} disabled={Boolean(editingId && selectedQueue?.pendingItems)}>
                      <option value="">Selecione uma campanha</option>
                      {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name} · {campaign.groups.length} grupo(s)</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={() => { setCreatingCampaign((value) => !value); setCampaignDraft({ name: "", connectionId: connections[0]?.id ?? "", groupIds: [] }); }} className="rounded-lg border border-[#E8E9ED] bg-white px-3 py-2.5 text-xs">
                    <Plus className="mr-1 inline h-3.5 w-3.5" /> Criar campanha
                  </button>
                </div>
                {selectedCampaignId && !creatingCampaign && (
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-xs text-emerald-700">
                    {form.groupIds.length} grupo{form.groupIds.length === 1 ? "" : "s"} da campanha serão usados nesta fila.
                  </div>
                )}
                {creatingCampaign && (
                  <div className="space-y-3 border-t border-[#E8E9ED] pt-4">
                    <div><p className="text-sm font-medium">Nova campanha</p><p className="mt-0.5 text-[10px] text-[#9CA3AF]">Crie aqui e ela já ficará selecionada na fila.</p></div>
                    <input value={campaignDraft.name} onChange={(event) => setCampaignDraft({ ...campaignDraft, name: event.target.value })} placeholder="Nome da campanha" className={`${field} bg-white`} />
                    <select value={campaignDraft.connectionId} onChange={(event) => setCampaignDraft({ ...campaignDraft, connectionId: event.target.value, groupIds: [] })} className={`${field} bg-white`}>
                      <option value="">Selecione a conexão</option>
                      {connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label} · {connection.status}</option>)}
                    </select>
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {campaignGroups.filter((group) => group.syncStatus === "active").map((group) => (
                        <label key={group.id} className="flex items-center gap-3 rounded-lg border border-[#E8E9ED] bg-white p-3 text-sm">
                          <input type="checkbox" checked={campaignDraft.groupIds.includes(group.id)} onChange={() => setCampaignDraft({ ...campaignDraft, groupIds: campaignDraft.groupIds.includes(group.id) ? campaignDraft.groupIds.filter((id) => id !== group.id) : [...campaignDraft.groupIds, group.id] })} />
                          <span className="min-w-0 flex-1 truncate">{group.name}</span><span className="text-xs text-[#9CA3AF]">{group.participantsCount}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setCreatingCampaign(false)} className="px-3 py-2 text-xs text-[#6B6F7B]">Cancelar</button>
                      <button type="button" onClick={saveInlineCampaign} disabled={busy !== null || !campaignDraft.name.trim() || !campaignDraft.connectionId || campaignDraft.groupIds.length === 0} className="rounded-lg bg-[#EDEDED] px-3 py-2 text-xs font-medium disabled:opacity-40">{busy === "save-campaign" ? "Salvando •••" : "Criar e selecionar"}</button>
                    </div>
                  </div>
                )}
                {campaigns.length === 0 && !creatingCampaign && <p className="text-xs text-[#9CA3AF]">Nenhuma campanha cadastrada. Crie a primeira aqui.</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs text-[#6B6F7B]">Conexão
                  <select value={form.connectionId} onChange={(event) => setForm({ ...form, connectionId: event.target.value, groupIds: [] })} className={`${field} mt-1.5`} disabled={Boolean(editingId && selectedQueue?.pendingItems)}>
                    <option value="">Selecione</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.label} · {connection.status}</option>)}
                  </select>
                </label>
                <div><p className="text-xs text-[#6B6F7B]">Grupo desta conexão</p><div className="mt-2 max-h-64 space-y-2 overflow-auto">{groups.filter((group) => group.syncStatus === "active").map((group) => (
                  <label key={group.id} className="flex items-center gap-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-sm">
                    <input type="radio" name="queue-group" checked={form.groupIds[0] === group.id} onChange={() => setForm({ ...form, groupIds: [group.id] })} className="accent-[#EDEDED]" />
                    <span className="min-w-0 flex-1 truncate">{group.name}</span><span className="text-xs text-[#9CA3AF]">{group.participantsCount}</span>
                  </label>
                ))}</div></div>
              </div>
            )}
          </section>
          <section className={`${panel} space-y-4 p-5`}>
            <h2 className="text-sm font-medium">Execução</h2>
            <label className="block text-xs text-[#6B6F7B]">
              Modo
              <select
                value={form.mode}
                onChange={(event) =>
                  setForm({ ...form, mode: event.target.value as QueueMode })
                }
                className={`${field} mt-1.5`}
              >
                <option value="continuous">Contínua</option>
                <option value="fixed_slots">Horários fixos</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label className="block text-xs text-[#6B6F7B]">
              Intervalo entre itens (segundos)
              <input
                type="number"
                min={1}
                max={86400}
                value={form.intervalBetweenItemsSeconds}
                onChange={(event) =>
                  setForm({
                    ...form,
                    intervalBetweenItemsSeconds: Number(event.target.value),
                  })
                }
                className={`${field} mt-1.5`}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-[#6B6F7B]">
                Início
                <input
                  type="time"
                  value={form.allowedStartTime}
                  onChange={(event) =>
                    setForm({ ...form, allowedStartTime: event.target.value })
                  }
                  className={`${field} mt-1.5`}
                />
              </label>
              <label className="text-xs text-[#6B6F7B]">
                Fim
                <input
                  type="time"
                  value={form.allowedEndTime}
                  onChange={(event) =>
                    setForm({ ...form, allowedEndTime: event.target.value })
                  }
                  className={`${field} mt-1.5`}
                />
              </label>
            </div>
            <div>
              <p className="text-xs text-[#6B6F7B]">Dias permitidos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {dayLabels.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      const day = index + 1;
                      setForm({
                        ...form,
                        allowedDays: form.allowedDays?.includes(day)
                          ? form.allowedDays.filter((value) => value !== day)
                          : [...(form.allowedDays ?? []), day].sort(),
                      });
                    }}
                    className={`rounded-lg border px-3 py-2 text-xs ${form.allowedDays?.includes(index + 1) ? "border-[#EDEDED] bg-[#EDEDED] text-[#111]" : "border-[#E8E9ED] text-[#6B6F7B]"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {form.mode === "fixed_slots" && (
              <label className="block text-xs text-[#6B6F7B]">
                Horários fixos (separados por vírgula)
                <input
                  value={form.fixedSlots?.join(", ")}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      fixedSlots: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                  className={`${field} mt-1.5`}
                  placeholder="09:00, 12:30, 18:00"
                />
              </label>
            )}
            <label className="block text-xs text-[#6B6F7B]">
              Fuso IANA
              <input
                value={form.timezone}
                onChange={(event) =>
                  setForm({ ...form, timezone: event.target.value })
                }
                className={`${field} mt-1.5`}
              />
            </label>
            <button
              disabled={
                busy !== null ||
                !form.name ||
                !form.connectionId ||
                !form.groupIds.length
              }
              onClick={saveQueue}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2.5 text-sm font-medium text-[#111] disabled:opacity-40"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {busy === "save" ? "Salvando •••" : "Salvar fila"}
            </button>
          </section>
        </div>
      </div>
    );

  if (screen === "compose")
    return (
      <div className="space-y-6 pb-12">
        <button
          onClick={() => setScreen("list")}
          className="flex items-center gap-2 text-sm text-[#6B6F7B]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </button>
        <header>
          <h1 className="text-2xl font-medium">Adicionar mensagem à fila</h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            A legenda e a marca d’água já vieram do template ou da
            personalização feita em Mensagens.
          </p>
        </header>
        {error && <ErrorBox value={error} />}
        <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="space-y-5">
            <section className={`${panel} space-y-4 p-5`}>
              <div>
                <p className="text-xs text-[#6B6F7B]">Destino deste item</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      ["campaign", "Campanha completa", "Todos os grupos"],
                      ["group", "Grupo individual", "Somente um destino"],
                    ] as const
                  ).map(([mode, title, description]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setDestinationMode(mode);
                        setComposerQueueId("");
                        setComposerGroupId("");
                        setPrepared(null);
                        setPreview(null);
                      }}
                      className={`rounded-xl border p-3 text-left ${destinationMode === mode ? "border-emerald-500/70 bg-emerald-500/10" : "border-[#E8E9ED] bg-[#F8FAFC]"}`}
                    >
                      <span className="block text-sm font-medium">{title}</span>
                      <span className="mt-1 block text-[10px] text-[#9CA3AF]">
                        {description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              {destinationMode === "campaign" ? (
                <label className="block text-xs text-[#6B6F7B]">
                  Campanha
                  <select
                    value={composerQueueId}
                    onChange={(event) => {
                      setComposerQueueId(event.target.value);
                      setPrepared(null);
                      setPreview(null);
                    }}
                    className={`${field} mt-1.5`}
                  >
                    <option value="">Selecione a campanha</option>
                    {queues
                      .filter((queue) =>
                        ["active", "paused"].includes(queue.status),
                      )
                      .map((queue) => (
                        <option key={queue.id} value={queue.id}>
                          {queue.name} · {queue.groups.length} grupo(s) · {queue.connectionLabel}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label className="block text-xs text-[#6B6F7B]">
                  Grupo individual
                  <select
                    value={
                      composerQueueId && composerGroupId
                        ? `${composerQueueId}:${composerGroupId}`
                        : ""
                    }
                    onChange={(event) => {
                      const [queueId = "", groupId = ""] =
                        event.target.value.split(":");
                      setComposerQueueId(queueId);
                      setComposerGroupId(groupId);
                      setPrepared(null);
                      setPreview(null);
                    }}
                    className={`${field} mt-1.5`}
                  >
                    <option value="">Selecione o grupo</option>
                    {queues
                      .filter((queue) =>
                        ["active", "paused"].includes(queue.status),
                      )
                      .flatMap((queue) =>
                        queue.groups
                          .filter((group) => group.syncStatus === "active")
                          .map((group) => (
                            <option
                              key={`${queue.id}:${group.whatsappGroupId}`}
                              value={`${queue.id}:${group.whatsappGroupId}`}
                            >
                              {group.name} · campanha {queue.name}
                            </option>
                          )),
                      )}
                  </select>
                  <span className="mt-1 block text-[10px] text-[#9CA3AF]">
                    O grupo usa a cadência e a conexão da campanha indicada.
                  </span>
                </label>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setPlacement("end");
                    setPreview(null);
                  }}
                  className={`rounded-lg border p-3 text-sm ${placement === "end" ? "border-[#EDEDED]" : "border-[#E8E9ED]"}`}
                >
                  Adicionar ao fim
                </button>
                <button
                  onClick={() => {
                    setPlacement("next");
                    setPreview(null);
                  }}
                  className={`rounded-lg border p-3 text-sm ${placement === "next" ? "border-[#EDEDED]" : "border-[#E8E9ED]"}`}
                >
                  Enviar como próximo
                </button>
              </div>
              <div className="rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3 text-xs text-[#9CA3AF]">
                Para alterar legenda ou marca d’água deste item, volte à aba
                Mensagens. Os padrões fixos ficam na aba Templates.
              </div>
            </section>
            <button
              disabled={!composerQueueId || busy !== null}
              onClick={prepareCta}
              className="w-full rounded-lg bg-[#EDEDED] px-4 py-3 text-sm font-medium text-[#111] disabled:opacity-40"
            >
              {busy === "preview" ? "Preparando •••" : "Revisar item"}
            </button>
          </div>
          <section className={`${panel} h-fit p-5`}>
            <h2 className="text-sm font-medium">Snapshot exato</h2>
            {preview ? (
              <div className="mt-4 space-y-4">
                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                    Mensagem
                  </p>
                  <div className="whitespace-pre-wrap rounded-xl bg-[#F8FAFC] p-4 text-sm leading-6">
                    {preview.snapshot.text}
                  </div>
                </div>
                {preview.snapshot.hasMedia ? (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                      Foto escolhida no app
                    </p>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#F8FAFC] p-4 text-sm leading-6">
                      A foto será enviada com a mensagem gerada, sem descrição
                      fixa do link.
                    </div>
                    <p className="mt-2 text-xs text-[#9CA3AF]">
                      Marca d’água:{" "}
                      {preview.snapshot.watermark.enabled
                        ? `${preview.snapshot.watermark.text} · ${Math.round(preview.snapshot.watermark.opacity * 100)}%`
                        : "desativada"}
                    </p>
                  </div>
                ) : preview.snapshot.caption ? (
                  <div>
                    <p className="mb-2 text-[10px] uppercase tracking-wide text-[#9CA3AF]">
                      Descrição da prévia do link
                    </p>
                    <div className="whitespace-pre-wrap rounded-xl bg-[#F8FAFC] p-4 text-sm leading-6">
                      {preview.snapshot.caption}
                    </div>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <Info label="Fila" value={preview.campaign.name} />
                  <Info
                    label="Destinos"
                    value={
                      preview.destinations.length === 1
                        ? preview.destinations[0].name
                        : `${preview.destinations.length} grupos`
                    }
                  />
                  <Info label="Posição" value={`#${preview.position}`} />
                  <Info
                    label="Próxima execução"
                    value={
                      preview.nextExecutionAt
                        ? formatDate(
                            preview.nextExecutionAt,
                            preview.campaign.timezone,
                          )
                        : "Sob comando manual"
                    }
                  />
                </div>
                <button
                  onClick={confirmCta}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2.5 text-sm font-medium text-[#111]"
                >
                  <Send className="h-4 w-4" />
                  {busy === "confirm"
                    ? "Adicionando •••"
                    : "Confirmar inclusão"}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex min-h-60 items-center justify-center rounded-xl border border-dashed border-[#E8E9ED] p-8 text-center text-sm text-[#9CA3AF]">
                Selecione a fila para revisar o conteúdo congelado antes do
                envio.
              </div>
            )}
          </section>
        </div>
      </div>
    );

  if (screen === "item")
    return (
      <div className="space-y-6 pb-12">
        <button
          onClick={() =>
            selectedItem
              ? void openQueue(selectedItem.campaignId)
              : setScreen("list")
          }
          className="flex items-center gap-2 text-sm text-[#6B6F7B]"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para a fila
        </button>
        {error && <ErrorBox value={error} />}
        {!selectedItem ? (
          <Loading />
        ) : (
          <>
            <header className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-medium">
                    {selectedItem.contentSnapshot.productTitle ||
                      "Item da fila"}
                  </h1>
                  <Badge value={selectedItem.status} />
                </div>
                <p className="mt-1 text-sm text-[#6B6F7B]">
                  {selectedItem.campaignName} · posição #{selectedItem.position}
                </p>
              </div>
            </header>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className={`${panel} p-5`}>
                <h2 className="text-sm font-medium">Snapshot imutável</h2>
                <div className="mt-4 whitespace-pre-wrap rounded-xl bg-[#F8FAFC] p-4 text-sm leading-6">
                  {selectedItem.contentSnapshot.text}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Info
                    label="Destinos congelados"
                    value={`${selectedItem.destinationSnapshot.length} grupos`}
                  />
                  <Info
                    label="Intervalo usado"
                    value={intervalLabel(
                      selectedItem.queueConfigSnapshot
                        .intervalBetweenItemsSeconds,
                    )}
                  />
                  <Info
                    label="Próxima execução"
                    value={formatDate(
                      selectedItem.nextExecutionAt,
                      selectedItem.queueConfigSnapshot.timezone,
                    )}
                  />
                  <Info
                    label="Concluído"
                    value={formatDate(selectedItem.completedAt)}
                  />
                </div>
              </section>
              <section className={`${panel} p-5`}>
                <h2 className="text-sm font-medium">Progresso</h2>
                <div className="mt-5 grid grid-cols-4 gap-2 text-center text-xs">
                  {[
                    ["Total", selectedItem.progress.total],
                    ["Enviados", selectedItem.progress.sent],
                    ["Falhas", selectedItem.progress.failed],
                    ["Pendentes", selectedItem.progress.pending],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-lg bg-[#F4F4F6] p-3"
                    >
                      <b className="block text-lg">{value}</b>
                      <span className="text-[#9CA3AF]">{label}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <section className={`${panel} overflow-hidden`}>
              <div className="border-b border-[#E8E9ED] px-5 py-4">
                <h2 className="text-sm font-medium">Entregas por grupo</h2>
              </div>
              {selectedItem.deliveries.map((delivery) => (
                <div
                  key={delivery.id}
                  className="grid gap-3 border-b border-[#E8E9ED] px-5 py-4 last:border-0 sm:grid-cols-[1fr_160px_150px] sm:items-center"
                >
                  <div>
                    <p className="text-sm">{delivery.groupName}</p>
                    <p className="mt-1 font-mono text-[10px] text-[#9CA3AF]">
                      {delivery.lastErrorCode ??
                        formatDate(delivery.sentAt ?? delivery.nextAttemptAt)}
                    </p>
                  </div>
                  <Badge value={delivery.status} />
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-[#9CA3AF]">
                      {delivery.attemptCount} tentativa(s)
                    </span>
                    {["failed", "uncertain"].includes(delivery.status) && (
                      <button
                        onClick={() =>
                          void run(`delivery-${delivery.id}`, async () => {
                            await dispatchApi.retryDelivery(
                              delivery.id,
                              delivery.status === "uncertain",
                            );
                            await openItem(selectedItem.id, true);
                          })
                        }
                        className="rounded-lg border border-[#E8E9ED] p-2"
                        title="Tentar esta entrega novamente"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    );

  if (screen === "queue")
    return (
      <div className="space-y-6 pb-12">
        <button
          onClick={() => {
            setScreen("list");
            setSelectedQueue(null);
          }}
          className="flex items-center gap-2 text-sm text-[#6B6F7B]"
        >
          <ArrowLeft className="h-4 w-4" /> Todas as filas
        </button>
        {error && <ErrorBox value={error} />}
        {!selectedQueue ? (
          <Loading />
        ) : (
          <>
            <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-medium">{selectedQueue.name}</h1>
                  <Badge value={selectedQueue.status} />
                </div>
                <p className="mt-2 flex flex-wrap gap-3 text-sm text-[#6B6F7B]">
                  <span className="flex items-center gap-1">
                    <Wifi className="h-3.5 w-3.5" />
                    {selectedQueue.connectionLabel}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {selectedQueue.groups.length} grupos
                  </span>
                  <span>
                    {modeLabels[selectedQueue.mode]} ·{" "}
                    {intervalLabel(selectedQueue.intervalBetweenItemsSeconds)}{" "}
                    entre itens
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => startEdit(selectedQueue)}
                  className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm"
                >
                  <Pencil className="h-4 w-4" /> Editar
                </button>
                {selectedQueue.mode === "manual" && (
                  <button
                    onClick={() => setQueueStatus("next")}
                    disabled={!upcoming.length || busy !== null}
                    className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-3 py-2 text-sm font-medium text-[#111] disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" /> Enviar próximo
                  </button>
                )}
                {["active", "pause_requested"].includes(
                  selectedQueue.status,
                ) ? (
                  <button
                    onClick={() => setQueueStatus("pause")}
                    className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm"
                  >
                    <Pause className="h-4 w-4" /> Pausar
                  </button>
                ) : (
                  selectedQueue.status === "paused" && (
                    <button
                      onClick={() => setQueueStatus("resume")}
                      className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-sm"
                    >
                      <Play className="h-4 w-4" /> Retomar
                    </button>
                  )
                )}
                <button
                  onClick={() => setQueueStatus("archive")}
                  className="rounded-lg border border-[#E8E9ED] p-2"
                  title="Arquivar"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            </header>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Info
                label="Janela"
                value={`${selectedQueue.allowedStartTime}–${selectedQueue.allowedEndTime}`}
              />
              <Info
                label="Dias"
                value={selectedQueue.allowedDays
                  .map((day) => dayLabels[day - 1])
                  .join(", ")}
              />
              <Info
                label="Próxima execução"
                value={
                  selectedQueue.mode === "manual"
                    ? "Sob comando manual"
                    : formatDate(
                        selectedQueue.nextExecutionAt,
                        selectedQueue.timezone,
                      )
                }
              />
              <Info label="Fuso" value={selectedQueue.timezone} />
            </div>
            <div className="flex gap-2 border-b border-[#E8E9ED]">
              <button
                onClick={() => setQueueTab("upcoming")}
                className={`px-4 py-3 text-sm ${queueTab === "upcoming" ? "border-b border-[#EDEDED] text-[#0F172A]" : "text-[#9CA3AF]"}`}
              >
                Próximos itens {upcoming.length}
              </button>
              <button
                onClick={() => setQueueTab("history")}
                className={`px-4 py-3 text-sm ${queueTab === "history" ? "border-b border-[#EDEDED] text-[#0F172A]" : "text-[#9CA3AF]"}`}
              >
                Histórico {history.length}
              </button>
            </div>
            <section className={`${panel} overflow-hidden`}>
              {(queueTab === "upcoming" ? upcoming : history).length === 0 ? (
                <div className="p-12 text-center text-sm text-[#9CA3AF]">
                  Nenhum item nesta seção.
                </div>
              ) : (
                (queueTab === "upcoming" ? upcoming : history).map((item) => (
                  <div
                    key={item.id}
                    draggable={queueTab === "upcoming" && !item.startedAt}
                    onDragStart={() => setDraggedId(item.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => reorder(item.id)}
                    className="grid gap-3 border-b border-[#E8E9ED] px-4 py-4 last:border-0 sm:grid-cols-[32px_60px_1fr_170px_120px] sm:items-center"
                  >
                    <GripVertical
                      className={`h-4 w-4 ${queueTab === "upcoming" && !item.startedAt ? "cursor-grab text-[#9CA3AF]" : "text-[#E8E9ED]"}`}
                    />
                    <span className="text-xs text-[#9CA3AF]">
                      #{item.position}
                    </span>
                    <button
                      onClick={() => void openItem(item.id)}
                      className="min-w-0 text-left"
                    >
                      <p className="truncate text-sm">
                        {item.contentSnapshot.productTitle ||
                          "Mensagem preparada"}
                      </p>
                      <p className="mt-1 truncate text-xs text-[#9CA3AF]">
                        {item.contentSnapshot.text}
                      </p>
                    </button>
                    <span className="text-xs text-[#6B6F7B]">
                      {item.nextExecutionAt
                        ? formatDate(
                            item.nextExecutionAt,
                            selectedQueue.timezone,
                          )
                        : selectedQueue.mode === "manual"
                          ? "Aguardando comando"
                          : "—"}
                    </span>
                    <div className="flex items-center justify-between">
                      <Badge value={item.status} />
                      <button onClick={() => void openItem(item.id)}>
                        <ChevronRight className="h-4 w-4 text-[#6B6F7B]" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
            <p className="flex items-center gap-2 text-xs text-[#6B6F7B]">
              <GripVertical className="h-3.5 w-3.5" /> Arraste itens ainda não
              iniciados. A nova ordem é persistida e a agenda é recalculada.
            </p>
          </>
        )}
      </div>
    );

  return (
    <div className="space-y-6 pb-12">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-medium">
            <ListOrdered className="h-5 w-5" /> Filas de envio
          </h1>
          <p className="mt-1 text-sm text-[#6B6F7B]">
            Cada fila tem sua própria conexão, grupos, ordem e regra de
            execução.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-[#E8E9ED] px-3 py-2 text-xs text-[#6B6F7B]">
            <Radio
              className={`h-3.5 w-3.5 ${stream === "connected" ? "text-[#16A34A]" : "text-[#CA8A04]"}`}
            />
            {stream === "connected" ? "Tempo real" : "Reconectando •••"}
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 rounded-lg bg-[#EDEDED] px-4 py-2 text-sm font-medium text-[#111]"
          >
            <Plus className="h-4 w-4" /> Nova fila
          </button>
        </div>
      </header>
      {error && <ErrorBox value={error} />}
      {loading ? (
        <Loading />
      ) : queues.filter((queue) => queue.status !== "archived").length === 0 ? (
        <div className={`${panel} p-14 text-center`}>
          <Settings2 className="mx-auto h-9 w-9 text-[#D4D4D8]" />
          <p className="mt-3 text-sm text-[#6B6F7B]">
            Crie sua primeira fila para fixar destinos e cadência.
          </p>
          <button
            onClick={startCreate}
            className="mt-4 rounded-lg border border-[#E8E9ED] px-4 py-2 text-sm"
          >
            Criar fila
          </button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {queues
            .filter((queue) => queue.status !== "archived")
            .map((queue) => (
              <button
                key={queue.id}
                onClick={() => void openQueue(queue.id)}
                className={`${panel} p-5 text-left transition-colors hover:bg-[#F4F4F6]`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-medium">{queue.name}</h2>
                    <p className="mt-1 flex items-center gap-1 text-xs text-[#9CA3AF]">
                      <Wifi className="h-3 w-3" />
                      {queue.connectionLabel}
                    </p>
                  </div>
                  <Badge value={queue.status} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-2 text-xs">
                  <Info label="Grupos" value={String(queue.groups.length)} />
                  <Info label="Pendentes" value={String(queue.pendingItems)} />
                  <Info label="Modo" value={modeLabels[queue.mode]} />
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-[#E8E9ED] pt-4 text-xs text-[#6B6F7B]">
                  <span className="flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {queue.mode === "manual"
                      ? "Execução sob comando"
                      : queue.nextExecutionAt
                        ? `Próximo: ${formatDate(queue.nextExecutionAt, queue.timezone)}`
                        : "Sem item agendado"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-[#6B6F7B]" />
                </div>
              </button>
            ))}
        </div>
      )}
      <button
        onClick={() => setActiveTab("mensagens")}
        className="text-xs text-[#9CA3AF] underline"
      >
        Gerar uma mensagem para adicionar à fila
      </button>
    </div>
  );
};

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3">
      <p className="text-[10px] uppercase tracking-wide text-[#9CA3AF]">
        {label}
      </p>
      <p className="mt-1 truncate text-xs text-[#0F172A]">{value}</p>
    </div>
  );
}
function ErrorBox({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
      <AlertTriangle className="h-4 w-4" />
      {value}
    </div>
  );
}
function Loading() {
  return (
    <div
      className={`${panel} flex items-center justify-center gap-2 py-20 text-sm text-[#6B6F7B]`}
    >
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando •••
    </div>
  );
}
