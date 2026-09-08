import { describe, expect, it, vi } from "vitest";
import { WhatsAppEventBus } from "./eventBus";

const qrEvent = {
  type: "qr.updated" as const,
  connectionId: "connection-a",
  data: { qr: "real-qr-value" },
};

describe("WhatsAppEventBus", () => {
  it("reentrega o QR recente para uma tela que reconectou depois da emissão", async () => {
    const bus = new WhatsAppEventBus();
    const listener = vi.fn();
    bus.publish("user-a", qrEvent);
    expect(bus.getLatestQr("user-a", "connection-a")).toBe("real-qr-value");
    bus.subscribe("user-a", listener);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(listener).toHaveBeenCalledWith(qrEvent);
  });

  it("remove o QR quando a conexão deixa os estados de pareamento", async () => {
    const bus = new WhatsAppEventBus();
    const listener = vi.fn();
    bus.publish("user-a", qrEvent);
    bus.publish("user-a", {
      type: "connection.updated",
      connectionId: "connection-a",
      data: { status: "connected" },
    });
    expect(bus.getLatestQr("user-a", "connection-a")).toBeNull();
    bus.subscribe("user-a", listener);
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    expect(listener).not.toHaveBeenCalled();
  });

  it("permite limpar o QR antes de recriar um socket", () => {
    const bus = new WhatsAppEventBus();
    bus.publish("user-a", qrEvent);
    bus.clearLatestQr("user-a", "connection-a");
    expect(bus.getLatestQr("user-a", "connection-a")).toBeNull();
  });
});
