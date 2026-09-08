import type { NextFunction, Request, Response } from 'express';

export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const analyticsEnabled = Boolean(process.env.VITE_GOOGLE_ANALYTICS_ID?.trim());
  const marketingEnabled = Boolean(process.env.VITE_META_PIXEL_ID?.trim());
  const scriptSources = ["'self'", ...(isDevelopment ? ["'unsafe-inline'"] : []), ...(analyticsEnabled ? ['https://www.googletagmanager.com'] : []), ...(marketingEnabled ? ['https://connect.facebook.net'] : [])];
  const connectSources = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', 'ws:', 'wss:', ...(analyticsEnabled ? ['https://www.google-analytics.com', 'https://analytics.google.com'] : []), ...(marketingEnabled ? ['https://www.facebook.com'] : [])];
  const imageSources = ["'self'", 'data:', 'blob:', 'https:', ...(analyticsEnabled ? ['https://www.google-analytics.com'] : []), ...(marketingEnabled ? ['https://www.facebook.com'] : [])];
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSources.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src ${imageSources.join(' ')}`,
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src ${connectSources.join(' ')}`,
  ].join('; '));
  next();
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of [process.env.APP_URL, ...(process.env.CORS_ALLOWED_ORIGINS ?? '').split(',')]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    try { origins.add(new URL(trimmed).origin); } catch { /* configuração inválida é ignorada */ }
  }
  return origins;
}

const DEFAULT_COMPANION_EXTENSION_ID = 'jdgofijdlokmlnnbbfmdliddhfhcgdai';
function companionOrigins(): Set<string> {
  const ids = (process.env.BROWSER_COMPANION_EXTENSION_IDS ?? DEFAULT_COMPANION_EXTENSION_ID)
    .split(',').map((value) => value.trim().toLowerCase()).filter((value) => /^[a-p]{32}$/u.test(value));
  return new Set(ids.map((id) => `chrome-extension://${id}`));
}

export function sameOriginCors(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!origin) return next();
  const allowed = configuredOrigins();
  const host = req.headers.host;
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (req.path.startsWith('/api/browser-companion/') && companionOrigins().has(origin)) {
    allowed.add(origin);
  }
  if (!allowed.has(origin)) {
    res.status(403).json({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origem não permitida.' } });
    return;
  }
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Last-Event-ID, X-AfiliHub-Companion-Version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter(options: RateLimitOptions) {
  const buckets = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + options.windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    buckets.set(key, bucket);
    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) if (value.resetAt <= now) buckets.delete(bucketKey);
    }
    res.setHeader('RateLimit-Limit', String(options.max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1_000)));
    if (bucket.count > options.max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1_000)));
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Muitas solicitações. Tente novamente em alguns minutos.' } });
      return;
    }
    next();
  };
}
