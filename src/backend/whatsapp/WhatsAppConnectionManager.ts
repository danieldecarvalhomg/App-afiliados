import type { AppResult } from "../../domain/errors";
import { fail, ok, WHATSAPP_ERRORS } from "../../domain/errors";
import type { WhatsAppProvider } from "../../domain/whatsapp/WhatsAppProvider";
import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppGroupSendInput,
  WhatsAppGroupSendPreflightResult,
  WhatsAppGroupSendResult,
  WhatsAppProviderGroup,
} from "../../domain/whatsapp/types";
import { decryptSession, encryptSession } from "./sessionCrypto";
import { whatsAppEventBus } from "./eventBus";
import type { WhatsAppRepository } from "./repository";
import { WhatsAppWebProvider } from "./WhatsAppWebProvider";
import type { IncomingWhatsAppMessage } from "../../domain/monitoring/types";
import type {
  NormalizedMediaReference,
  WhatsAppReferenceDownloader,
} from "../../domain/whatsapp/mediaReferences";

export type ProviderFactory = (
  options: ConstructorParameters<typeof WhatsAppWebProvider>[0],
) => WhatsAppProvider;

export class WhatsAppConnectionManager implements WhatsAppReferenceDownloader {
  private readonly providers = new Map<string, WhatsAppProvider>();
  private readonly connectionOperations = new Map<
    string,
    Promise<AppResult<void>>
  >();

  constructor(
    private readonly repository: WhatsAppRepository,
    private readonly providerFactory: ProviderFactory = (options) =>
      new WhatsAppWebProvider(options),
    private readonly incomingMessageHandler?: (
      userId: string,
      message: IncomingWhatsAppMessage,
    ) => Promise<void>,
  ) {}

  get(connectionId: string): WhatsAppProvider | undefined {
    return this.providers.get(connectionId);
  }

  size(): number {
    return this.providers.size;
  }

  private async build(
    connection: WhatsAppConnection,
  ): Promise<WhatsAppProvider> {
    const encrypted = await this.repository.getEncryptedSession(connection.id);
    const serializedSession = encrypted ? decryptSession(encrypted) : null;
    const provider = this.providerFactory({
      connectionId: connection.id,
      serializedSession,
      onSessionChange: async (serialized) => {
        if (serialized) {
          await this.repository.saveEncryptedSession(
            connection.id,
            encryptSession(serialized),
          );
        } else {
          await this.repository.deleteSession(connection.id);
        }
      },
      onQr: async (qr) => {
        whatsAppEventBus.publish(connection.userId, {
          type: "qr.updated",
          connectionId: connection.id,
          data: { qr },
        });
        await this.repository.recordEvent(
          connection.userId,
          "whatsapp.qr.generated",
          connection.id,
        );
      },
      onStatus: async (status, identity) => {
        const now = new Date().toISOString();
        await this.repository.updateConnection(connection.id, {
          status,
          phone: identity?.phone,
          displayName: identity?.displayName,
          connectedAt: status === "connected" ? now : undefined,
          lastSeenAt: status === "connected" ? now : undefined,
        });
        whatsAppEventBus.publish(connection.userId, {
          type: "connection.updated",
          connectionId: connection.id,
          data: { status, ...identity },
        });
        const eventName: Partial<Record<WhatsAppConnectionStatus, string>> = {
          connected: "whatsapp.connected",
          reconnecting: "whatsapp.reconnecting",
          disconnected: "whatsapp.disconnected",
          logged_out: "whatsapp.logged_out",
        };
        if (eventName[status]) {
          await this.repository.recordEvent(
            connection.userId,
            eventName[status]!,
            connection.id,
          );
        }
        if (status === "connected") {
          await this.repository.markReceiptTrackingStarted(
            connection.userId,
            connection.id,
          );
          await this.repository.recordLog(
            connection.userId,
            `WhatsApp "${connection.label}" conectado.`,
            "success",
          );
        } else if (status === "disconnected") {
          await this.repository.recordLog(
            connection.userId,
            `WhatsApp "${connection.label}" desconectado.`,
          );
        } else if (status === "logged_out") {
          await this.repository.recordLog(
            connection.userId,
            `Sessão do WhatsApp "${connection.label}" encerrada.`,
            "warning",
          );
        }
      },
      onMessage: async (message) => {
        if (!this.incomingMessageHandler) return;
        try {
          await this.incomingMessageHandler(connection.userId, message);
        } catch (error) {
          // A captura nunca pode encerrar o socket nem contaminar outra conexão.
          console.error(
            `[AfiliHub:WhatsApp:${connection.id}] Pipeline de monitoramento falhou.`,
            error,
          );
        }
      },
      onReceipt: async (receipt) => {
        try {
          await this.repository.recordDeliveryReceipt({
            userId: connection.userId,
            connectionId: connection.id,
            ...receipt,
          });
        } catch (error) {
          // Receipt é telemetria progressiva: sua falha não pode derrubar o
          // socket nem contaminar o envio já confirmado.
          console.error(
            `[AfiliHub:WhatsApp:${connection.id}] Persistência de receipt falhou.`,
            error,
          );
        }
      },
    });
    this.providers.set(connection.id, provider);
    return provider;
  }

  private async connectUnlocked(
    connection: WhatsAppConnection,
  ): Promise<AppResult<void>> {
    try {
      let provider = this.providers.get(connection.id);
      if (
        provider &&
        ["logged_out", "error"].includes(provider.getConnectionStatus())
      ) {
        whatsAppEventBus.clearLatestQr(connection.userId, connection.id);
        await provider.destroy(false);
        this.providers.delete(connection.id);
        await this.repository.deleteSession(connection.id);
        provider = undefined;
      }
      // QR Codes expiram e o provider não reinicia um socket que continua em
      // `qr_required`. Recriar apenas nesse estado evita que a UI fique presa
      // em “Aguardando QR” sem um QR válido, além de garantir que o socket
      // anterior não continue emitindo eventos para a conexão atual.
      if (provider?.getConnectionStatus() === "qr_required") {
        whatsAppEventBus.clearLatestQr(connection.userId, connection.id);
        await provider.destroy(false);
        this.providers.delete(connection.id);
        provider = undefined;
      }
      provider ??= await this.build(connection);
      return provider.connect();
    } catch (error) {
      console.error(
        `[AfiliHub:WhatsApp:${connection.id}] Falha ao criar provider.`,
        error,
      );
      return WHATSAPP_ERRORS.SESSION_RESTORE_FAILED();
    }
  }

  async connect(connection: WhatsAppConnection): Promise<AppResult<void>> {
    const current = this.connectionOperations.get(connection.id);
    if (current) return current;

    const operation = this.connectUnlocked(connection).finally(() => {
      if (this.connectionOperations.get(connection.id) === operation) {
        this.connectionOperations.delete(connection.id);
      }
    });
    this.connectionOperations.set(connection.id, operation);
    return operation;
  }

  private async providerForDispatch(
    connectionId: string,
  ): Promise<WhatsAppProvider | undefined> {
    const current = this.providers.get(connectionId);
    if (current) return current;

    try {
      const connection = await this.repository.getConnection(connectionId);
      if (
        !connection ||
        !["connected", "connecting", "reconnecting"].includes(
          connection.status,
        )
      ) {
        return undefined;
      }
      const restored = await this.restore(connection);
      return restored.success ? this.providers.get(connectionId) : undefined;
    } catch {
      return undefined;
    }
  }

  async restore(connection: WhatsAppConnection): Promise<AppResult<void>> {
    try {
      await this.repository.updateConnection(connection.id, {
        status: "reconnecting",
      });
      return await this.connect({ ...connection, status: "reconnecting" });
    } catch (error) {
      await this.repository
        .updateConnection(connection.id, { status: "error" })
        .catch(() => undefined);
      console.error(
        `[AfiliHub:WhatsApp:${connection.id}] Restauração isolada falhou.`,
        error,
      );
      return WHATSAPP_ERRORS.SESSION_RESTORE_FAILED();
    }
  }

  async restoreAll(): Promise<void> {
    let connections: WhatsAppConnection[];
    try {
      connections = await this.repository.listRestorableConnections();
    } catch (error) {
      console.error(
        "[AfiliHub:WhatsApp] Não foi possível listar sessões recuperáveis.",
        error,
      );
      return;
    }
    const results = await Promise.allSettled(
      connections.map((connection) => this.restore(connection)),
    );
    results.forEach((result, index) => {
      if (result.status === "rejected" || !result.value.success) {
        console.error(
          `[AfiliHub:WhatsApp:${connections[index].id}] Sessão não restaurada.`,
        );
      }
    });
  }

  async disconnect(connectionId: string): Promise<AppResult<void>> {
    const provider = this.providers.get(connectionId);
    if (!provider) return WHATSAPP_ERRORS.NOT_CONNECTED();
    return provider.disconnect();
  }

  async remove(connectionId: string): Promise<void> {
    const provider = this.providers.get(connectionId);
    this.providers.delete(connectionId);
    if (provider) await provider.destroy(true);
  }

  async getGroups(
    connectionId: string,
  ): Promise<AppResult<WhatsAppProviderGroup[]>> {
    const provider = this.providers.get(connectionId);
    if (!provider) return WHATSAPP_ERRORS.NOT_CONNECTED();
    return provider.getGroups();
  }

  async inspectGroupSend(
    connectionId: string,
    externalGroupId: string,
  ): Promise<WhatsAppGroupSendPreflightResult> {
    const provider = await this.providerForDispatch(connectionId);
    if (!provider) {
      return {
        success: false,
        errorCode: "WHATSAPP_SESSION_NOT_READY",
        classification: "transient",
      };
    }
    if (!provider.inspectGroupSend) {
      return {
        success: false,
        errorCode: "WHATSAPP_GROUP_PREFLIGHT_UNSUPPORTED",
        classification: "permanent",
      };
    }
    try {
      return await provider.inspectGroupSend(externalGroupId);
    } catch {
      return {
        success: false,
        errorCode: "WHATSAPP_GROUP_PREFLIGHT_FAILED",
        classification: "transient",
      };
    }
  }

  async sendGroupMessage(
    input: WhatsAppGroupSendInput & { connectionId: string },
  ): Promise<WhatsAppGroupSendResult> {
    const provider = await this.providerForDispatch(input.connectionId);
    if (!provider) {
      return {
        success: false,
        errorCode: "WHATSAPP_SESSION_NOT_READY",
        classification: "transient",
      };
    }
    if (!provider.sendGroupMessage) {
      return {
        success: false,
        errorCode: "WHATSAPP_SEND_UNSUPPORTED",
        classification: "permanent",
      };
    }
    try {
      return await provider.sendGroupMessage({
        externalGroupId: input.externalGroupId,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
      });
    } catch {
      // O provider pode ter falhado depois de iniciar I/O. Sem resultado
      // normalizado, retry automático seria inseguro.
      return {
        success: false,
        errorCode: "WHATSAPP_SEND_RESULT_UNKNOWN",
        classification: "uncertain",
      };
    }
  }

  async downloadMedia(input: {
    connectionId: string;
    externalGroupId: string;
    externalMessageId: string;
  }) {
    const provider = this.providers.get(input.connectionId);
    if (!provider?.downloadMedia) return null;
    return provider.downloadMedia({
      externalGroupId: input.externalGroupId,
      externalMessageId: input.externalMessageId,
    });
  }

  async downloadReference(input: {
    connectionId: string;
    externalGroupId: string;
    externalMessageId: string;
    reference: NormalizedMediaReference;
  }) {
    const provider = this.providers.get(input.connectionId);
    if (!provider)
      return {
        success: false as const,
        errorCode: "WHATSAPP_SESSION_NOT_READY",
        transient: true,
      };
    const cached = await provider.downloadMedia?.({
      externalGroupId: input.externalGroupId,
      externalMessageId: input.externalMessageId,
    });
    if (cached) return { success: true as const, ...cached };
    if (!provider.downloadMediaReference)
      return {
        success: false as const,
        errorCode: "WHATSAPP_MEDIA_REFERENCE_UNSUPPORTED",
        transient: false,
      };
    return provider.downloadMediaReference(input.reference);
  }

  async stopAll(): Promise<void> {
    const providers = [...this.providers.values()];
    this.providers.clear();
    await Promise.allSettled(
      providers.map((provider) => provider.destroy(false)),
    );
  }
}
