import { EventEmitter } from "node:events";
import type { WhatsAppRealtimeEvent } from "../../domain/whatsapp/types";

interface UserEvent {
  userId: string;
  event: WhatsAppRealtimeEvent;
}

// O Baileys renova o QR periodicamente. Mantemos apenas o último valor em
// memória por uma janela curta para cobrir reload/reconexão do SSE.
const QR_REPLAY_TTL_MS = 2 * 60_000;

export class WhatsAppEventBus extends EventEmitter {
  private readonly latestQr = new Map<
    string,
    { event: WhatsAppRealtimeEvent; expiresAt: number }
  >();

  publish(userId: string, event: WhatsAppRealtimeEvent): void {
    const key = `${userId}:${event.connectionId}`;
    if (event.type === "qr.updated" && event.data.qr) {
      this.latestQr.set(key, {
        event,
        expiresAt: Date.now() + QR_REPLAY_TTL_MS,
      });
    }
    if (
      event.type === "connection.updated" &&
      event.data.status &&
      !["connecting", "reconnecting", "qr_required"].includes(event.data.status)
    ) {
      this.latestQr.delete(key);
    }
    this.emit("whatsapp", { userId, event } satisfies UserEvent);
  }

  getLatestQr(userId: string, connectionId: string): string | null {
    const key = `${userId}:${connectionId}`;
    const cached = this.latestQr.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.latestQr.delete(key);
      return null;
    }
    return cached.event.data.qr ?? null;
  }

  clearLatestQr(userId: string, connectionId: string): void {
    this.latestQr.delete(`${userId}:${connectionId}`);
  }

  subscribe(
    userId: string,
    listener: (event: WhatsAppRealtimeEvent) => void,
  ): () => void {
    const handler = (item: UserEvent) => {
      if (item.userId === userId) listener(item.event);
    };
    this.on("whatsapp", handler);
    queueMicrotask(() => {
      const now = Date.now();
      for (const [key, cached] of this.latestQr) {
        if (cached.expiresAt <= now) {
          this.latestQr.delete(key);
        } else if (key.startsWith(`${userId}:`)) {
          listener(cached.event);
        }
      }
    });
    return () => this.off("whatsapp", handler);
  }
}

export const whatsAppEventBus = new WhatsAppEventBus();
