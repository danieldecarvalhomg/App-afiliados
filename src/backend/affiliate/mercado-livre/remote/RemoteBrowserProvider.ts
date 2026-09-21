export type RemoteBrowserProviderId = 'browserbase' | 'hyperbrowser';

export interface RemoteBrowserSession {
  id: string;
  connectUrl: string;
  liveUrl: string | null;
}

export interface RemoteBrowserSessionOptions {
  interactive: boolean;
  persistChanges: boolean;
  mobile?: boolean;
}

export interface RemoteBrowserProvider {
  readonly id: RemoteBrowserProviderId;
  configured(): boolean;
  createProfile(userId: string): Promise<string>;
  createSession(profileId: string, options: RemoteBrowserSessionOptions): Promise<RemoteBrowserSession>;
  stopSession(sessionId: string): Promise<void>;
}

export interface RemoteBrowserProfiles {
  primary: RemoteBrowserProviderId;
  profiles: Partial<Record<RemoteBrowserProviderId, string>>;
}

const PREFIXES: Record<RemoteBrowserProviderId, string> = {
  browserbase: 'bb:',
  hyperbrowser: 'hb:',
};

export function encodeRemoteProfile(provider: RemoteBrowserProviderId, profileId: string): string {
  return encodeRemoteProfiles({ primary: provider, profiles: { [provider]: profileId } });
}

export function encodeRemoteProfiles(registry: RemoteBrowserProfiles): string {
  return `rbv1:${Buffer.from(JSON.stringify(registry), 'utf8').toString('base64url')}`;
}

export function decodeRemoteProfiles(value: string): RemoteBrowserProfiles {
  if (value.startsWith('rbv1:')) {
    try {
      const parsed = JSON.parse(Buffer.from(value.slice(5), 'base64url').toString('utf8')) as RemoteBrowserProfiles;
      if ((parsed.primary === 'browserbase' || parsed.primary === 'hyperbrowser') && parsed.profiles?.[parsed.primary]) {
        return parsed;
      }
    } catch { /* formato inválido cai na compatibilidade legada */ }
  }
  if (value.startsWith(PREFIXES.hyperbrowser)) {
    return { primary: 'hyperbrowser', profiles: { hyperbrowser: value.slice(PREFIXES.hyperbrowser.length) } };
  }
  if (value.startsWith(PREFIXES.browserbase)) {
    return { primary: 'browserbase', profiles: { browserbase: value.slice(PREFIXES.browserbase.length) } };
  }
  return { primary: 'browserbase', profiles: { browserbase: value } };
}

export function decodeRemoteProfile(value: string): { provider: RemoteBrowserProviderId; profileId: string } {
  const registry = decodeRemoteProfiles(value);
  return { provider: registry.primary, profileId: registry.profiles[registry.primary]! };
}

type Fetcher = typeof fetch;

async function jsonRequest<T>(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  errorPrefix = 'REMOTE_BROWSER_HTTP',
): Promise<T> {
  const response = await fetcher(url, init);
  if (!response.ok) throw new Error(`${errorPrefix}_${response.status}`);
  const raw = await response.text();
  return (raw ? JSON.parse(raw) : undefined) as T;
}

export class BrowserbaseProvider implements RemoteBrowserProvider {
  readonly id = 'browserbase' as const;
  private readonly api = 'https://api.browserbase.com/v1';

  constructor(
    private readonly apiKey = process.env.BROWSERBASE_API_KEY?.trim() ?? '',
    private readonly projectId = process.env.BROWSERBASE_PROJECT_ID?.trim() ?? '',
    private readonly fetcher: Fetcher = fetch,
  ) {}

  configured(): boolean { return Boolean(this.apiKey); }

  async createProfile(_userId: string): Promise<string> {
    const created = await this.request<{ id: string }>('/contexts', { method: 'POST', body: '{}' });
    if (!created.id) throw new Error('REMOTE_CONTEXT_CREATE_FAILED');
    return created.id;
  }

  async createSession(profileId: string, options: RemoteBrowserSessionOptions): Promise<RemoteBrowserSession> {
    const viewport = options.mobile ? { width: 412, height: 915 } : { width: 1440, height: 900 };
    const created = await this.request<{ id: string; connectUrl: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({
        ...(this.projectId ? { projectId: this.projectId } : {}),
        keepAlive: options.interactive,
        timeout: options.interactive ? 900 : 180,
        proxies: process.env.BROWSERBASE_USE_PROXY === 'true',
        browserSettings: { context: { id: profileId, persist: options.persistChanges }, viewport },
        userMetadata: { integration: 'mercado_livre_affiliate' },
      }),
    });
    let liveUrl: string | null = null;
    if (options.interactive) {
      const debug = await this.request<{ debuggerFullscreenUrl?: string }>(`/sessions/${created.id}/debug`, { method: 'GET' });
      liveUrl = debug.debuggerFullscreenUrl ?? null;
    }
    return { id: created.id, connectUrl: created.connectUrl, liveUrl };
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(`/sessions/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ status: 'REQUEST_RELEASE', ...(this.projectId ? { projectId: this.projectId } : {}) }),
    });
  }

  private request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    return jsonRequest<T>(this.fetcher, `${this.api}${path}`, {
      ...init,
      headers: { 'x-bb-api-key': this.apiKey, 'content-type': 'application/json', ...init.headers },
    });
  }
}

export class HyperbrowserProvider implements RemoteBrowserProvider {
  readonly id = 'hyperbrowser' as const;
  private readonly api = 'https://api.hyperbrowser.ai/api';

  constructor(
    private readonly apiKey = process.env.HYPERBROWSER_API_KEY?.trim() ?? '',
    private readonly fetcher: Fetcher = fetch,
  ) {}

  configured(): boolean { return Boolean(this.apiKey); }

  async createProfile(userId: string): Promise<string> {
    const created = await this.request<{ id: string }>('/profile', {
      method: 'POST',
      body: JSON.stringify({ name: `promofy-mercado-livre-${userId.slice(0, 24)}` }),
    });
    if (!created.id) throw new Error('REMOTE_CONTEXT_CREATE_FAILED');
    return created.id;
  }

  async createSession(profileId: string, options: RemoteBrowserSessionOptions): Promise<RemoteBrowserSession> {
    const useProxy = process.env.HYPERBROWSER_USE_PROXY === 'true';
    // Hyperbrowser rejects physical screens narrower than 500 px. The page is
    // still emulated as a 412 px Android device over CDP after the connection.
    const screen = options.mobile ? { width: 500, height: 915 } : { width: 1440, height: 900 };
    const created = await this.request<{ id: string; wsEndpoint: string; liveUrl?: string }>('/session', {
      method: 'POST',
      body: JSON.stringify({
        useStealth: process.env.HYPERBROWSER_USE_STEALTH === 'true',
        useProxy,
        ...(useProxy ? { proxyCountry: process.env.HYPERBROWSER_PROXY_COUNTRY?.trim() || 'BR' } : {}),
        solveCaptchas: process.env.HYPERBROWSER_SOLVE_CAPTCHAS === 'true',
        acceptCookies: true,
        timeoutMinutes: options.interactive ? 15 : 3,
        screen,
        profile: { id: profileId, persistChanges: options.persistChanges },
      }),
    });
    if (!created.id || !created.wsEndpoint) throw new Error('REMOTE_SESSION_CREATE_FAILED');
    return { id: created.id, connectUrl: created.wsEndpoint, liveUrl: created.liveUrl ?? null };
  }

  async stopSession(sessionId: string): Promise<void> {
    await this.request(`/session/${sessionId}/stop`, { method: 'PUT' });
  }

  private request<T = unknown>(path: string, init: RequestInit): Promise<T> {
    return jsonRequest<T>(this.fetcher, `${this.api}${path}`, {
      ...init,
      headers: { 'x-api-key': this.apiKey, 'content-type': 'application/json', ...init.headers },
    });
  }
}

export function createRemoteBrowserProviders(): RemoteBrowserProvider[] {
  const hyperbrowser = new HyperbrowserProvider();
  const browserbase = new BrowserbaseProvider();
  const preferred = process.env.MERCADO_LIVRE_REMOTE_BROWSER_PROVIDER?.trim().toLowerCase();
  // Uma escolha explícita é exclusiva. Isso impede que uma indisponibilidade
  // troque silenciosamente o usuário para um fornecedor que ele não autorizou.
  if (preferred === 'browserbase') return [browserbase];
  if (preferred === 'hyperbrowser') return [hyperbrowser];
  return [hyperbrowser, browserbase];
}
