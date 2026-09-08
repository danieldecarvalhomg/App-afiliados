import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '[AfiliHub] Variáveis de ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY são obrigatórias.\n' +
    'Copie o arquivo .env.example para .env e preencha com suas credenciais do Supabase.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

export async function checkSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    const { error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116' && !error.message.includes('does not exist')) {
      console.warn('[AfiliHub:Supabase] Warning:', error.message);
    }
    return { connected: true, message: 'Conectado com sucesso ao Supabase.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Falha ao conectar ao Supabase.';
    console.error('[AfiliHub:Supabase] Erro de conexão:', err);
    return { connected: false, message };
  }
}

/**
 * Retorna o ID do usuário autenticado, ou null se não autenticado.
 * Usar apenas no frontend. O backend deve usar getAuthUser() do middleware.
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}
