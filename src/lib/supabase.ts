import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://gizosgydmrkxtpgazjhq.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_b-KQsmL_nQmgHPsbGYUBoQ_6B057H7K';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function checkSupabaseConnection(): Promise<{ connected: boolean; message: string }> {
  try {
    const { error } = await supabase.from('products').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116' && !error.message.includes('relation "public.products" does not exist')) {
      console.warn('Supabase warning:', error.message);
    }
    return { connected: true, message: 'Conectado com sucesso ao novo projeto Supabase!' };
  } catch (err: any) {
    console.error('Erro na conexão com Supabase:', err);
    return { connected: false, message: err.message || 'Falha ao conectar ao Supabase.' };
  }
}
