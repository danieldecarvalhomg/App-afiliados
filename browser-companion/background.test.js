import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { allowedBackend, DEFAULT_BACKEND, isCompanionAuthorizationError, runMercadoLivreBackgroundGeneration, serializeMercadoLivreCookies } from './background.js';

describe('AfiliHub Browser Companion security boundary', () => {
  it('aceita somente backends AfiliHub explicitamente permitidos', () => {
    expect(allowedBackend('http://127.0.0.1:3001')).toBe(true);
    expect(allowedBackend('https://afilihub-production.up.railway.app')).toBe(true);
    expect(allowedBackend('https://evil.example')).toBe(false);
    expect(allowedBackend('javascript:alert(1)')).toBe(false);
  });

  it('usa Manifest V3 e limita cookies aos hosts do Mercado Livre', async () => {
    const manifest = JSON.parse(await readFile(new URL('./manifest.json', import.meta.url), 'utf8'));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe('1.2.3');
    expect(manifest.permissions).toEqual(['storage', 'tabs', 'scripting', 'alarms', 'cookies']);
    expect(manifest.permissions).not.toContain('webRequest');
    expect(manifest.host_permissions).not.toContain('<all_urls>');
    expect(manifest.host_permissions.every((value) => /promofy|afilihub-production|127\.0\.0\.1|localhost|mercadolivre\.com\.br/u.test(value))).toBe(true);
  });

  it('não contém automação genérica ou código remoto', async () => {
    const source = await readFile(new URL('./background.js', import.meta.url), 'utf8');
    expect(source).not.toMatch(/document\.cookie|eval\(|new Function|<all_urls>/u);
    expect(source).toContain('chrome.cookies.getAll');
    expect(source).toContain('runMercadoLivreGeneration');
    expect(source).toContain("'NEEDS_USER_ACTION'");
    expect(source).toContain("const ADAPTER_VERSION = 5");
  });

  it('reconhece o gerador e o campo de múltiplas URLs do portal atual', async () => {
    const source = await readFile(new URL('./background.js', import.meta.url), 'utf8');
    expect(source).toContain('/afiliados/linkbuilder#hub');
    expect(source).toContain("const EXTENSION_VERSION = '1.2.3'");
    expect(source).toContain('textarea[placeholder*="url" i]');
    expect(source).toContain('gerador de (?:links?|produtos? recomendados?)');
    expect(source).toContain("candidates.find((item) => item.url?.includes('/afiliados/linkbuilder'))");
    expect(source).toContain('const deadline = Date.now() + 10_000');
    expect(source).not.toContain("|| candidates[0]");
  });

  it('serializa somente nome e valor dos cookies aplicáveis', () => {
    expect(serializeMercadoLivreCookies([
      { name: 'session', value: 'abc', path: '/' },
      { name: 'affiliate', value: 'xyz', path: '/affiliate-program' },
      { name: '', value: 'ignored', path: '/' },
    ])).toBe('affiliate=xyz; session=abc');
  });

  it('reconhece tokens do Companion inválidos para limpar o estado local', () => {
    expect(isCompanionAuthorizationError(401, 'COMPANION_UNAUTHORIZED')).toBe(true);
    expect(isCompanionAuthorizationError(200, 'COMPANION_UNAUTHORIZED')).toBe(true);
    expect(isCompanionAuthorizationError(503, 'BRIDGE_ERROR')).toBe(false);
  });

  it('usa o AfiliHub online por padrão e sempre limpa a conexão local ao desconectar', async () => {
    const source = await readFile(new URL('./background.js', import.meta.url), 'utf8');
    expect(DEFAULT_BACKEND).toBe('https://afilihub-production.up.railway.app');
    expect(source).toContain("chrome.storage.local.remove(['backendUrl', 'companionToken', 'instance'])");
    expect(source).toMatch(/PROMOFY_DISCONNECT[\s\S]*finally \{[\s\S]*await clearLocalPairing\(\)/u);
  });

  it('gera em segundo plano pela sessão do Chrome sem criar uma aba', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ tags: [{ tag: 'principal', in_use: true }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ urls: [{ short_url: 'https://meli.la/abc123' }] }), { status: 200 }));
    const result = await runMercadoLivreBackgroundGeneration({
      sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM',
    }, fetcher);
    expect(result).toMatchObject({ status: 'SUCCESS', affiliateUrl: 'https://meli.la/abc123', pageType: 'BACKGROUND_API' });
    expect(fetcher).toHaveBeenLastCalledWith(expect.stringContaining('/createLink'), expect.objectContaining({
      method: 'POST', body: expect.stringContaining('principal'), credentials: 'include',
    }));
  });

  it('repete a geração no contexto autenticado da página oficial quando o service worker é recusado', async () => {
    const source = await readFile(new URL('./background.js', import.meta.url), 'utf8');
    const functionStart = source.indexOf('export async function runMercadoLivreBackgroundGeneration');
    const functionEnd = source.indexOf('\nasync function mercadoLivreTab', functionStart);
    const serializedFunction = source.slice(functionStart, functionEnd);
    expect(source).toContain("world: 'MAIN'");
    expect(source).toContain("pageType: 'PAGE_API'");
    expect(source).toMatch(/\['AUTH_REQUIRED', 'GENERATION_FAILED', 'TEMPORARY_ERROR'\]/u);
    expect(serializedFunction).not.toMatch(/affiliateApi|mercadoLivreApiError|normalizedJobUrl|generationError/u);
  });

  it('não abre aba quando a sessão em segundo plano exige login', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }));
    const result = await runMercadoLivreBackgroundGeneration({
      sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM',
    }, fetcher);
    expect(result).toMatchObject({ status: 'NEEDS_USER_ACTION', errorCode: 'AUTH_REQUIRED' });
  });

  it('permite fallback no contexto da página quando o fetch do service worker é bloqueado', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await runMercadoLivreBackgroundGeneration({
      sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890-produto-_JM',
    }, fetcher);
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'TEMPORARY_ERROR' });
  });
});
