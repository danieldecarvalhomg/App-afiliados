import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";

type Attempt = { failures: number; lastFailureAt: number; blockedUntil: number };
const attempts = new Map<string, Attempt>();
const WINDOW_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 60_000;

function keyFor(req: Request, email: string) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return crypto.createHash("sha256").update(`${ip}|${email.trim().toLowerCase()}`).digest("hex");
}

export function createAuthRouter() {
  const router = Router();
  router.post("/login-check", (req: Request, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    if (!email || email.length > 320) return res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Dados inválidos." } });
    const key = keyFor(req, email);
    const attempt = attempts.get(key);
    const now = Date.now();
    if (!attempt || now - attempt.lastFailureAt > WINDOW_MS) return res.json({ success: true, data: { allowed: true } });
    if (attempt.blockedUntil > now) {
      return res.status(429).json({ success: false, error: { code: "AUTH_BACKOFF", message: "Aguarde alguns segundos antes de tentar novamente.", retryAfterSeconds: Math.ceil((attempt.blockedUntil - now) / 1000) } });
    }
    return res.json({ success: true, data: { allowed: true } });
  });

  router.post("/login-result", (req: Request, res: Response) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const success = req.body?.success === true;
    if (!email || email.length > 320) return res.status(400).json({ success: false, error: { code: "INVALID_REQUEST", message: "Dados inválidos." } });
    const key = keyFor(req, email);
    if (success) {
      attempts.delete(key);
      return res.json({ success: true });
    }
    const now = Date.now();
    const previous = attempts.get(key);
    const failures = previous && now - previous.lastFailureAt <= WINDOW_MS ? previous.failures + 1 : 1;
    const backoff = failures < 2 ? 0 : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures - 2, 6));
    attempts.set(key, { failures, lastFailureAt: now, blockedUntil: now + backoff });
    return res.json({ success: true, data: { retryAfterSeconds: Math.ceil(backoff / 1000) } });
  });
  return router;
}
