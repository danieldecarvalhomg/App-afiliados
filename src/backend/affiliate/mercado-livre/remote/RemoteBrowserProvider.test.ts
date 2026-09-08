import { describe, expect, it, vi } from 'vitest';
import {
  BrowserbaseProvider,
  HyperbrowserProvider,
  decodeRemoteProfile,
  encodeRemoteProfile,
  decodeRemoteProfiles,
  encodeRemoteProfiles,
} from './RemoteBrowserProvider';

const response = (value: unknown, status = 200) => new Response(
  value === undefined ? null : JSON.stringify(value),
  { status, headers: { 'content-type': 'application/json' } },
);

describe('RemoteBrowserProvider', () => {
  it('mantém perfis legados como Browserbase e codifica os novos provedores', () => {
    expect(decodeRemoteProfile('contexto-legado')).toEqual({ provider: 'browserbase', profileId: 'contexto-legado' });
    expect(decodeRemoteProfile(encodeRemoteProfile('hyperbrowser', 'perfil-1')))
      .toEqual({ provider: 'hyperbrowser', profileId: 'perfil-1' });
    const registry = { primary: 'hyperbrowser' as const, profiles: { hyperbrowser: 'hb-1', browserbase: 'bb-1' } };
    expect(decodeRemoteProfiles(encodeRemoteProfiles(registry))).toEqual(registry);
  });

  it('cria perfil e sessão persistente no Hyperbrowser', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ id: 'profile-1' }))
      .mockResolvedValueOnce(response({ id: 'session-1', wsEndpoint: 'wss://hyperbrowser.test', liveUrl: 'https://live.test' }))
      .mockResolvedValueOnce(response({ success: true }));
    const provider = new HyperbrowserProvider('hb-key', fetcher as typeof fetch);

    await expect(provider.createProfile('usuario-1')).resolves.toBe('profile-1');
    await expect(provider.createSession('profile-1', { interactive: true, persistChanges: true }))
      .resolves.toEqual({ id: 'session-1', connectUrl: 'wss://hyperbrowser.test', liveUrl: 'https://live.test' });
    await provider.stopSession('session-1');

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://api.hyperbrowser.ai/api/profile', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-api-key': 'hb-key' }),
    }));
    const sessionBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(sessionBody).toMatchObject({ timeoutMinutes: 15, profile: { id: 'profile-1', persistChanges: true } });
    expect(fetcher).toHaveBeenNthCalledWith(3, 'https://api.hyperbrowser.ai/api/session/session-1/stop', expect.objectContaining({ method: 'PUT' }));
  });

  it('preserva o contrato Browserbase para contingência', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response({ id: 'context-1' }))
      .mockResolvedValueOnce(response({ id: 'session-1', connectUrl: 'wss://browserbase.test' }))
      .mockResolvedValueOnce(response({ debuggerFullscreenUrl: 'https://debug.test' }));
    const provider = new BrowserbaseProvider('bb-key', 'project-1', fetcher as typeof fetch);

    await expect(provider.createProfile('usuario-1')).resolves.toBe('context-1');
    await expect(provider.createSession('context-1', { interactive: true, persistChanges: true }))
      .resolves.toEqual({ id: 'session-1', connectUrl: 'wss://browserbase.test', liveUrl: 'https://debug.test' });
  });

  it('normaliza falha de cobrança de qualquer provedor', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: 'payment required' }, 402));
    const provider = new HyperbrowserProvider('hb-key', fetcher as typeof fetch);
    await expect(provider.createProfile('usuario-1')).rejects.toThrow('REMOTE_BROWSER_HTTP_402');
  });
});
