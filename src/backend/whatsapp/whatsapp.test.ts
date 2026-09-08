import { beforeEach, describe, expect, it } from "vitest";
import { fail, ok, type AppResult } from "../../domain/errors";
import type { WhatsAppProvider } from "../../domain/whatsapp/WhatsAppProvider";
import type {
  WhatsAppConnection,
  WhatsAppConnectionStatus,
  WhatsAppGroup,
  WhatsAppProviderGroup,
} from "../../domain/whatsapp/types";
import { WhatsAppService } from "../../services/whatsappService";
import { WhatsAppConnectionManager } from "./WhatsAppConnectionManager";
import type { ConnectionUpdate, WhatsAppRepository } from "./repository";
import { decryptSession, encryptSession } from "./sessionCrypto";
import {
  normalizeBaileysMessage,
  type WhatsAppWebProviderOptions,
} from "./WhatsAppWebProvider";
import type { IncomingWhatsAppMessage } from "../../domain/monitoring/types";

class MemoryRepository implements WhatsAppRepository {
  connections = new Map<string, WhatsAppConnection>();
  sessions = new Map<string, string>();
  groups = new Map<string, WhatsAppGroup>();
  private nextConnection = 1;
  private nextGroup = 1;

  async countConnections(userId: string) {
    return [...this.connections.values()].filter(
      (item) => item.userId === userId,
    ).length;
  }

  async createConnection(userId: string, label: string) {
    if ((await this.countConnections(userId)) >= 5)
      throw new Error("WHATSAPP_CONNECTION_LIMIT_REACHED");
    const now = new Date().toISOString();
    const connection: WhatsAppConnection = {
      id: `connection-${this.nextConnection++}`,
      userId,
      label,
      phone: null,
      displayName: null,
      status: "disconnected",
      connectedAt: null,
      lastSeenAt: null,
      groupsCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.connections.set(connection.id, connection);
    return { ...connection };
  }

  async listConnections(userId: string) {
    return [...this.connections.values()]
      .filter((item) => item.userId === userId)
      .map((item) => ({ ...item }));
  }

  async getConnection(id: string) {
    const connection = this.connections.get(id);
    return connection ? { ...connection } : null;
  }

  async updateConnection(id: string, update: ConnectionUpdate) {
    const current = this.connections.get(id);
    if (!current) throw new Error("not found");
    this.connections.set(id, {
      ...current,
      ...(update.status !== undefined ? { status: update.status } : {}),
      ...(update.phone !== undefined ? { phone: update.phone } : {}),
      ...(update.displayName !== undefined
        ? { displayName: update.displayName }
        : {}),
      ...(update.connectedAt !== undefined
        ? { connectedAt: update.connectedAt }
        : {}),
      ...(update.lastSeenAt !== undefined
        ? { lastSeenAt: update.lastSeenAt }
        : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteConnection(id: string) {
    this.connections.delete(id);
    for (const [key, group] of this.groups)
      if (group.connectionId === id) this.groups.delete(key);
  }

  async listRestorableConnections() {
    return [...this.connections.values()].filter((item) =>
      this.sessions.has(item.id),
    );
  }

  async getEncryptedSession(connectionId: string) {
    return this.sessions.get(connectionId) ?? null;
  }
  async saveEncryptedSession(connectionId: string, state: string) {
    this.sessions.set(connectionId, state);
  }
  async deleteSession(connectionId: string) {
    this.sessions.delete(connectionId);
  }

  async listGroups(userId: string, connectionId?: string) {
    return [...this.groups.values()]
      .filter(
        (group) =>
          group.userId === userId &&
          (!connectionId || group.connectionId === connectionId),
      )
      .map((group) => ({ ...group }));
  }

  async syncGroups(
    userId: string,
    connectionId: string,
    incoming: WhatsAppProviderGroup[],
  ) {
    const now = new Date().toISOString();
    for (const [key, group] of this.groups) {
      if (group.userId === userId && group.connectionId === connectionId) {
        this.groups.set(key, { ...group, syncStatus: "unavailable" });
      }
    }
    for (const group of incoming) {
      const key = `${connectionId}:${group.externalGroupId}`;
      const current = this.groups.get(key);
      this.groups.set(key, {
        id: current?.id ?? `group-${this.nextGroup++}`,
        userId,
        connectionId,
        externalGroupId: group.externalGroupId,
        name: group.name,
        participantsCount: group.participantsCount,
        syncStatus: "active",
        lastSyncedAt: now,
        connectionLabel: this.connections.get(connectionId)?.label,
      });
    }
    return this.listGroups(userId, connectionId);
  }

  async recordEvent() {}
  async recordDeliveryReceipt() { return true; }
  async markReceiptTrackingStarted() { return true; }
  async recordLog() {}
}

class FakeProvider implements WhatsAppProvider {
  status: WhatsAppConnectionStatus = "disconnected";
  groups: WhatsAppProviderGroup[] = [];

  constructor(
    private readonly options: WhatsAppWebProviderOptions,
    private readonly shouldFail = false,
    private readonly qrOnly = false,
  ) {}

  async connect(): Promise<AppResult<void>> {
    this.status = "connecting";
    await this.options.onStatus("connecting");
    if (this.shouldFail) {
      this.status = "error";
      await this.options.onStatus("error");
      return fail("FAKE_FAILURE", "Falha isolada.");
    }
    await this.options.onQr(`qr-${this.options.connectionId}`);
    this.status = "qr_required";
    await this.options.onStatus("qr_required");
    if (this.qrOnly) return ok(undefined);
    this.status = "connected";
    await this.options.onStatus("connected", {
      phone: "+5511999999999",
      displayName: "Teste",
    });
    return ok(undefined);
  }

  async disconnect() {
    this.status = "disconnected" as const;
    await this.options.onStatus("disconnected");
    return ok(undefined);
  }

  async destroy() {
    this.status = "disconnected";
  }
  getConnectionStatus() {
    return this.status;
  }
  async getGroups() {
    return ok(this.groups);
  }
  async emit(message: IncomingWhatsAppMessage) {
    await this.options.onMessage(message);
  }
}

function setup(failId?: string, qrOnlyId?: string) {
  const repository = new MemoryRepository();
  const providers = new Map<string, FakeProvider>();
  const providerHistory: FakeProvider[] = [];
  const manager = new WhatsAppConnectionManager(repository, (options) => {
    const provider = new FakeProvider(
      options,
      options.connectionId === failId,
      options.connectionId === qrOnlyId,
    );
    providers.set(options.connectionId, provider);
    providerHistory.push(provider);
    return provider;
  });
  const service = new WhatsAppService(repository, manager);
  return { repository, providers, providerHistory, manager, service };
}

beforeEach(() => {
  process.env.WHATSAPP_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
    "base64",
  );
});

describe("limite e remoção", () => {
  it("permite de zero a cinco conexões e bloqueia a sexta no backend", async () => {
    const { service } = setup();
    for (let index = 0; index < 5; index += 1) {
      expect(
        (await service.createUserConnection("user-a", `WhatsApp ${index + 1}`))
          .success,
      ).toBe(true);
    }
    const sixth = await service.createUserConnection("user-a", "WhatsApp 6");
    expect(sixth.success).toBe(false);
    if ("error" in sixth)
      expect(sixth.error.code).toBe("WHATSAPP_CONNECTION_LIMIT_REACHED");
  });

  it("libera uma vaga depois de remover uma conexão", async () => {
    const { service } = setup();
    const created: WhatsAppConnection[] = [];
    for (let index = 0; index < 5; index += 1) {
      const result = await service.createUserConnection(
        "user-a",
        `WhatsApp ${index + 1}`,
      );
      if ("data" in result) created.push(result.data);
    }
    expect(
      (await service.deleteUserConnection("user-a", created[0].id)).success,
    ).toBe(true);
    expect(
      (await service.createUserConnection("user-a", "Substituta")).success,
    ).toBe(true);
  });
});

describe("ownership", () => {
  it("impede o usuário A de acessar a conexão do usuário B", async () => {
    const { service } = setup();
    const created = await service.createUserConnection("user-b", "Privada");
    if (!("data" in created)) throw new Error("setup falhou");
    const result = await service.getUserConnection("user-a", created.data.id);
    expect(result.success).toBe(false);
    if ("error" in result)
      expect(result.error.code).toBe("WHATSAPP_CONNECTION_FORBIDDEN");
  });
});

describe("connection manager", () => {
  it("renova o provider quando o QR anterior expirou", async () => {
    const { service, providerHistory, manager } = setup(undefined, "connection-1");
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");

    await service.connectUserWhatsApp("user-a", created.data.id);
    expect(manager.get(created.data.id)?.getConnectionStatus()).toBe(
      "qr_required",
    );

    await service.connectUserWhatsApp("user-a", created.data.id);
    expect(providerHistory).toHaveLength(2);
    expect(providerHistory[0].status).toBe("disconnected");
    expect(providerHistory[1].status).toBe("qr_required");
  });

  it("prioriza o status do provider vivo sobre um status persistido antigo", async () => {
    const { service, repository } = setup();
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", created.data.id);
    await repository.updateConnection(created.data.id, { status: "qr_required" });

    const listed = await service.listUserConnections("user-a");
    expect(listed).toMatchObject({
      success: true,
      data: [{ id: created.data.id, status: "connected" }],
    });
  });

  it("mantém providers independentes quando uma conexão falha", async () => {
    const { service, manager } = setup("connection-1");
    const a = await service.createUserConnection("user-a", "A");
    const b = await service.createUserConnection("user-a", "B");
    if (!("data" in a) || !("data" in b)) throw new Error("setup falhou");
    expect(
      (await service.connectUserWhatsApp("user-a", a.data.id)).success,
    ).toBe(false);
    expect(
      (await service.connectUserWhatsApp("user-a", b.data.id)).success,
    ).toBe(true);
    expect(manager.size()).toBe(2);
    expect(manager.get(b.data.id)?.getConnectionStatus()).toBe("connected");
  });

  it("persiste transições e identidade da conexão correta", async () => {
    const { service, repository } = setup();
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", created.data.id);
    const persisted = await repository.getConnection(created.data.id);
    expect(persisted).toMatchObject({
      status: "connected",
      phone: "+5511999999999",
      displayName: "Teste",
    });
  });

  it("mantém um único provider/listener após connect e restore", async () => {
    const repository = new MemoryRepository();
    const providers: FakeProvider[] = [];
    let delivered = 0;
    const manager = new WhatsAppConnectionManager(
      repository,
      (options) => {
        const provider = new FakeProvider(options);
        providers.push(provider);
        return provider;
      },
      async () => {
        delivered += 1;
      },
    );
    const service = new WhatsAppService(repository, manager);
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", created.data.id);
    await manager.restore(created.data);
    await providers[0].emit({
      connectionId: created.data.id,
      externalMessageId: "message-1",
      externalGroupId: "group@g.us",
      fromMe: false,
      type: "text",
      text: "teste",
      links: [],
      sentAt: new Date().toISOString(),
    });
    expect(providers).toHaveLength(1);
    expect(delivered).toBe(1);
  });

  it("reconstrói o provider do zero após sessão encerrada", async () => {
    const repository = new MemoryRepository();
    const providers: FakeProvider[] = [];
    const manager = new WhatsAppConnectionManager(repository, (options) => {
      const provider = new FakeProvider(options);
      providers.push(provider);
      return provider;
    });
    const service = new WhatsAppService(repository, manager);
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", created.data.id);
    providers[0].status = "logged_out";
    repository.sessions.set(created.data.id, "sessão-residual");

    const result = await service.connectUserWhatsApp("user-a", created.data.id);

    expect(result.success).toBe(true);
    expect(providers).toHaveLength(2);
    expect(providers[0].status).toBe("disconnected");
    expect(manager.get(created.data.id)).toBe(providers[1]);
    expect(repository.sessions.has(created.data.id)).toBe(false);
  });

  it("isola erro do banco de captura e mantém a conexão ativa", async () => {
    const repository = new MemoryRepository();
    let provider: FakeProvider | undefined;
    const manager = new WhatsAppConnectionManager(
      repository,
      (options) => {
        provider = new FakeProvider(options);
        return provider;
      },
      async () => {
        throw new Error("database unavailable");
      },
    );
    const service = new WhatsAppService(repository, manager);
    const created = await service.createUserConnection("user-a", "Principal");
    if (!("data" in created)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", created.data.id);
    await expect(
      provider!.emit({
        connectionId: created.data.id,
        externalMessageId: "message-1",
        externalGroupId: "group@g.us",
        fromMe: false,
        type: "text",
        text: "teste",
        links: [],
        sentAt: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined();
    expect(provider!.getConnectionStatus()).toBe("connected");
  });
});

describe("grupos", () => {
  it("deduplica por conexão, preserva isolamento e marca ausentes como indisponíveis", async () => {
    const { service, providers } = setup();
    const a = await service.createUserConnection("user-a", "A");
    const b = await service.createUserConnection("user-a", "B");
    if (!("data" in a) || !("data" in b)) throw new Error("setup falhou");
    await service.connectUserWhatsApp("user-a", a.data.id);
    await service.connectUserWhatsApp("user-a", b.data.id);
    providers.get(a.data.id)!.groups = [
      { externalGroupId: "same@g.us", name: "Grupo A", participantsCount: 10 },
      {
        externalGroupId: "same@g.us",
        name: "Grupo A atualizado",
        participantsCount: 11,
      },
    ];
    providers.get(b.data.id)!.groups = [
      { externalGroupId: "same@g.us", name: "Grupo B", participantsCount: 20 },
    ];
    const syncedA = await service.syncConnectionGroups("user-a", a.data.id);
    const syncedB = await service.syncConnectionGroups("user-a", b.data.id);
    expect("data" in syncedA && syncedA.data).toHaveLength(1);
    expect("data" in syncedB && syncedB.data).toHaveLength(1);
    expect("data" in syncedA && syncedA.data[0].participantsCount).toBe(11);

    providers.get(a.data.id)!.groups = [];
    const unavailable = await service.syncConnectionGroups("user-a", a.data.id);
    expect("data" in unavailable && unavailable.data[0].syncStatus).toBe(
      "unavailable",
    );
  });
});

describe("criptografia de sessão", () => {
  it("usa AES-GCM e rejeita adulteração", () => {
    const encrypted = encryptSession('{"registered":true}');
    expect(encrypted).not.toContain("registered");
    expect(decryptSession(encrypted)).toBe('{"registered":true}');
    expect(() => decryptSession(`${encrypted.slice(0, -2)}aa`)).toThrow();
  });
});

describe("normalização do provider", () => {
  it("normaliza texto de grupo sem vazar o payload da biblioteca", () => {
    const normalized = normalizeBaileysMessage("connection-1", {
      key: {
        id: "external-1",
        remoteJid: "group@g.us",
        participant: "sender@s.whatsapp.net",
        fromMe: false,
      },
      messageTimestamp: 1_777_000_000,
      message: { conversation: "Mensagem real" },
    } as any);
    expect(normalized).toMatchObject({
      connectionId: "connection-1",
      externalMessageId: "external-1",
      externalGroupId: "group@g.us",
      senderExternalId: "sender@s.whatsapp.net",
      fromMe: false,
      type: "text",
      text: "Mensagem real",
    });
    expect(normalized).not.toHaveProperty("message");
  });

  it("normaliza imagem com caption e apenas metadados básicos", () => {
    const normalized = normalizeBaileysMessage("connection-1", {
      key: { id: "external-2", remoteJid: "group@g.us", fromMe: false },
      messageTimestamp: 1_777_000_000,
      message: {
        imageMessage: {
          caption: "Legenda",
          mimetype: "image/jpeg",
          fileLength: 2048,
          url: "não persistir",
        },
      },
    } as any);
    expect(normalized).toMatchObject({
      type: "image",
      text: "Legenda",
      media: {
        caption: "Legenda",
        mimeType: "image/jpeg",
        size: 2048,
        available: true,
      },
    });
    expect(normalized?.media).not.toHaveProperty("url");
  });

  it("extrai referência mínima de recuperação sem persistir o objeto Baileys", () => {
    const key = Buffer.alloc(32, 11);
    const normalized = normalizeBaileysMessage("connection-1", {
      key: { id: "external-3", remoteJid: "group@g.us", fromMe: false },
      messageTimestamp: 1_777_000_000,
      message: {
        imageMessage: {
          caption: "Oferta",
          mimetype: "image/jpeg",
          mediaKey: key,
          directPath: "/v/t62/recoverable",
          url: "https://mmg.whatsapp.net/ignored-when-direct-path-exists",
          fileSha256: Buffer.alloc(32, 1),
          fileEncSha256: Buffer.alloc(32, 2),
        },
      },
    } as any);
    expect(normalized?.mediaRecoveryReference).toEqual({
      mediaType: "image",
      mediaKeyBase64: key.toString("base64"),
      directPath: "/v/t62/recoverable",
      url: null,
    });
    expect(normalized?.media).not.toHaveProperty("mediaKey");
    expect(normalized).not.toHaveProperty("fileSha256");
    expect(normalized).not.toHaveProperty("message");
  });

  it("descarta conversa privada, status e broadcast antes do serviço", () => {
    for (const remoteJid of [
      "person@s.whatsapp.net",
      "status@broadcast",
      "list@broadcast",
    ]) {
      expect(
        normalizeBaileysMessage("connection-1", {
          key: { id: "external", remoteJid, fromMe: false },
          message: { conversation: "privada" },
        } as any),
      ).toBeNull();
    }
  });
});
