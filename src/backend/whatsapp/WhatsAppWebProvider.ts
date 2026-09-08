import {
  Browsers,
  BufferJSON,
  DisconnectReason,
  downloadMediaMessage,
  downloadContentFromMessage,
  extractImageThumb,
  prepareWAMessageMedia,
  initAuthCreds,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type WAUrlInfo,
  type WASocket,
  makeWASocket,
  proto,
} from "@whiskeysockets/baileys";
import pino from "pino";
import { fail, ok, WHATSAPP_ERRORS, type AppResult } from "../../domain/errors";
import type { WhatsAppProvider } from "../../domain/whatsapp/WhatsAppProvider";
import type {
  WhatsAppConnectionStatus,
  WhatsAppDispatchFailure,
  WhatsAppGroupSendInput,
  WhatsAppGroupSendPreflightResult,
  WhatsAppGroupSendResult,
  WhatsAppOutboundPayload,
  WhatsAppProviderGroup,
} from "../../domain/whatsapp/types";
import type {
  IncomingWhatsAppMessage,
  WhatsAppMediaMetadata,
  WhatsAppMessageType,
} from "../../domain/monitoring/types";
import type { NormalizedMediaReference } from "../../domain/whatsapp/mediaReferences";
import {
  WhatsAppLinkPreviewService,
  type WhatsAppBuiltLinkPreview,
  type WhatsAppLinkPreviewInput,
} from "./WhatsAppLinkPreviewService";
import { applyImageWatermark } from "../dispatch/ImageWatermarkProcessor";

interface AuthSnapshot {
  creds: AuthenticationCreds;
  keys: Record<string, Record<string, unknown>>;
}

const sensitiveLogFilterKey = Symbol.for(
  "promofy.baileys.sensitive-log-filter",
);
const unhandledRejectionGuardKey = Symbol.for(
  "promofy.baileys.unhandled-rejection-guard",
);

function isExpectedSocketClosure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    message?: unknown;
    output?: { statusCode?: unknown };
  };
  return (
    Number(value.output?.statusCode) === 428 ||
    (typeof value.message === "string" &&
      /connection closed/i.test(value.message))
  );
}

function isRecoverableWhatsAppRejection(error: unknown): boolean {
  if (isExpectedSocketClosure(error)) return true;
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; message?: unknown };
  return (
    value.code === "57014" ||
    (typeof value.message === "string" &&
      /canceling statement due to statement timeout/i.test(value.message))
  );
}

function installSocketRejectionGuard(): void {
  const runtime = globalThis as typeof globalThis & {
    [unhandledRejectionGuardKey]?: boolean;
  };
  if (runtime[unhandledRejectionGuardKey]) return;
  process.on("unhandledRejection", (reason) => {
    if (isRecoverableWhatsAppRejection(reason)) {
      console.warn(
        "[AfiliHub:WhatsApp] Operação assíncrona recuperável falhou; processo mantido ativo.",
        reason,
      );
      return;
    }
    console.error(
      "[AfiliHub:WhatsApp] Rejeição assíncrona não tratada.",
      reason,
    );
    setImmediate(() => {
      throw reason;
    });
  });
  runtime[unhandledRejectionGuardKey] = true;
}

/**
 * libsignal 2.x escreve o objeto completo da sessão em console.info ao fechar
 * uma ratchet. O objeto contém chaves e nunca deve aparecer nos logs técnicos.
 * O filtro é global, idempotente e deliberadamente restrito a essa mensagem.
 */
function installSensitiveSessionLogFilter(): void {
  const runtime = globalThis as typeof globalThis & {
    [sensitiveLogFilterKey]?: boolean;
  };
  if (runtime[sensitiveLogFilterKey]) return;
  const originalInfo = console.info.bind(console);
  console.info = (...args: unknown[]) => {
    if (args[0] === "Closing session:") return;
    originalInfo(...args);
  };
  runtime[sensitiveLogFilterKey] = true;
}

export interface WhatsAppWebProviderOptions {
  connectionId: string;
  serializedSession: string | null;
  onSessionChange: (serializedSession: string | null) => Promise<void>;
  onQr: (qr: string) => Promise<void> | void;
  onStatus: (
    status: WhatsAppConnectionStatus,
    identity?: { phone: string | null; displayName: string | null },
  ) => Promise<void> | void;
  onMessage: (message: IncomingWhatsAppMessage) => Promise<void> | void;
  onReceipt?: (receipt: {
    externalGroupId: string;
    externalMessageId: string;
    deliveredAt: string | null;
    readAt: string | null;
  }) => Promise<void> | void;
  /** Injeção restrita a testes; Baileys continua encapsulado neste adapter. */
  socketFactory?: typeof makeWASocket;
  linkPreviewBuilder?: (
    input: WhatsAppLinkPreviewInput,
  ) => Promise<WhatsAppBuiltLinkPreview | undefined>;
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (
    value &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof (value as any).toNumber === "function"
  ) {
    const parsed = (value as any).toNumber();
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function receiptTimestamp(value: unknown): string | null {
  const seconds = numericValue(value);
  if (seconds == null || seconds <= 0) return null;
  const date = new Date(seconds < 10_000_000_000 ? seconds * 1_000 : seconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function unwrapMessage(message?: proto.IMessage | null): proto.IMessage | null {
  let current = message ?? null;
  for (let index = 0; current && index < 5; index += 1) {
    const nested =
      current.ephemeralMessage?.message ??
      current.viewOnceMessage?.message ??
      current.viewOnceMessageV2?.message ??
      current.viewOnceMessageV2Extension?.message ??
      current.documentWithCaptionMessage?.message;
    if (!nested) break;
    current = nested;
  }
  return current;
}

export function normalizeBaileysMediaReference(
  message?: proto.Message.IImageMessage | null,
): NormalizedMediaReference | undefined {
  if (!message?.mediaKey) return undefined;
  const key = Buffer.from(message.mediaKey);
  if (key.length !== 32) return undefined;
  const directPath =
    typeof message.directPath === "string" &&
    message.directPath.startsWith("/") &&
    message.directPath.length <= 2048
      ? message.directPath
      : null;
  const url =
    typeof message.url === "string" &&
    message.url.startsWith("https://mmg.whatsapp.net/") &&
    message.url.length <= 4096
      ? message.url
      : null;
  if (!directPath && !url) return undefined;
  return {
    mediaType: "image",
    mediaKeyBase64: key.toString("base64"),
    directPath,
    url: directPath ? null : url,
  };
}

export function normalizeBaileysMessage(
  connectionId: string,
  item: proto.IWebMessageInfo,
): IncomingWhatsAppMessage | null {
  const externalGroupId = item.key?.remoteJid ?? "";
  if (!externalGroupId.endsWith("@g.us")) return null;
  const content = unwrapMessage(item.message);
  if (!content) return null;
  let type: WhatsAppMessageType = "unknown";
  let text: string | undefined;
  let media: WhatsAppMediaMetadata | undefined;
  let mediaRecoveryReference: NormalizedMediaReference | undefined;
  if (content.conversation != null || content.extendedTextMessage) {
    type = "text";
    text =
      content.conversation ?? content.extendedTextMessage?.text ?? undefined;
  } else if (content.imageMessage) {
    type = "image";
    text = content.imageMessage.caption ?? undefined;
    media = {
      mimeType: content.imageMessage.mimetype ?? undefined,
      caption: text,
      size: numericValue(content.imageMessage.fileLength),
      available: true,
    };
    mediaRecoveryReference = normalizeBaileysMediaReference(
      content.imageMessage,
    );
  } else if (content.videoMessage) {
    type = "video";
    text = content.videoMessage.caption ?? undefined;
    media = {
      mimeType: content.videoMessage.mimetype ?? undefined,
      caption: text,
      size: numericValue(content.videoMessage.fileLength),
      available: true,
    };
  } else if (content.documentMessage) {
    type = "document";
    text = content.documentMessage.caption ?? undefined;
    media = {
      mimeType: content.documentMessage.mimetype ?? undefined,
      fileName: content.documentMessage.fileName ?? undefined,
      caption: text,
      size: numericValue(content.documentMessage.fileLength),
      available: true,
    };
  } else if (content.audioMessage) {
    type = "audio";
    media = {
      mimeType: content.audioMessage.mimetype ?? undefined,
      size: numericValue(content.audioMessage.fileLength),
      available: true,
    };
  } else if (content.stickerMessage) {
    type = "sticker";
    media = {
      mimeType: content.stickerMessage.mimetype ?? undefined,
      size: numericValue(content.stickerMessage.fileLength),
      available: true,
    };
  }
  const seconds =
    numericValue(item.messageTimestamp) ?? Math.floor(Date.now() / 1000);
  return {
    connectionId,
    externalMessageId: item.key?.id ?? "",
    externalGroupId,
    senderExternalId: item.key?.participant ?? item.participant ?? undefined,
    fromMe: Boolean(item.key?.fromMe),
    type,
    text,
    links: [],
    media,
    mediaRecoveryReference,
    sentAt: new Date(seconds * 1000).toISOString(),
  };
}

function parseSnapshot(serialized: string | null): AuthSnapshot {
  if (!serialized) return { creds: initAuthCreds(), keys: {} };
  return JSON.parse(serialized, BufferJSON.reviver) as AuthSnapshot;
}

function serializeSnapshot(snapshot: AuthSnapshot): string {
  return JSON.stringify(snapshot, BufferJSON.replacer);
}

function phoneFromJid(jid?: string | null): string | null {
  if (!jid) return null;
  const value = jid.split(":")[0]?.split("@")[0];
  return value ? `+${value}` : null;
}

const MAX_OUTBOUND_IMAGE_BYTES = 8 * 1024 * 1024;
const OUTBOUND_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function dispatchFailure(
  errorCode: string,
  classification: WhatsAppDispatchFailure["classification"],
): WhatsAppDispatchFailure {
  return { success: false, errorCode, classification };
}

function providerErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    output?: { statusCode?: unknown };
    response?: { status?: unknown };
    data?: { statusCode?: unknown };
  };
  for (const candidate of [
    value.output?.statusCode,
    value.statusCode,
    value.response?.status,
    value.data?.statusCode,
    value.status,
  ]) {
    const parsed =
      typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function providerErrorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return "";
  const row = error as { message?: unknown; code?: unknown; data?: unknown };
  return [
    row.message,
    row.code,
    typeof row.data === "string" ? row.data : undefined,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function classifyGroupPreflightError(error: unknown): WhatsAppDispatchFailure {
  const status = providerErrorStatus(error);
  const text = providerErrorText(error);
  if (status === 401 || /logged.?out|not.?authorized|bad session/i.test(text)) {
    return dispatchFailure("WHATSAPP_CONNECTION_LOGGED_OUT", "permanent");
  }
  if (
    status === 403 ||
    /not (?:a )?participant|not.?member|forbidden/i.test(text)
  ) {
    return dispatchFailure("WHATSAPP_GROUP_NOT_MEMBER", "permanent");
  }
  if (
    status === 404 ||
    status === 410 ||
    /group.*(?:not found|unavailable)|gone/i.test(text)
  ) {
    return dispatchFailure("WHATSAPP_GROUP_UNAVAILABLE", "permanent");
  }
  return dispatchFailure(
    "WHATSAPP_GROUP_PREFLIGHT_TEMPORARILY_UNAVAILABLE",
    "transient",
  );
}

function classifySendError(error: unknown): WhatsAppDispatchFailure {
  const status = providerErrorStatus(error);
  const text = providerErrorText(error);
  if (status === 401 || /logged.?out|bad session/i.test(text)) {
    return dispatchFailure("WHATSAPP_CONNECTION_LOGGED_OUT", "permanent");
  }
  if (/not (?:a )?participant|not.?member/i.test(text)) {
    return dispatchFailure("WHATSAPP_GROUP_NOT_MEMBER", "permanent");
  }
  if (
    status === 403 ||
    /only admins?|send.*not allowed|forbidden/i.test(text)
  ) {
    return dispatchFailure("WHATSAPP_GROUP_SEND_NOT_ALLOWED", "permanent");
  }
  if (
    status === 404 ||
    status === 410 ||
    /group.*(?:not found|unavailable)|gone/i.test(text)
  ) {
    return dispatchFailure("WHATSAPP_GROUP_UNAVAILABLE", "permanent");
  }
  if (
    [400, 406, 413, 415, 422].includes(status ?? 0) ||
    /invalid (?:message|payload|media)|too large/i.test(text)
  ) {
    return dispatchFailure("WHATSAPP_INVALID_PAYLOAD", "permanent");
  }
  // Uma rejeição explícita por limite acontece antes de aceitação e pode aguardar.
  if (status === 429 || /rate.?limit|too many requests/i.test(text)) {
    return dispatchFailure("WHATSAPP_RATE_LIMITED", "transient");
  }
  // Depois de invocar sendMessage, timeout, queda de rede, 5xx e erros opacos não
  // provam ausência de envio. O recovery deve pedir revisão, não reenviar.
  return dispatchFailure("WHATSAPP_SEND_UNCERTAIN", "uncertain");
}

function normalizeComparableJid(value?: string | null): string | null {
  if (!value || !value.includes("@")) return null;
  const [local, server] = value.split("@");
  if (!local || !server) return null;
  return `${local.split(":")[0]}@${server}`;
}

function validateOutboundPayload(
  payload: WhatsAppOutboundPayload,
): WhatsAppDispatchFailure | null {
  if (payload.type === "text") {
    return payload.text.trim()
      ? null
      : dispatchFailure("WHATSAPP_INVALID_PAYLOAD", "permanent");
  }
  if (
    !(payload.image instanceof Uint8Array) ||
    payload.image.byteLength < 1 ||
    payload.image.byteLength > MAX_OUTBOUND_IMAGE_BYTES ||
    !OUTBOUND_IMAGE_MIME_TYPES.has(payload.mimeType)
  ) {
    return dispatchFailure("WHATSAPP_MEDIA_INVALID", "permanent");
  }
  return null;
}

function connectionReadinessFailure(
  status: WhatsAppConnectionStatus,
  socket: WASocket | null,
): WhatsAppDispatchFailure | null {
  if (status === "connected" && socket) return null;
  if (status === "connecting" || status === "reconnecting") {
    return dispatchFailure("WHATSAPP_CONNECTION_RECONNECTING", "transient");
  }
  if (status === "logged_out")
    return dispatchFailure("WHATSAPP_CONNECTION_LOGGED_OUT", "permanent");
  if (status === "qr_required")
    return dispatchFailure("WHATSAPP_CONNECTION_QR_REQUIRED", "permanent");
  if (status === "error")
    return dispatchFailure("WHATSAPP_CONNECTION_ERROR", "permanent");
  if (status === "disconnected")
    return dispatchFailure("WHATSAPP_CONNECTION_DISCONNECTED", "permanent");
  return dispatchFailure("WHATSAPP_SESSION_NOT_READY", "transient");
}

/**
 * Provider não oficial baseado no protocolo WhatsApp Web via Baileys.
 * Cada instância representa exatamente uma connection_id.
 */
export class WhatsAppWebProvider implements WhatsAppProvider {
  private readonly snapshot: AuthSnapshot;
  private socket: WASocket | null = null;
  private status: WhatsAppConnectionStatus = "disconnected";
  private intentionalClose = false;
  private destroyed = false;
  private retryCount = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private saveQueue = Promise.resolve();
  private readonly buildLinkPreview: (
    input: WhatsAppLinkPreviewInput,
  ) => Promise<WhatsAppBuiltLinkPreview | undefined>;
  private readonly mediaMessages = new Map<
    string,
    {
      message: proto.IWebMessageInfo;
      expiresAt: number;
      mimeType: string | null;
    }
  >();

  constructor(private readonly options: WhatsAppWebProviderOptions) {
    installSensitiveSessionLogFilter();
    installSocketRejectionGuard();
    this.snapshot = parseSnapshot(options.serializedSession);
    const previews = new WhatsAppLinkPreviewService();
    this.buildLinkPreview =
      options.linkPreviewBuilder ?? ((input) => previews.build(input));
  }

  private authState(): AuthenticationState {
    return {
      creds: this.snapshot.creds,
      keys: {
        get: async <T extends keyof SignalDataTypeMap>(
          type: T,
          ids: string[],
        ) => {
          const bucket = this.snapshot.keys[type] ?? {};
          return ids.reduce<Record<string, SignalDataTypeMap[T]>>(
            (result, id) => {
              const value = bucket[id] as SignalDataTypeMap[T] | undefined;
              if (value != null) result[id] = value;
              return result;
            },
            {},
          );
        },
        set: async (data: SignalDataSet) => {
          for (const [type, entries] of Object.entries(data)) {
            const bucket = this.snapshot.keys[type] ?? {};
            for (const [id, value] of Object.entries(entries ?? {})) {
              if (value == null) delete bucket[id];
              else bucket[id] = value;
            }
            this.snapshot.keys[type] = bucket;
          }
          await this.persist();
        },
      },
    };
  }

  private persist(): Promise<void> {
    const serialized = serializeSnapshot(this.snapshot);
    this.saveQueue = this.saveQueue
      .catch(() => undefined)
      .then(() => this.options.onSessionChange(serialized));
    return this.saveQueue;
  }

  private setStatus(
    status: WhatsAppConnectionStatus,
    identity?: { phone: string | null; displayName: string | null },
  ): void {
    this.status = status;
    void Promise.resolve(this.options.onStatus(status, identity)).catch(
      (error) => {
        console.error(
          `[AfiliHub:WhatsApp:${this.options.connectionId}] Falha ao persistir status.`,
          error,
        );
      },
    );
  }

  async connect(): Promise<AppResult<void>> {
    if (this.destroyed)
      return fail("WHATSAPP_PROVIDER_DESTROYED", "A conexão foi removida.");
    if (this.status === "connected") return WHATSAPP_ERRORS.ALREADY_CONNECTED();
    if (
      this.socket &&
      ["connecting", "qr_required", "reconnecting"].includes(this.status)
    )
      return ok(undefined);

    this.intentionalClose = false;
    this.setStatus(
      this.snapshot.creds.registered ? "reconnecting" : "connecting",
    );
    try {
      await this.startSocket();
      return ok(undefined);
    } catch (error) {
      this.setStatus("error");
      console.error(
        `[AfiliHub:WhatsApp:${this.options.connectionId}] Falha ao iniciar socket.`,
        error,
      );
      return WHATSAPP_ERRORS.QR_FAILED();
    }
  }

  private async startSocket(): Promise<void> {
    if (this.destroyed || this.intentionalClose) return;
    const socket = (this.options.socketFactory ?? makeWASocket)({
      auth: this.authState(),
      browser: Browsers.ubuntu("AfiliHub"),
      logger: pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "silent" }),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
    });
    this.socket = socket;

    socket.ev.on("creds.update", async (update) => {
      if (socket !== this.socket) return;
      Object.assign(this.snapshot.creds, update);
      await this.persist();
    });

    socket.ev.on("connection.update", (update) => {
      // Uma reconexão pode criar um novo socket antes que o anterior termine
      // de emitir os últimos eventos. Esses eventos antigos não representam o
      // estado atual da conexão e nunca podem rebaixar um socket já aberto para
      // `qr_required`/`reconnecting`.
      if (socket !== this.socket) return;
      if (update.qr) {
        this.setStatus("qr_required");
        void Promise.resolve(this.options.onQr(update.qr));
      }
      if (update.connection === "connecting" && this.status !== "qr_required") {
        this.setStatus(this.retryCount > 0 ? "reconnecting" : "connecting");
      }
      if (update.connection === "open") {
        this.retryCount = 0;
        const identity = {
          phone: phoneFromJid(socket.user?.id),
          displayName: socket.user?.name ?? null,
        };
        this.setStatus("connected", identity);
      }
      if (update.connection === "close") {
        this.socket = null;
        if (this.intentionalClose || this.destroyed) return;
        const statusCode = (update.lastDisconnect?.error as any)?.output
          ?.statusCode;
        if (
          statusCode === DisconnectReason.loggedOut ||
          statusCode === DisconnectReason.badSession
        ) {
          this.snapshot.creds.registered = false;
          this.snapshot.keys = {};
          this.setStatus("logged_out");
          void this.options.onSessionChange(null);
          return;
        }
        this.scheduleReconnect();
      }
    });

    // Um handler por instância de socket. Sockets antigos são encerrados antes da
    // reconexão e cada upsert "notify" é entregue uma vez ao pipeline da conexão.
    socket.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify" || socket !== this.socket) return;
      for (const item of messages) {
        const normalized = normalizeBaileysMessage(
          this.options.connectionId,
          item,
        );
        if (!normalized) continue;
        if (normalized.type === "image" && normalized.externalMessageId) {
          const key = `${normalized.externalGroupId}:${normalized.externalMessageId}`;
          this.mediaMessages.set(key, {
            message: item,
            expiresAt: Date.now() + 30 * 60_000,
            mimeType: normalized.media?.mimeType ?? null,
          });
          while (this.mediaMessages.size > 500)
            this.mediaMessages.delete(this.mediaMessages.keys().next().value!);
        }
        void Promise.resolve(this.options.onMessage(normalized)).catch(
          (error) => {
            console.error(
              `[AfiliHub:WhatsApp:${this.options.connectionId}] Falha isolada ao capturar mensagem.`,
              error,
            );
          },
        );
      }
    });

    // Baileys entrega receipts reais por mensagem/participante. Para Analytics
    // persistimos somente o primeiro timestamp por delivery; nenhum JID ou
    // identificador pessoal do participante sai deste adapter.
    socket.ev.on("message-receipt.update", (updates) => {
      if (socket !== this.socket || !this.options.onReceipt) return;
      for (const update of updates) {
        const externalGroupId = update.key.remoteJid;
        const externalMessageId = update.key.id;
        if (
          !externalGroupId?.endsWith("@g.us") ||
          !externalMessageId ||
          update.key.fromMe !== true
        ) continue;
        const deliveredAt = receiptTimestamp(update.receipt.receiptTimestamp);
        const readAt = receiptTimestamp(update.receipt.readTimestamp);
        if (!deliveredAt && !readAt) continue;
        void Promise.resolve(this.options.onReceipt({
          externalGroupId,
          externalMessageId,
          deliveredAt,
          readAt,
        })).catch((error) => {
          console.error(
            `[AfiliHub:WhatsApp:${this.options.connectionId}] Falha isolada ao persistir receipt.`,
            error,
          );
        });
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.intentionalClose || this.reconnectTimer) return;
    this.retryCount += 1;
    this.setStatus("reconnecting");
    const delay = Math.min(
      30_000,
      1_000 * 2 ** Math.min(this.retryCount - 1, 5),
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.startSocket().catch((error) => {
        console.error(
          `[AfiliHub:WhatsApp:${this.options.connectionId}] Reconexão falhou.`,
          error,
        );
        this.scheduleReconnect();
      });
    }, delay);
    this.reconnectTimer.unref?.();
  }

  async disconnect(): Promise<AppResult<void>> {
    if (this.status === "disconnected") return WHATSAPP_ERRORS.NOT_CONNECTED();
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.socket?.end(new Error("Desconectado pelo usuário no AfiliHub."));
    this.socket = null;
    this.setStatus("disconnected");
    return ok(undefined);
  }

  async destroy(revokeSession = false): Promise<void> {
    this.intentionalClose = true;
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (revokeSession && socket) {
      try {
        await socket.logout();
      } catch {
        socket.end(new Error("Conexão removida do AfiliHub."));
      }
    } else {
      socket?.end(new Error("Provider encerrado."));
    }
  }

  getConnectionStatus(): WhatsAppConnectionStatus {
    return this.status;
  }

  async getGroups(): Promise<AppResult<WhatsAppProviderGroup[]>> {
    if (this.status === "logged_out") return WHATSAPP_ERRORS.LOGGED_OUT();
    if (!this.socket || this.status !== "connected")
      return WHATSAPP_ERRORS.NOT_CONNECTED();
    try {
      const metadata = await this.socket.groupFetchAllParticipating();
      return ok(
        Object.values(metadata).map((group) => ({
          externalGroupId: group.id,
          name: group.subject || "Grupo sem nome",
          participantsCount: group.participants?.length ?? 0,
        })),
      );
    } catch (error) {
      console.error(
        `[AfiliHub:WhatsApp:${this.options.connectionId}] Falha ao buscar grupos.`,
        error,
      );
      return WHATSAPP_ERRORS.GROUP_SYNC_FAILED();
    }
  }

  private async inspectGroupWithSocket(
    socket: WASocket,
    externalGroupId: string,
  ): Promise<WhatsAppGroupSendPreflightResult> {
    if (!/^[^@\s]+@g\.us$/.test(externalGroupId)) {
      return dispatchFailure("WHATSAPP_INVALID_GROUP_ID", "permanent");
    }
    try {
      const metadata = await socket.groupMetadata(externalGroupId);
      if (!metadata?.id)
        return dispatchFailure("WHATSAPP_GROUP_UNAVAILABLE", "permanent");
      const ownIds = new Set(
        [
          normalizeComparableJid(socket.user?.id),
          normalizeComparableJid(socket.user?.jid),
          normalizeComparableJid(socket.user?.lid),
        ].filter((value): value is string => Boolean(value)),
      );
      const ownParticipant = metadata.participants?.find((participant) =>
        [participant.id, participant.jid, participant.lid].some((value) => {
          const normalized = normalizeComparableJid(value);
          return normalized ? ownIds.has(normalized) : false;
        }),
      );
      if (!ownParticipant)
        return dispatchFailure("WHATSAPP_GROUP_NOT_MEMBER", "permanent");
      const selfIsAdmin =
        ownParticipant.admin === "admin" ||
        ownParticipant.admin === "superadmin" ||
        ownParticipant.isAdmin === true ||
        ownParticipant.isSuperAdmin === true;
      if (metadata.announce === true && !selfIsAdmin) {
        return dispatchFailure("WHATSAPP_GROUP_SEND_NOT_ALLOWED", "permanent");
      }
      return {
        success: true,
        capability: {
          externalGroupId,
          name: metadata.subject || "Grupo sem nome",
          participantsCount: metadata.participants?.length ?? 0,
          announce: metadata.announce === true,
          selfIsAdmin,
        },
      };
    } catch (error) {
      return classifyGroupPreflightError(error);
    }
  }

  async inspectGroupSend(
    externalGroupId: string,
  ): Promise<WhatsAppGroupSendPreflightResult> {
    const socket = this.socket;
    const readiness = connectionReadinessFailure(this.status, socket);
    if (readiness) return readiness;
    return this.inspectGroupWithSocket(socket!, externalGroupId);
  }

  async sendGroupMessage(
    input: WhatsAppGroupSendInput,
  ): Promise<WhatsAppGroupSendResult> {
    const payloadFailure = validateOutboundPayload(input.payload);
    if (payloadFailure) return payloadFailure;
    if (
      input.idempotencyKey &&
      !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey)
    ) {
      return dispatchFailure("WHATSAPP_INVALID_IDEMPOTENCY_KEY", "permanent");
    }
    const socket = this.socket;
    const readiness = connectionReadinessFailure(this.status, socket);
    if (readiness) return readiness;
    const preflight = await this.inspectGroupWithSocket(
      socket!,
      input.externalGroupId,
    );
    if ("errorCode" in preflight) return preflight;
    if (socket !== this.socket || this.status !== "connected") {
      return dispatchFailure("WHATSAPP_CONNECTION_RECONNECTING", "transient");
    }
    try {
      let content;
      if (input.payload.type === "text") {
        let linkPreview: WAUrlInfo | undefined;
        if (input.payload.previewSourceUrl) {
          try {
            const built = await this.buildLinkPreview({
              text: input.payload.text,
              sourceUrl: input.payload.previewSourceUrl,
              affiliateUrl: input.payload.affiliateUrl ?? null,
              productTitle: input.payload.productTitle ?? null,
              description: input.payload.previewDescription ?? null,
            });
            if (built) {
              const { imageBytes, ...metadata } = built;
              linkPreview = metadata;
              if (imageBytes?.byteLength) {
                try {
                  let previewBytes = imageBytes;
                  if (input.payload.watermark?.enabled) {
                    const rendered = await applyImageWatermark(
                      imageBytes,
                      "",
                      input.payload.watermark,
                    );
                    previewBytes = rendered.bytes;
                    metadata.jpegThumbnail = Buffer.from(
                      await extractImageThumb(
                        Buffer.from(previewBytes),
                        400,
                      ).then((value) => value.buffer),
                    );
                    linkPreview = metadata;
                  }
                  const { imageMessage } = await prepareWAMessageMedia(
                    { image: Buffer.from(previewBytes) },
                    {
                      upload: socket!.waUploadToServer,
                      mediaTypeOverride: "thumbnail-link",
                    },
                  );
                  if (imageMessage) {
                    linkPreview = {
                      ...metadata,
                      jpegThumbnail: imageMessage.jpegThumbnail
                        ? Buffer.from(imageMessage.jpegThumbnail)
                        : metadata.jpegThumbnail,
                      highQualityThumbnail: imageMessage,
                    };
                  }
                } catch {
                  // Mantém a miniatura compacta quando o upload HQ falhar.
                }
              }
            }
          } catch {
            // A prévia é progressiva: sua falha nunca bloqueia o envio textual.
          }
        }
        content = linkPreview
          ? { text: input.payload.text, linkPreview }
          : { text: input.payload.text };
      } else {
        content = {
          image: Buffer.from(input.payload.image),
          caption: input.payload.caption,
          mimetype: input.payload.mimeType,
        };
      }
      const sent = await socket!.sendMessage(
        input.externalGroupId,
        content,
        input.idempotencyKey ? { messageId: input.idempotencyKey } : undefined,
      );
      const externalMessageId = sent?.key?.id;
      if (!externalMessageId) {
        return dispatchFailure(
          "WHATSAPP_EXTERNAL_MESSAGE_ID_MISSING",
          "uncertain",
        );
      }
      return { success: true, externalMessageId };
    } catch (error) {
      return classifySendError(error);
    }
  }

  async downloadMedia(reference: {
    externalGroupId: string;
    externalMessageId: string;
  }): Promise<{ bytes: Uint8Array; mimeType: string | null } | null> {
    const key = `${reference.externalGroupId}:${reference.externalMessageId}`;
    const cached = this.mediaMessages.get(key);
    if (!cached || cached.expiresAt < Date.now() || !this.socket) {
      this.mediaMessages.delete(key);
      return null;
    }
    try {
      const data = await downloadMediaMessage(
        cached.message,
        "buffer",
        {},
        {
          logger: pino({ level: "silent" }),
          reuploadRequest: this.socket.updateMediaMessage,
        },
      );
      return { bytes: new Uint8Array(data), mimeType: cached.mimeType };
    } catch {
      return null;
    }
  }

  async downloadMediaReference(
    reference: NormalizedMediaReference,
  ): Promise<
    | { success: true; bytes: Uint8Array; mimeType: string | null }
    | { success: false; errorCode: string; transient: boolean }
  > {
    try {
      const mediaKey = Buffer.from(reference.mediaKeyBase64, "base64");
      if (mediaKey.length !== 32 || (!reference.directPath && !reference.url))
        return {
          success: false,
          errorCode: "WHATSAPP_MEDIA_INVALID_REFERENCE",
          transient: false,
        };
      const stream = await downloadContentFromMessage(
        {
          mediaKey,
          directPath: reference.directPath ?? undefined,
          url: reference.url ?? undefined,
        },
        reference.mediaType,
      );
      const chunks: Buffer[] = [];
      let size = 0;
      let timeout: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          (async () => {
            for await (const chunk of stream) {
              const bytes = Buffer.from(chunk);
              size += bytes.length;
              if (size > 8 * 1024 * 1024) {
                (stream as any).destroy?.();
                throw new Error("WHATSAPP_MEDIA_TOO_LARGE");
              }
              chunks.push(bytes);
            }
          })(),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              (stream as any).destroy?.();
              reject(new Error("WHATSAPP_MEDIA_TIMEOUT"));
            }, 15_000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
      }
      return {
        success: true,
        bytes: new Uint8Array(Buffer.concat(chunks)),
        mimeType: null,
      };
    } catch (error) {
      const row = error as { response?: { status?: number }; message?: string };
      const status = row.response?.status;
      const message = row.message ?? "";
      if (status === 404 || status === 410)
        return {
          success: false,
          errorCode: "WHATSAPP_MEDIA_UNAVAILABLE",
          transient: false,
        };
      if (message.includes("TOO_LARGE"))
        return {
          success: false,
          errorCode: "WHATSAPP_MEDIA_TOO_LARGE",
          transient: false,
        };
      if (/bad mac/i.test(message))
        return {
          success: false,
          errorCode: "WHATSAPP_MEDIA_BAD_MAC",
          transient: true,
        };
      if (
        /timeout|network|ECONN|fetch|5\d\d/i.test(message) ||
        Number(status) >= 500
      )
        return {
          success: false,
          errorCode: "WHATSAPP_MEDIA_TEMPORARILY_UNAVAILABLE",
          transient: true,
        };
      return {
        success: false,
        errorCode: "WHATSAPP_MEDIA_DOWNLOAD_FAILED",
        transient: false,
      };
    }
  }
}
