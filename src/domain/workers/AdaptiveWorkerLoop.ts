export interface AdaptiveWorkerLoopOptions {
  minDelayMs: number;
  maxDelayMs?: number;
  backoffFactor?: number;
}

/** Poll de segurança com recuo automático. Eventos continuam podendo chamar
 * o service.kick() imediatamente; este loop existe para recuperar trabalho
 * perdido sem consultar o banco a cada segundo quando a fila está vazia. */
export class AdaptiveWorkerLoop {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = true;
  private delayMs: number;
  private readonly maxDelayMs: number;
  private readonly factor: number;

  constructor(private readonly run: () => Promise<number>, private readonly options: AdaptiveWorkerLoopOptions) {
    this.delayMs = options.minDelayMs;
    this.maxDelayMs = Math.max(options.minDelayMs, options.maxDelayMs ?? 60_000);
    this.factor = Math.max(1.2, options.backoffFactor ?? 2);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  wake(): void {
    if (this.stopped || this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const processed = await this.run();
      this.delayMs = processed > 0
        ? this.options.minDelayMs
        : Math.min(this.maxDelayMs, Math.ceil(this.delayMs * this.factor));
    } catch {
      this.delayMs = Math.min(this.maxDelayMs, Math.ceil(this.delayMs * this.factor));
    } finally {
      this.running = false;
      this.schedule(this.delayMs);
    }
  }
}
