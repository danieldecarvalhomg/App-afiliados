import { describe, expect, it, vi } from "vitest";
import { WhatsAppWebProvider } from "./WhatsAppWebProvider";

const GROUP_ID = "120363000000000000@g.us";
const SELF_ID = "5511999999999@s.whatsapp.net";

function harness(
  overrides: Record<string, unknown> = {},
  linkPreviewBuilder?: (input: any) => Promise<any>,
  onReceipt = vi.fn(),
) {
  const listeners = new Map<string, Array<(value: any) => void>>();
  const ev = {
    on: vi.fn((name: string, listener: (value: any) => void) => {
      listeners.set(name, [...(listeners.get(name) ?? []), listener]);
    }),
  };
  const socket = {
    ev,
    user: {
      id: `5511999999999:12@s.whatsapp.net`,
      jid: SELF_ID,
      name: "AfiliHub Teste",
    },
    groupMetadata: vi.fn().mockResolvedValue({
      id: GROUP_ID,
      subject: "Ofertas",
      announce: false,
      participants: [{ id: SELF_ID, jid: SELF_ID, admin: null }],
    }),
    sendMessage: vi.fn().mockResolvedValue({ key: { id: "REAL-WHATSAPP-ID" } }),
    end: vi.fn(),
    logout: vi.fn(),
    updateMediaMessage: vi.fn(),
    waUploadToServer: vi.fn().mockResolvedValue({
      mediaUrl: "https://mmg.whatsapp.net/preview",
      directPath: "/v/t62.7118-24/preview",
    }),
    ...overrides,
  } as any;
  const provider = new WhatsAppWebProvider({
    connectionId: "connection-a",
    serializedSession: null,
    onSessionChange: vi.fn(async () => undefined),
    onQr: vi.fn(),
    onStatus: vi.fn(),
    onMessage: vi.fn(),
    onReceipt,
    socketFactory: (() => socket) as any,
    linkPreviewBuilder,
  });
  const open = async () => {
    await provider.connect();
    for (const listener of listeners.get("connection.update") ?? [])
      listener({ connection: "open" });
  };
  return { provider, socket, open, listeners, onReceipt };
}

describe("WhatsAppWebProvider dispatch", () => {
  it("normaliza receipts reais sem expor o participante", async () => {
    const { open, listeners, onReceipt } = harness();
    await open();
    for (const listener of listeners.get("message-receipt.update") ?? []) {
      listener([{
        key: { id: "delivery-a", remoteJid: GROUP_ID, fromMe: true },
        receipt: {
          userJid: "5511888888888@s.whatsapp.net",
          receiptTimestamp: 1_788_765_000,
          readTimestamp: 1_788_765_030,
        },
      }]);
    }
    await vi.waitFor(() => expect(onReceipt).toHaveBeenCalledOnce());
    expect(onReceipt).toHaveBeenCalledWith({
      externalGroupId: GROUP_ID,
      externalMessageId: "delivery-a",
      deliveredAt: "2026-09-07T07:10:00.000Z",
      readAt: "2026-09-07T07:10:30.000Z",
    });
    expect(JSON.stringify(onReceipt.mock.calls)).not.toContain("5511888888888");
  });

  it("ignora QR e encerramento emitidos por um socket antigo após reconectar", async () => {
    const sockets: Array<{
      ev: { on: (name: string, listener: (value: any) => void) => void };
      user: any;
      end: ReturnType<typeof vi.fn>;
      logout: ReturnType<typeof vi.fn>;
    }> = [];
    const listeners = new Map<
      object,
      Map<string, Array<(value: any) => void>>
    >();
    const statuses: string[] = [];
    const socketFactory = () => {
      const socket = {
        ev: {
          on: (name: string, listener: (value: any) => void) => {
            const byEvent = listeners.get(socket) ?? new Map();
            byEvent.set(name, [...(byEvent.get(name) ?? []), listener]);
            listeners.set(socket, byEvent);
          },
        },
        user: { id: `${SELF_ID}:12`, jid: SELF_ID, name: "AfiliHub Teste" },
        end: vi.fn(),
        logout: vi.fn(),
      };
      sockets.push(socket);
      return socket as any;
    };
    const provider = new WhatsAppWebProvider({
      connectionId: "connection-a",
      serializedSession: null,
      onSessionChange: vi.fn(async () => undefined),
      onQr: vi.fn(),
      onStatus: vi.fn(async (status) => {
        statuses.push(status);
      }),
      onMessage: vi.fn(),
      socketFactory: socketFactory as any,
    });
    const emit = (socket: object, name: string, value: any) => {
      for (const listener of listeners.get(socket)?.get(name) ?? [])
        listener(value);
    };

    await provider.connect();
    const first = sockets[0];
    emit(first, "connection.update", { connection: "open" });
    expect(provider.getConnectionStatus()).toBe("connected");

    emit(first, "connection.update", {
      connection: "close",
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });
    clearTimeout((provider as any).reconnectTimer);
    (provider as any).reconnectTimer = null;
    await (provider as any).startSocket();
    expect(sockets).toHaveLength(2);
    const second = sockets[1];
    emit(second, "connection.update", { connection: "open" });
    expect(provider.getConnectionStatus()).toBe("connected");

    emit(first, "connection.update", { qr: "stale-qr" });
    emit(first, "connection.update", {
      connection: "close",
      lastDisconnect: { error: { output: { statusCode: 500 } } },
    });

    expect(provider.getConnectionStatus()).toBe("connected");
    expect(statuses.at(-1)).toBe("connected");
    await provider.destroy();
  });

  it("preserva texto e retorna somente o ID confirmado pelo WhatsApp", async () => {
    const { provider, socket, open } = harness();
    await open();
    const text = "*Oferta real*\nhttps://afiliado.example/item";

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text },
    });

    expect(result).toEqual({
      success: true,
      externalMessageId: "REAL-WHATSAPP-ID",
    });
    expect(socket.sendMessage).toHaveBeenCalledOnce();
    expect(socket.sendMessage).toHaveBeenCalledWith(
      GROUP_ID,
      { text },
      undefined,
    );
  });

  it("anexa preview da Shopee somente ao payload textual sem mídia própria", async () => {
    const linkPreview = {
      "canonical-url": "https://s.shopee.com.br/affiliate",
      "matched-text": "https://s.shopee.com.br/affiliate",
      title: "Produto real",
      jpegThumbnail: Buffer.from([1, 2, 3]),
    };
    const builder = vi.fn().mockResolvedValue(linkPreview);
    const { provider, socket, open } = harness({}, builder);
    await open();
    const text = "*Oferta*\nhttps://s.shopee.com.br/affiliate";

    await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: {
        type: "text",
        text,
        affiliateUrl: "https://s.shopee.com.br/affiliate",
        previewSourceUrl: "https://s.shopee.com.br/original",
        productTitle: "Produto real",
        previewDescription: "@comprinhasdajulia",
      },
    });

    expect(builder).toHaveBeenCalledWith({
      text,
      affiliateUrl: "https://s.shopee.com.br/affiliate",
      sourceUrl: "https://s.shopee.com.br/original",
      productTitle: "Produto real",
      description: "@comprinhasdajulia",
    });
    expect(socket.sendMessage).toHaveBeenCalledWith(
      GROUP_ID,
      { text, linkPreview },
      undefined,
    );
  });

  it("faz upload thumbnail-link para o cartão grande do WhatsApp", async () => {
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZxiAAAAAASUVORK5CYII=",
      "base64",
    );
    const builder = vi.fn().mockResolvedValue({
      "canonical-url": "https://s.shopee.com.br/affiliate",
      "matched-text": "https://s.shopee.com.br/affiliate",
      title: "Produto real",
      imageBytes,
    });
    const { provider, socket, open } = harness({}, builder);
    await open();

    await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: {
        type: "text",
        text: "Oferta https://s.shopee.com.br/affiliate",
        previewSourceUrl: "https://shopee.com.br/product/123456/987654",
      },
    });

    expect(socket.waUploadToServer).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ mediaType: "image" }),
    );
    const content = socket.sendMessage.mock.calls[0][1];
    expect(content.linkPreview.highQualityThumbnail).toMatchObject({
      directPath: "/v/t62.7118-24/preview",
      url: "https://mmg.whatsapp.net/preview",
    });
    expect(content.linkPreview).not.toHaveProperty("imageBytes");
  });

  it("envia imagem e caption juntos em uma única chamada", async () => {
    const { provider, socket, open } = harness();
    await open();
    const image = new Uint8Array([1, 2, 3, 4]);

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: {
        type: "image",
        image,
        mimeType: "image/jpeg",
        caption: "*Legenda*",
      },
    });

    expect(result.success).toBe(true);
    expect(socket.sendMessage).toHaveBeenCalledOnce();
    const [, content] = socket.sendMessage.mock.calls[0];
    expect(Buffer.isBuffer(content.image)).toBe(true);
    expect(content).toMatchObject({
      caption: "*Legenda*",
      mimetype: "image/jpeg",
    });
  });

  it("bloqueia grupo do qual a conexão não participa", async () => {
    const { provider, socket, open } = harness({
      groupMetadata: vi.fn().mockResolvedValue({
        id: GROUP_ID,
        subject: "Outro grupo",
        announce: false,
        participants: [{ id: "5511888888888@s.whatsapp.net", admin: "admin" }],
      }),
    });
    await open();

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text: "Oferta" },
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "WHATSAPP_GROUP_NOT_MEMBER",
      classification: "permanent",
    });
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it("respeita grupo somente para admins sem tentar bypass", async () => {
    const { provider, socket, open } = harness({
      groupMetadata: vi.fn().mockResolvedValue({
        id: GROUP_ID,
        subject: "Avisos",
        announce: true,
        participants: [{ id: SELF_ID, admin: null }],
      }),
    });
    await open();

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text: "Oferta" },
    });

    expect(result).toMatchObject({
      success: false,
      errorCode: "WHATSAPP_GROUP_SEND_NOT_ALLOWED",
      classification: "permanent",
    });
    expect(socket.sendMessage).not.toHaveBeenCalled();
  });

  it("classifica falha de rede após sendMessage como uncertain", async () => {
    const { provider, socket, open } = harness({
      sendMessage: vi
        .fn()
        .mockRejectedValue(
          new Error("ETIMEDOUT waiting for relay confirmation"),
        ),
    });
    await open();

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text: "Oferta" },
    });

    expect(result).toEqual({
      success: false,
      errorCode: "WHATSAPP_SEND_UNCERTAIN",
      classification: "uncertain",
    });
    expect(socket.sendMessage).toHaveBeenCalledOnce();
  });

  it("classifica rejeição explícita de permissão como permanente", async () => {
    const denied = Object.assign(new Error("forbidden"), {
      output: { statusCode: 403 },
    });
    const { provider, open } = harness({
      sendMessage: vi.fn().mockRejectedValue(denied),
    });
    await open();

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text: "Oferta" },
    });

    expect(result).toEqual({
      success: false,
      errorCode: "WHATSAPP_GROUP_SEND_NOT_ALLOWED",
      classification: "permanent",
    });
  });

  it("não inventa externalMessageId quando o provider não o confirma", async () => {
    const { provider, open } = harness({
      sendMessage: vi.fn().mockResolvedValue({ key: {} }),
    });
    await open();

    const result = await provider.sendGroupMessage({
      externalGroupId: GROUP_ID,
      payload: { type: "text", text: "Oferta" },
    });

    expect(result).toEqual({
      success: false,
      errorCode: "WHATSAPP_EXTERNAL_MESSAGE_ID_MISSING",
      classification: "uncertain",
    });
  });
});
