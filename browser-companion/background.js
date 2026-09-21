const EXTENSION_VERSION = '1.2.1';
const ADAPTER_VERSION = 5;
const PORTAL_URL = 'https://www.mercadolivre.com.br/afiliados/linkbuilder#hub';
const AFFILIATE_API_URL = 'https://www.mercadolivre.com.br/affiliate-program/api/v2/affiliates';
const ALLOWED_BACKENDS = new Set([
  'http://127.0.0.1:3001',
  'http://localhost:3001',
  'https://afilihub-production.up.railway.app',
]);
let processing = false;
let pollTimer = null;
let lastSessionSyncAt = 0;

export function allowedBackend(raw) {
  try { return ALLOWED_BACKENDS.has(new URL(raw).origin); }
  catch { return false; }
}

async function settings() {
  const value = await chrome.storage.local.get(['backendUrl', 'companionToken', 'instance', 'mlTabId']);
  const backendUrl = allowedBackend(value.backendUrl) ? new URL(value.backendUrl).origin : 'http://127.0.0.1:3001';
  return { ...value, backendUrl };
}

async function clearLocalPairing() {
  await chrome.storage.local.remove(['companionToken', 'instance']);
  lastSessionSyncAt = 0;
}

export function isCompanionAuthorizationError(status, code) {
  return status === 401 || code === 'COMPANION_UNAUTHORIZED';
}

async function api(path, init = {}) {
  const state = await settings();
  if (!state.companionToken) throw new Error('COMPANION_NOT_PAIRED');
  const response = await fetch(`${state.backendUrl}/api/browser-companion/extension${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${state.companionToken}`,
      'x-promofy-companion-version': EXTENSION_VERSION,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  const errorCode = payload?.error?.code || 'BRIDGE_ERROR';
  if (!response.ok || !payload?.success) {
    if (isCompanionAuthorizationError(response.status, errorCode)) await clearLocalPairing();
    throw new Error(errorCode);
  }
  return payload.data;
}

async function waitForTab(tabId, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab?.status === 'complete') return tab;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('PORTAL_UNAVAILABLE');
}

function generationError(errorCode, started, step = 'background_api') {
  return {
    status: ['AUTH_REQUIRED', 'CAPTCHA_REQUIRED', 'TWO_FACTOR_REQUIRED', 'USER_ACTION_REQUIRED'].includes(errorCode)
      ? 'NEEDS_USER_ACTION'
      : 'FAILED',
    errorCode,
    step,
    pageType: 'BACKGROUND_API',
    durationMs: Date.now() - started,
  };
}

function mercadoLivreApiError(status, payload) {
  const raw = `${payload?.code || ''} ${payload?.error || ''} ${payload?.message || ''}`.toUpperCase();
  if (status === 401 || status === 403 || /UNAUTHORIZED|FORBIDDEN|AUTH|LOGIN|SESSION/u.test(raw)) return 'AUTH_REQUIRED';
  if (status === 429 || /RATE.?LIMIT|TOO MANY/u.test(raw)) return 'RATE_LIMITED';
  if (/CAPTCHA|ROBOT|HUMAN/u.test(raw)) return 'CAPTCHA_REQUIRED';
  if (/TWO.?FACTOR|2FA|VERIFICATION.?CODE/u.test(raw)) return 'TWO_FACTOR_REQUIRED';
  if (/INVALID.?URL|URL.?INVALID/u.test(raw)) return 'LINK_VALIDATION_FAILED';
  return status >= 500 ? 'TEMPORARY_ERROR' : 'GENERATION_FAILED';
}

async function affiliateApi(path, init = {}, fetcher = fetch) {
  const response = await fetcher(`${AFFILIATE_API_URL}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...init,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-custom-origin': 'https://www.mercadolivre.com.br',
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(mercadoLivreApiError(response.status, payload));
    error.status = response.status;
    throw error;
  }
  return payload?.data ?? payload;
}

export function serializeMercadoLivreCookies(cookies) {
  if (!Array.isArray(cookies)) return '';
  return cookies
    .filter((cookie) => typeof cookie?.name === 'string' && cookie.name && typeof cookie?.value === 'string')
    .sort((left, right) => (right.path?.length || 0) - (left.path?.length || 0))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join('; ');
}

async function syncMercadoLivreSession(force = false) {
  if (!force && Date.now() - lastSessionSyncAt < 10 * 60_000) return;
  if (!chrome.cookies?.getAll) throw new Error('COOKIE_ACCESS_UNAVAILABLE');
  const tagsPayload = await affiliateApi('/getTags', { method: 'GET' });
  const tags = Array.isArray(tagsPayload) ? tagsPayload
    : Array.isArray(tagsPayload?.tags) ? tagsPayload.tags
      : Array.isArray(tagsPayload?.data) ? tagsPayload.data : [];
  const trackingTag = tags.find((item) => item?.in_use === true)?.tag
    || tags.find((item) => typeof item?.tag === 'string' && item.tag)?.tag
    || null;
  const cookies = await chrome.cookies.getAll({ url: `${AFFILIATE_API_URL}/getTags` });
  const sessionCookie = serializeMercadoLivreCookies(cookies);
  if (!trackingTag || sessionCookie.length < 20) throw new Error('DIRECT_SESSION_INVALID');
  await api('/session/sync', {
    method: 'POST',
    body: JSON.stringify({ sessionCookie, trackingTag }),
  });
  lastSessionSyncAt = Date.now();
}

function normalizedJobUrl(job) {
  try {
    const parsed = new URL(job?.sourceUrl);
    if (parsed.protocol !== 'https:' || !/(^|\.)mercadolivre\.com\.br$/iu.test(parsed.hostname)
      || !/MLB[-_]?\d{6,}/iu.test(`${parsed.pathname}${parsed.search}`)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch { return null; }
}

/**
 * Usa o mesmo endpoint HTTPS usado pelo Gerador oficial, mas diretamente no
 * service worker da extensão. A sessão continua dentro do Chrome e nenhuma aba
 * precisa ser criada, focada ou mantida aberta durante a conversão.
 */
export async function runMercadoLivreBackgroundGeneration(job, fetcher = fetch) {
  const started = Date.now();
  const productUrl = normalizedJobUrl(job);
  if (!productUrl) return generationError('LINK_VALIDATION_FAILED', started, 'validate_source');
  try {
    const tagsPayload = await affiliateApi('/getTags', { method: 'GET' }, fetcher);
    const tags = Array.isArray(tagsPayload) ? tagsPayload
      : Array.isArray(tagsPayload?.tags) ? tagsPayload.tags
        : Array.isArray(tagsPayload?.data) ? tagsPayload.data : [];
    const requested = typeof job?.trackingLabel === 'string' ? job.trackingLabel.trim() : '';
    const tag = tags.find((item) => requested && item?.tag === requested)?.tag
      || tags.find((item) => item?.in_use === true)?.tag
      || tags.find((item) => typeof item?.tag === 'string')?.tag
      || requested;
    const generated = await affiliateApi('/createLink', {
      method: 'POST',
      body: JSON.stringify({ urls: [productUrl], tag }),
    }, fetcher);
    const urls = Array.isArray(generated?.urls) ? generated.urls
      : Array.isArray(generated) ? generated : [];
    const result = urls.find((item) => item?.short_url || item?.long_url);
    const affiliateUrl = result?.short_url || result?.long_url || null;
    if (!affiliateUrl) {
      const code = mercadoLivreApiError(400, result || generated);
      return generationError(code, started, 'parse_background_result');
    }
    return {
      status: 'SUCCESS', affiliateUrl, step: 'background_api',
      pageType: 'BACKGROUND_API', durationMs: Date.now() - started,
    };
  } catch (cause) {
    const code = typeof cause?.message === 'string' ? cause.message : 'TEMPORARY_ERROR';
    return generationError(code, started);
  }
}

async function mercadoLivreTab() {
  const state = await settings();
  if (Number.isInteger(state.mlTabId)) {
    const existing = await chrome.tabs.get(state.mlTabId).catch(() => null);
    if (existing?.url?.includes('/afiliados/linkbuilder')) return existing;
  }
  const candidates = await chrome.tabs.query({ url: ['https://mercadolivre.com.br/*', 'https://www.mercadolivre.com.br/*'] });
  const tab = candidates.find((item) => item.url?.includes('/afiliados/linkbuilder'))
    || candidates.find((item) => item.url?.includes('/afiliados'))
    || await chrome.tabs.create({ url: PORTAL_URL, active: false });
  await chrome.storage.local.set({ mlTabId: tab.id });
  return tab;
}

export function detectMercadoLivreSession() {
  const url = location.href;
  const body = (document.body?.innerText || '').slice(0, 40_000);
  if (/login|\/jms\/|signin/iu.test(url) || /entre na sua conta|iniciar sess[aã]o/iu.test(body)) return 'NEEDS_LOGIN';
  if (/captcha|n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano/iu.test(`${url} ${body}`)) return 'NEEDS_USER_ACTION';
  if (/c[oó]digo de verifica[cç][aã]o|verifica[cç][aã]o em duas etapas|2fa/iu.test(body)) return 'NEEDS_USER_ACTION';
  if (/\/afiliados(?:\/|$|\?)/iu.test(new URL(url).pathname)) return 'READY';
  return 'UNKNOWN';
}

async function inspectMercadoLivreSession() {
  try {
    await affiliateApi('/getTags', { method: 'GET' });
    return 'READY';
  } catch (cause) {
    if (cause?.message === 'AUTH_REQUIRED') return 'NEEDS_LOGIN';
    if (cause?.message === 'CAPTCHA_REQUIRED' || cause?.message === 'TWO_FACTOR_REQUIRED') return 'NEEDS_USER_ACTION';
  }
  const state = await settings();
  const tab = Number.isInteger(state.mlTabId) ? await chrome.tabs.get(state.mlTabId).catch(() => null) : null;
  if (!tab || tab.status !== 'complete' || !tab.url?.includes('mercadolivre.com.br')) return 'UNKNOWN';
  const execution = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: detectMercadoLivreSession }).catch(() => null);
  return execution?.[0]?.result || 'UNKNOWN';
}

export async function runMercadoLivreGeneration(job) {
  const started = Date.now();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const text = () => (document.body?.innerText || '').slice(0, 80_000);
  const state = () => {
    const url = location.href;
    const body = text();
    if (/login|\/jms\/|signin/iu.test(url) || /entre na sua conta|iniciar sess[aã]o/iu.test(body)) return 'AUTH_REQUIRED';
    if (/captcha|n[aã]o sou um rob[oô]|verifique que voc[eê] [eé] humano/iu.test(`${url} ${body}`)) return 'CAPTCHA_REQUIRED';
    if (/c[oó]digo de verifica[cç][aã]o|verifica[cç][aã]o em duas etapas|2fa/iu.test(body)) return 'TWO_FACTOR_REQUIRED';
    return 'READY';
  };
  const error = (errorCode, step, pageType = state()) => ({ status: ['AUTH_REQUIRED','CAPTCHA_REQUIRED','TWO_FACTOR_REQUIRED'].includes(errorCode) ? 'NEEDS_USER_ACTION' : 'FAILED', errorCode, step, pageType, durationMs: Date.now() - started });
  const productUrl = (() => {
    try {
      const parsed = new URL(job?.sourceUrl);
      if (parsed.protocol !== 'https:' || !/(^|\.)mercadolivre\.com\.br$/iu.test(parsed.hostname) || !/MLB[-_]?\d{6,}/iu.test(`${parsed.pathname}${parsed.search}`)) return null;
      parsed.hash = '';
      return parsed.toString();
    } catch { return null; }
  })();
  if (!productUrl) return error('LINK_VALIDATION_FAILED', 'validate_source', 'INVALID_SOURCE');
  const currentState = state();
  if (currentState !== 'READY') return error(currentState, 'detect_session', currentState);

  const inputSelectors = [
    'textarea[placeholder*="url" i]', 'textarea[aria-label*="url" i]',
    'textarea[name*="url" i]', 'textarea[id*="url" i]',
    'input[type="url"]', 'input[name*="url" i]', 'input[id*="url" i]',
    'input[placeholder*="link" i]', 'input[placeholder*="url" i]',
    'textarea[placeholder*="link" i]', 'textarea[aria-label*="link" i]'
  ];
  const findProductInput = () => {
    const exact = inputSelectors.map((selector) => [...document.querySelectorAll(selector)].find(visible)).find(Boolean);
    if (exact) return exact;
    return [...document.querySelectorAll('textarea,input')].filter(visible).find((element) => {
      if (element instanceof HTMLInputElement && !['', 'text', 'url'].includes(element.type)) return false;
      const labels = element.labels ? [...element.labels].map((label) => label.textContent || '').join(' ') : '';
      const context = element.closest('article,form')?.textContent?.slice(0, 600) || '';
      const semantics = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''} ${element.getAttribute('name') || ''} ${element.id || ''} ${labels} ${context}`;
      return /(?:insira|cole|adicione).{0,40}(?:urls?|links?)|(?:urls?|links?).{0,50}(?:produtos?|divulgar)/iu.test(semantics);
    });
  };
  const generatorPattern = /gerador de (?:links?|produtos? recomendados?)|criar links?|links? de afiliad/iu;
  let input = findProductInput();
  if (!input) {
    const links = [...document.querySelectorAll('a[href]')].filter(visible);
    const generatorLink = links.find((element) => generatorPattern.test(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''} ${element.href || ''}`));
    if (generatorLink?.href) return { status: 'NAVIGATE', navigateUrl: generatorLink.href, step: 'open_generator', pageType: 'AFFILIATE_HUB', durationMs: Date.now() - started };
    const button = [...document.querySelectorAll('button,[role="button"]')].find((element) => visible(element) && generatorPattern.test(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`));
    if (button) {
      button.click();
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline && !input) {
        await sleep(250);
        input = findProductInput();
      }
    }
  }
  if (!input) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline && !input) {
      await sleep(250);
      input = findProductInput();
    }
  }
  if (!input) return error(/afiliados/iu.test(location.pathname) ? 'PORTAL_CHANGED' : 'GENERATOR_NOT_FOUND', 'find_input', 'AFFILIATE_PORTAL');

  const setValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  input.focus();
  setValue(input, '');
  let typed = '';
  for (const character of productUrl) { typed += character; setValue(input, typed); await sleep(5); }
  input.blur();

  if (typeof job.trackingLabel === 'string' && job.trackingLabel) {
    const trackingSelectors = [
      'input[aria-label*="etiqueta" i]', 'input[aria-label*="tracking" i]',
      'input[name*="tracking" i]', 'input[id*="tracking" i]',
      'input[placeholder*="etiqueta" i]', 'textarea[aria-label*="tracking" i]'
    ];
    const tracking = trackingSelectors.map((selector) => [...document.querySelectorAll(selector)].find(visible)).find(Boolean);
    if (tracking) { tracking.focus(); setValue(tracking, job.trackingLabel.slice(0, 80)); tracking.blur(); }
  }

  const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
  const generate = buttons.find((element) => /^(gerar|criar)( link)?$/iu.test((element.textContent || element.getAttribute('aria-label') || '').trim()))
    || buttons.find((element) => /gerar link|criar link/iu.test(`${element.textContent || ''} ${element.getAttribute('aria-label') || ''}`));
  if (!generate) return error('PORTAL_CHANGED', 'find_generate_button', 'GENERATOR');
  const enabledDeadline = Date.now() + 10_000;
  while (Date.now() < enabledDeadline && (generate.disabled || generate.getAttribute('aria-disabled') === 'true')) await sleep(250);
  if (generate.disabled || generate.getAttribute('aria-disabled') === 'true') return error('GENERATION_FAILED', 'wait_generate_enabled', 'GENERATOR');
  generate.click();

  const resultDeadline = Date.now() + 25_000;
  while (Date.now() < resultDeadline) {
    const pageState = state();
    if (pageState !== 'READY') return error(pageState, 'wait_result', pageState);
    const candidates = [...document.querySelectorAll('input,textarea,a[href],[data-clipboard-text],[data-clipboard-url],[data-url]')].flatMap((element) => [
      element.href, element.value, element.getAttribute('data-clipboard-text'),
      element.getAttribute('data-clipboard-url'), element.getAttribute('data-url'),
    ]).filter((value) => typeof value === 'string' && value.startsWith('https://'));
    for (const value of candidates) {
      try {
        const candidate = new URL(value);
        if (candidate.toString() === productUrl || !/(^|\.)(meli\.la|mercadolivre\.com\.br)$/iu.test(candidate.hostname)) continue;
        if (/login|captcha|auth|verification/iu.test(candidate.pathname)) continue;
        const validShort = candidate.hostname === 'meli.la' && /^\/[A-Za-z0-9]/u.test(candidate.pathname);
        const validLong = /MLB[-_]?\d{6,}/iu.test(`${candidate.pathname}${candidate.search}`)
          && ['matt_word','matt_tool','matt_source','utm_source','utm_medium','utm_campaign'].some((key) => candidate.searchParams.has(key));
        if (validShort || validLong) return { status: 'SUCCESS', affiliateUrl: candidate.toString(), step: 'result', pageType: 'GENERATOR', durationMs: Date.now() - started };
      } catch { /* ignora candidato inválido */ }
    }
    await sleep(350);
  }
  return error('GENERATION_TIMEOUT', 'wait_result', 'GENERATOR');
}

async function executeJob(job) {
  await api(`/jobs/${encodeURIComponent(job.id)}/processing`, { method: 'POST', body: '{}' });
  let result = await runMercadoLivreBackgroundGeneration(job);
  // Compatibilidade defensiva: se o endpoint interno mudar, uma aba que o
  // próprio usuário já deixou aberta ainda pode concluir pela automação DOM.
  // O Companion nunca abre uma aba só para processar um job.
  if (result.status === 'FAILED' && ['GENERATION_FAILED', 'TEMPORARY_ERROR'].includes(result.errorCode)) {
    const candidates = await chrome.tabs.query({ url: ['https://mercadolivre.com.br/*', 'https://www.mercadolivre.com.br/*'] });
    let current = candidates.find((item) => item.url?.includes('/afiliados/linkbuilder')) || null;
    if (current) {
      await waitForTab(current.id).catch(() => undefined);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const execution = await chrome.scripting.executeScript({ target: { tabId: current.id }, func: runMercadoLivreGeneration, args: [job] });
          result = execution?.[0]?.result || result;
          if (result.status === 'NAVIGATE' && result.navigateUrl) {
            current = await chrome.tabs.update(current.id, { url: result.navigateUrl });
            await waitForTab(current.id);
            continue;
          }
          break;
        } catch { break; }
      }
    }
  }
  await api(`/jobs/${encodeURIComponent(job.id)}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      status: result.status, affiliateUrl: result.affiliateUrl || null,
      errorCode: result.errorCode || null, step: result.step || null,
      pageType: result.pageType || null, durationMs: result.durationMs || 0,
    }),
  });
  return result;
}

async function heartbeat(mercadoLivreStatus = 'UNKNOWN', errorCode = null) {
  return api('/heartbeat', { method: 'POST', body: JSON.stringify({
    status: 'ONLINE', extensionVersion: EXTENSION_VERSION, adapterVersion: ADAPTER_VERSION,
    mercadoLivreStatus, errorCode,
  }) });
}

async function poll() {
  if (processing) return;
  processing = true;
  try {
    const state = await settings();
    if (!state.companionToken) return;
    const mercadoLivreStatus = await inspectMercadoLivreSession();
    if (mercadoLivreStatus === 'READY') await syncMercadoLivreSession().catch(() => undefined);
    await heartbeat(mercadoLivreStatus).catch(() => undefined);
    const job = await api('/jobs/claim', { method: 'POST', body: '{}' });
    if (job) {
      const result = await executeJob(job);
      const session = result.status === 'SUCCESS' ? 'READY'
        : result.errorCode === 'AUTH_REQUIRED' ? 'NEEDS_LOGIN'
          : ['CAPTCHA_REQUIRED','TWO_FACTOR_REQUIRED','USER_ACTION_REQUIRED'].includes(result.errorCode) ? 'NEEDS_USER_ACTION'
            : result.errorCode === 'PORTAL_CHANGED' ? 'PORTAL_CHANGED'
              : result.errorCode === 'PORTAL_UNAVAILABLE' ? 'PORTAL_UNAVAILABLE' : 'UNKNOWN';
      await heartbeat(session, result.errorCode || null).catch(() => undefined);
    }
  } catch { /* o próximo heartbeat retoma sem loop agressivo */ }
  finally {
    processing = false;
    clearTimeout(pollTimer);
    pollTimer = setTimeout(() => void poll(), 3_000);
  }
}

if (globalThis.chrome?.runtime) {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('promofy-companion', { periodInMinutes: 0.5 });
    void poll();
  });
  chrome.runtime.onStartup.addListener(() => void poll());
  chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'promofy-companion') void poll(); });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'PROMOFY_PAIR') {
      (async () => {
        const backendUrl = allowedBackend(message.backendUrl) ? new URL(message.backendUrl).origin : null;
        if (!backendUrl) throw new Error('BACKEND_NOT_ALLOWED');
        const response = await fetch(`${backendUrl}/api/browser-companion/extension/pair`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-promofy-companion-version': EXTENSION_VERSION },
          body: JSON.stringify({ code: message.code, name: message.name || 'Chrome', extensionVersion: EXTENSION_VERSION, adapterVersion: ADAPTER_VERSION }),
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error?.code || 'PAIRING_FAILED');
        await chrome.storage.local.set({ backendUrl, companionToken: payload.data.token, instance: payload.data.instance });
        await chrome.tabs.create({ url: PORTAL_URL, active: true });
        void poll();
        return payload.data.instance;
      })().then((data) => sendResponse({ success: true, data }), (error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (message?.type === 'PROMOFY_STATUS') {
      (async () => {
        const data = await settings();
        if (!data.companionToken) return { paired: false, instance: null, backendUrl: data.backendUrl };
        try {
          const heartbeatResult = await api('/heartbeat', {
            method: 'POST',
            body: JSON.stringify({
              status: 'ONLINE', extensionVersion: EXTENSION_VERSION,
              adapterVersion: ADAPTER_VERSION, mercadoLivreStatus: 'UNKNOWN',
            }),
          });
          const instance = heartbeatResult?.instance || data.instance || null;
          if (instance) await chrome.storage.local.set({ instance });
          return { paired: true, instance, backendUrl: data.backendUrl };
        } catch (error) {
          if (error?.message === 'COMPANION_UNAUTHORIZED') {
            return { paired: false, stale: true, instance: null, backendUrl: data.backendUrl };
          }
          return { paired: Boolean(data.companionToken), instance: data.instance || null, backendUrl: data.backendUrl };
        }
      })().then((data) => sendResponse({ success: true, data }), (error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (message?.type === 'PROMOFY_DISCONNECT') {
      (async () => {
        try {
          await api('/disconnect', { method: 'POST', body: '{}' });
          await clearLocalPairing();
          return { stale: false };
        } catch (error) {
          if (error?.message !== 'COMPANION_UNAUTHORIZED') throw error;
          await clearLocalPairing();
          return { stale: true };
        }
      })().then((data) => sendResponse({ success: true, ...data }), (error) => sendResponse({ success: false, error: error.message }));
      return true;
    }
    if (message?.type === 'PROMOFY_OPEN_ML') {
      chrome.tabs.create({ url: PORTAL_URL, active: true }).then(() => sendResponse({ success: true }));
      return true;
    }
    return false;
  });
  void poll();
}
