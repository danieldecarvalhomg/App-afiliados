import { createHash } from 'node:crypto';
import type { AffiliateProviderCredentials } from '../../../../domain/affiliate/types';
import { extractMercadoLivreItemId, normalizeMercadoLivreConversionUrl } from '../AffiliateLinkValidator';
import { MercadoLivreCompanionError } from '../companion/types';
import type { MercadoLivreGenerationResult } from '../generationTypes';
import { MercadoLivreAffiliateDestinationVerifier } from './MercadoLivreAffiliateDestinationVerifier';
import { MercadoLivreDirectClient } from './MercadoLivreDirectClient';

export interface MercadoLivreDirectCache {
  findCachedAffiliateLink(userId: string, itemKey: string, trackingLabel: string): Promise<string | null>;
  saveCachedAffiliateLink(input: {
    userId: string; itemKey: string; trackingLabel: string; sourceUrl: string;
    affiliateUrl: string; expiresAt: string;
  }): Promise<void>;
}

interface QueueItem {
  userId: string;
  affiliateAccountId: string;
  sourceUrl: string;
  normalizedUrl: string;
  itemId: string | null;
  itemKey: string;
  trackingTag: string;
  credentials: AffiliateProviderCredentials;
  resolve: (result: MercadoLivreGenerationResult) => void;
  reject: (error: unknown) => void;
}

interface CircuitState { failures: number; openUntil: number; }

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class MercadoLivreDirectAdapter {
  readonly providerName = 'mercado_livre_unofficial_v1';
  private readonly memory = new Map<string, { expiresAt: number; result: MercadoLivreGenerationResult }>();
  private readonly queues = new Map<string, QueueItem[]>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly activeFlushes = new Map<string, Promise<void>>();
  private readonly circuits = new Map<string, CircuitState>();

  constructor(
    private readonly client: MercadoLivreDirectClient,
    private readonly cache?: MercadoLivreDirectCache | null,
    private readonly verifier = new MercadoLivreAffiliateDestinationVerifier(),
    private readonly onSessionInvalid?: (userId: string, errorCode: string) => Promise<void>,
  ) {}

  configured(credentials: AffiliateProviderCredentials): boolean { return this.client.configured(credentials); }

  async generate(
    userId: string,
    affiliateAccountId: string,
    sourceUrl: string,
    credentials: AffiliateProviderCredentials,
    _trackingLabel?: string | null,
  ): Promise<MercadoLivreGenerationResult> {
    if (!this.configured(credentials)) throw new MercadoLivreCompanionError('DIRECT_SESSION_REQUIRED', 'Conecte sua sessão do Mercado Livre.');
    const normalizedUrl = normalizeMercadoLivreConversionUrl(sourceUrl);
    const itemId = extractMercadoLivreItemId(normalizedUrl);
    const sourceHash = createHash('sha256').update(normalizedUrl).digest('hex').slice(0, 16);
    const itemKey = itemId ?? `URL:${sourceHash}`;
    const trackingTag = credentials.trackingTag!.trim();
    const memoryKey = `${userId}:${itemKey}:${trackingTag}`;
    const cached = this.memory.get(memoryKey);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.result, cached: true };
    const persistent = await this.cache?.findCachedAffiliateLink(userId, itemKey, trackingTag).catch(() => null);
    if (persistent) {
      try {
        const affiliateUrl = await this.verifier.verify(normalizedUrl, persistent);
        const result: MercadoLivreGenerationResult = { affiliateUrl, itemId, trackingLabel: trackingTag, cached: true, provider: this.providerName };
        this.memory.set(memoryKey, { expiresAt: Date.now() + this.cacheTtlMs(), result });
        return result;
      } catch (error) {
        if (!(error instanceof MercadoLivreCompanionError)
          || !['LINK_VALIDATION_FAILED', 'INVALID_AFFILIATE_URL'].includes(error.code)) throw error;
        // Cache inválido: gera novamente e o upsert substitui o valor antigo.
      }
    }
    return new Promise<MercadoLivreGenerationResult>((resolve, reject) => {
      const queueKey = `${affiliateAccountId}:${trackingTag}`;
      const queue = this.queues.get(queueKey) ?? [];
      queue.push({ userId, affiliateAccountId, sourceUrl, normalizedUrl, itemId, itemKey, trackingTag, credentials, resolve, reject });
      this.queues.set(queueKey, queue);
      if (!this.timers.has(queueKey)) {
        this.timers.set(queueKey, setTimeout(() => void this.scheduleFlush(queueKey), this.batchDelayMs()));
      }
    });
  }

  private async scheduleFlush(queueKey: string): Promise<void> {
    const previous = this.activeFlushes.get(queueKey) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.flush(queueKey));
    this.activeFlushes.set(queueKey, current);
    try { await current; }
    finally { if (this.activeFlushes.get(queueKey) === current) this.activeFlushes.delete(queueKey); }
  }

  private async flush(queueKey: string): Promise<void> {
    const queue = this.queues.get(queueKey) ?? [];
    this.queues.delete(queueKey);
    this.timers.delete(queueKey);
    for (let offset = 0; offset < queue.length; offset += this.maxBatchSize()) {
      const chunk = queue.slice(offset, offset + this.maxBatchSize());
      try {
        const results = await this.generateBatch(chunk);
        chunk.forEach((item, index) => item.resolve(results[index]));
      } catch (error) { chunk.forEach((item) => item.reject(error)); }
    }
  }

  private async generateBatch(items: QueueItem[]): Promise<MercadoLivreGenerationResult[]> {
    if (!items.length) return [];
    const accountId = items[0].affiliateAccountId;
    const circuit = this.circuits.get(accountId);
    if (circuit?.openUntil && circuit.openUntil > Date.now()) {
      throw new MercadoLivreCompanionError('CIRCUIT_OPEN', 'O motor do Mercado Livre está temporariamente pausado.', true);
    }
    try {
      const generated = await this.withRetry(() => this.client.createAffiliateLinks(
        items[0].credentials,
        items.map((item) => item.normalizedUrl),
        items[0].trackingTag,
      ));
      const verified = await this.verifyWithConcurrency(items, generated.urls, 5);
      const expiresAt = new Date(Date.now() + this.cacheTtlMs()).toISOString();
      const results = verified.map((affiliateUrl, index): MercadoLivreGenerationResult => ({
        affiliateUrl,
        itemId: items[index].itemId,
        trackingLabel: generated.trackingTag,
        cached: false,
        provider: this.providerName,
      }));
      await Promise.all(items.map((item, index) => this.cache?.saveCachedAffiliateLink({
        userId: item.userId,
        itemKey: item.itemKey,
        trackingLabel: generated.trackingTag,
        sourceUrl: item.normalizedUrl,
        affiliateUrl: verified[index],
        expiresAt,
      }).catch(() => undefined)));
      items.forEach((item, index) => {
        const memoryKey = `${item.userId}:${item.itemKey}:${generated.trackingTag}`;
        this.memory.set(memoryKey, { expiresAt: Date.parse(expiresAt), result: results[index] });
      });
      this.circuits.delete(accountId);
      return results;
    } catch (error) {
      const failure = error instanceof MercadoLivreCompanionError
        ? error : new MercadoLivreCompanionError('DIRECT_ENGINE_UNAVAILABLE', 'O motor próprio está indisponível.', true);
      if (failure.transient) {
        const next = (circuit?.failures ?? 0) + 1;
        this.circuits.set(accountId, { failures: next, openUntil: next >= 3 ? Date.now() + 30_000 : 0 });
      }
      if (['AUTH_REQUIRED', 'DIRECT_SESSION_INVALID'].includes(failure.code)) {
        await this.onSessionInvalid?.(items[0].userId, failure.code).catch(() => undefined);
      }
      throw failure;
    }
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { return await operation(); }
      catch (error) {
        last = error;
        if (!(error instanceof MercadoLivreCompanionError) || !error.transient || attempt === 2) throw error;
        await wait(attempt === 0 ? 250 : 1_000);
      }
    }
    throw last;
  }

  private async verifyWithConcurrency(items: QueueItem[], urls: string[], concurrency: number): Promise<string[]> {
    if (urls.length !== items.length) throw new MercadoLivreCompanionError('GENERATION_FAILED', 'O Mercado Livre retornou uma resposta incompleta.', true);
    const results = new Array<string>(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await this.verifier.verify(items[index].normalizedUrl, urls[index]);
      }
    }));
    return results;
  }

  private batchDelayMs(): number { return Math.max(0, Number(process.env.MERCADO_LIVRE_DIRECT_BATCH_MS ?? 40)); }
  private maxBatchSize(): number { return Math.min(150, Math.max(1, Number(process.env.MERCADO_LIVRE_DIRECT_BATCH_SIZE ?? 50))); }
  private cacheTtlMs(): number { return Math.max(60_000, Number(process.env.MERCADO_LIVRE_AFFILIATE_CACHE_MS ?? 30 * 86_400_000)); }
}
