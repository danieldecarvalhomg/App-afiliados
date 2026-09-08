import type {SupabaseClient} from '@supabase/supabase-js';

export class SupabaseCtaMemoryResetService{
  constructor(private db:SupabaseClient){}
  async reset(userId:string):Promise<void>{
    const{error}=await this.db.rpc('reset_cta_memory',{p_user_id:userId});
    if(error)throw error;
  }
}
