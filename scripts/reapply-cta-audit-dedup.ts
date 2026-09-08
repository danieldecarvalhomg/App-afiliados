import assert from 'node:assert/strict';
import {auditUserId,db} from './cta-audit-fixture';
import {SupabaseCtaRepository} from '../src/backend/cta/SupabaseCtaRepository';
import {dedupeTrainingItems,chunkTrainingSource} from '../src/domain/cta/TrainingIngestionService';

const {data:prior,error}=await db.from('cta_training_sources').select('original_content,interpretation').eq('user_id',auditUserId).eq('status','applied').order('created_at',{ascending:false}).limit(1).single();
if(error)throw error;
const interpretation=prior.interpretation as any;
const items=dedupeTrainingItems(interpreationItems(interpretation));
const counts={
  rules:items.filter(item=>item.kind==='instruction'||item.kind==='correction').length,
  conditions:items.filter(item=>item.scope==='conditional'||item.scope==='exception').length,
  avoided:items.filter(item=>item.polarity==='negative').length,
  positiveExamples:items.filter(item=>item.kind==='positive_example').length,
  negativeExamples:items.filter(item=>item.kind==='negative_example').length,
};
const reset=await db.rpc('reset_cta_memory',{p_user_id:auditUserId});if(reset.error)throw reset.error;
const repository=new SupabaseCtaRepository(db);
const profile=await repository.getOrCreateProfile(auditUserId);
const source=await repository.createTrainingSource(auditUserId,{content:prior.original_content,charCount:prior.original_content.length,chunkCount:chunkTrainingSource(prior.original_content).length});
const review=await repository.saveTrainingReview(auditUserId,source.id,{summary:interpretation.summary??[],items,counts,conflicts:interpretation.conflicts??[]});
const version=await repository.applyTrainingMemory(auditUserId,profile.id,source.id,review);
const active=await repository.listMemoryItems(auditUserId,true);
assert.equal(active.length,items.length);
console.log({reapplied:true,items:items.length,memoryVersion:version,positiveExamples:counts.positiveExamples,negativeExamples:counts.negativeExamples});

function interpreationItems(value:any){
  if(!Array.isArray(value?.items))throw new Error('CTA_AUDIT_REVIEW_ITEMS_MISSING');
  return value.items;
}
