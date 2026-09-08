/**
 * AfiliHub — Middleware de Autenticação (Backend)
 *
 * O backend NUNCA confia em user_id enviado pelo frontend via body ou query.
 *
 * Fluxo correto:
 *   Frontend → Supabase Auth → Access Token (JWT)
 *     → Backend → validação do JWT → auth.uid() confiável
 *
 * Uso nas rotas:
 *   const user = await getAuthUser(req);
 *   if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
 *   // Agora user.id é confiável — use-o para filtrar dados
 */

import type { Request } from 'express';
import { getBackendAuthClient } from '../supabaseBackend';

export interface AuthUser {
  id: string;
  email: string | null;
}

const AUTH_CACHE_MS = 30_000;
const authCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const pendingAuth = new Map<string, Promise<AuthUser | null>>();

async function validateToken(token: string): Promise<AuthUser | null> {
  const authClient = getBackendAuthClient();
  if (!authClient) return null;
  const cached = authCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  if (cached) authCache.delete(token);
  const pending = pendingAuth.get(token);
  if (pending) return pending;
  const validation = (async () => {
    try {
      const { data: { user }, error } = await authClient.auth.getUser(token);
      if (error || !user) return null;
      const value = { id: user.id, email: user.email ?? null };
      authCache.set(token, { user: value, expiresAt: Date.now() + AUTH_CACHE_MS });
      if (authCache.size > 200) {
        const oldest = authCache.keys().next().value;
        if (oldest) authCache.delete(oldest);
      }
      return value;
    } catch {
      return null;
    } finally {
      pendingAuth.delete(token);
    }
  })();
  pendingAuth.set(token, validation);
  return validation;
}

/**
 * Extrai e valida o usuário autenticado do header Authorization.
 *
 * Retorna null se:
 *   - Header Authorization ausente
 *   - Token inválido ou expirado
 *   - Supabase não configurado
 */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;

  return validateToken(token);
}
