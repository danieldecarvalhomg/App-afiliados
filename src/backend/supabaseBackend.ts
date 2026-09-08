import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let authClient: SupabaseClient | null | undefined;
let adminClient: SupabaseClient | null | undefined;

export function getBackendAuthClient(): SupabaseClient | null {
  if (authClient !== undefined) return authClient;
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  authClient = url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  if (!authClient) {
    console.error('[AfiliHub:Auth] SUPABASE_URL ou SUPABASE_ANON_KEY não configurados.');
  }
  return authClient;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient !== undefined) return adminClient;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  adminClient = url && serviceRoleKey
    ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  if (!adminClient) {
    console.error('[AfiliHub:Backend] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
  }
  return adminClient;
}
