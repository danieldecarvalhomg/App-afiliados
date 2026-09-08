import { EventEmitter } from 'node:events';

export interface DispatchRealtimeEvent {
  type: string;
  campaignId?: string;
  queueItemId?: string;
  deliveryId?: string;
  status?: string;
  data?: Record<string, unknown>;
  occurredAt: string;
}

type Listener = (event: DispatchRealtimeEvent) => void;

export class DispatchEventBus {
  private readonly emitter = new EventEmitter();

  publish(userId: string, event: Omit<DispatchRealtimeEvent, 'occurredAt'> & { occurredAt?: string }) {
    this.emitter.emit(userId, { ...event, occurredAt: event.occurredAt ?? new Date().toISOString() });
  }

  subscribe(userId: string, listener: Listener) {
    this.emitter.on(userId, listener);
    return () => this.emitter.off(userId, listener);
  }
}
