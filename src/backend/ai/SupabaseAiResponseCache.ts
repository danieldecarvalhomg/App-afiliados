import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiCachedResponse, AiResponseCache } from '../../domain/ai/AiResponseCache';

export class SupabaseAiResponseCache implements AiResponseCache {
  constructor(private readonly db: SupabaseClient) {}

  async get(kind: 'promotion' | 'media', key: string): Promise<AiCachedResponse | null> {
    const now=new Date().toISOString();
    const {data,error}=await this.db.from('ai_response_cache').select('payload,provider,model,expires_at')
      .eq('cache_kind',kind).eq('cache_key',key).gt('expires_at',now).maybeSingle();
    if(error){if(['42P01','PGRST205'].includes((error as {code?:string}).code??''))return null;throw error;}
    if(!data)return null;
    void this.db.rpc('touch_ai_response_cache',{p_kind:kind,p_key:key}).then(()=>undefined,()=>undefined);
    return {payload:data.payload,provider:data.provider,model:data.model,expiresAt:data.expires_at};
  }

  async set(input:{kind:'promotion'|'media';key:string;payload:unknown;provider:string;model:string;expiresAt:string}):Promise<void>{
    const now=new Date().toISOString();
    const {error}=await this.db.from('ai_response_cache').upsert({
      cache_kind:input.kind,cache_key:input.key,payload:input.payload,provider:input.provider,
      model:input.model,expires_at:input.expiresAt,last_used_at:now,updated_at:now,
    },{onConflict:'cache_kind,cache_key'});
    if(error&&!['42P01','PGRST205'].includes((error as {code?:string}).code??''))throw error;
  }
}
