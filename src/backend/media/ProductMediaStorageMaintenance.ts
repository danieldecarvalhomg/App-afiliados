import type { SupabaseClient } from '@supabase/supabase-js';

export class ProductMediaStorageMaintenance{
  private timer:NodeJS.Timeout|null=null;private running=false;
  constructor(private readonly db:SupabaseClient,private readonly intervalMs=6*60*60_000){}
  async run():Promise<number>{if(this.running)return 0;this.running=true;try{const{data,error}=await this.db.from('product_media_cleanup_queue').select('storage_path,attempt_count').order('created_at').limit(100);if(error)throw error;let removed=0;for(const row of data??[]){const result=await this.db.storage.from('product-media').remove([row.storage_path]);if(result.error){await this.db.from('product_media_cleanup_queue').update({attempt_count:Number(row.attempt_count)+1,last_error:result.error.message.slice(0,200)}).eq('storage_path',row.storage_path);continue;}await this.db.from('product_media_cleanup_queue').delete().eq('storage_path',row.storage_path);removed++;}return removed;}finally{this.running=false;}}
  start(){if(this.timer)return;void this.run().catch(()=>undefined);this.timer=setInterval(()=>void this.run().catch(()=>undefined),this.intervalMs);this.timer.unref?.();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
