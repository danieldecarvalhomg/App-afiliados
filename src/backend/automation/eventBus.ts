import { EventEmitter } from "node:events";

export interface AutomationRealtimeEvent {
  type: string;
  automationId?: string;
  executionId?: string;
  reviewId?: string;
  occurredAt: string;
}

type Listener = (event: AutomationRealtimeEvent) => void;

export class AutomationEventBus {
  private readonly emitter = new EventEmitter();

  publish(
    userId: string,
    event: Omit<AutomationRealtimeEvent, "occurredAt"> & {
      occurredAt?: string;
    },
  ) {
    this.emitter.emit(userId, {
      ...event,
      occurredAt: event.occurredAt ?? new Date().toISOString(),
    });
  }

  subscribe(userId: string, listener: Listener) {
    this.emitter.on(userId, listener);
    return () => this.emitter.off(userId, listener);
  }
}
