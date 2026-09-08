export interface AiCachedResponse {
  payload: unknown;
  provider: string;
  model: string;
  expiresAt: string;
}

export interface AiResponseCache {
  get(kind: 'promotion' | 'media', key: string): Promise<AiCachedResponse | null>;
  set(input: {
    kind: 'promotion' | 'media';
    key: string;
    payload: unknown;
    provider: string;
    model: string;
    expiresAt: string;
  }): Promise<void>;
}
