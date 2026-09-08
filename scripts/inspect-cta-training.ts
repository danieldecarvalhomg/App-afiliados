import {db,auditUserId} from './cta-audit-fixture';
const {data,error}=await db.from('cta_training_sources').select('id,status,char_count,chunk_count,interpretation').eq('user_id',auditUserId).order('created_at',{ascending:false}).limit(1);
const latest=data?.[0];const items=Array.isArray((latest?.interpretation as any)?.items)?(latest!.interpretation as any).items:[];
console.log(JSON.stringify({source:latest&&{id:latest.id,status:latest.status,charCount:latest.char_count,chunkCount:latest.chunk_count},error,items:items.map((item:any)=>({kind:item.kind,scope:item.scope,polarity:item.polarity,condition:item.condition,text:item.semanticText.slice(0,130)}))},null,2));
