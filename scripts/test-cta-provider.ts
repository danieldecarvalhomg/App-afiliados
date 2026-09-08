import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

config({ quiet: true });
const { GeminiCtaProvider } = await import("../src/backend/cta/GeminiCtaProvider");
const { CtaPreferenceAgent } = await import("../src/domain/cta/CtaPreferenceAgent");
const { TrainingIngestionService } = await import("../src/domain/cta/TrainingIngestionService");
const { CtaGenerationService } = await import("../src/domain/cta/CtaGenerationService");
if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");
const provider = new GeminiCtaProvider(process.env.GEMINI_API_KEY);
const profile = { id:"audit-profile",userId:"audit-user",tone:"natural",length:"short",emojiLevel:"none",repetitionMode:"balanced",structuredPreferences:{},naturalLanguagePreferences:null,version:1,memoryEpoch:1,createdAt:"",updatedAt:"" };
const product = { id:"audit-product",userId:"audit-user",title:"Echo Dot",category:"Eletrônicos",marketplace:"amazon",price:249,originalPrice:null,discountPercent:null,couponCode:null,freeShipping:false,affiliateUrl:null,sourceUrl:null };
const repository = {
  getProduct:async()=>product,getOrCreateProfile:async()=>profile,listRules:async()=>[],listRelevantExamples:async()=>[],listRecentGenerations:async()=>[],listRelevantMemory:async()=>[],listMemoryItems:async()=>[],
  createTrainingSource:async(_u: string,input: object)=>({id:"audit-source",status:"analyzing",...input}),
  saveTrainingReview:async(_u: string,_s: string,review: object)=>review,
  failTrainingSource:async()=>{},
};
const results: Array<Record<string, unknown>> = [];
async function check(name: string, action: () => Promise<unknown>) {
  const start=Date.now();
  try { const value=await action(); results.push({name,passed:true,durationMs:Date.now()-start,value}); }
  catch(error) { results.push({name,passed:false,durationMs:Date.now()-start,error:error instanceof Error ? error.message : "UNKNOWN"}); }
  console.log(JSON.stringify(results.at(-1)));
}
await check("instrução persistente",async()=>{
  const value=await new CtaPreferenceAgent(provider).interpret({message:"Daqui para frente, escreva CTAs curtos, naturais e sem emojis. Não invente urgência.",profile,blueprint:{id:"audit",blocks:[]},rules:[],recentGenerations:[]} as never);
  assert.equal(value.output.scope,"persistent"); assert.equal(value.output.requiresConfirmation,false);
  return {reply:value.output.reply,scope:value.output.scope};
});
await check("importação e reconciliação",async()=>{
  const review=await new TrainingIngestionService(repository as never,provider).analyze("audit-user","Use linguagem natural e não invente urgência. Em produtos de casa, fale de situações cotidianas. Exemplo positivo: ‘Uma ajuda para a rotina da casa’. Exemplo negativo: ‘Última chance, compre já!’.");
  assert.ok(review.items.length>0);
  assert.ok(review.counts.positiveExamples>0 && review.counts.negativeExamples>0, "Exemplos rotulados devem ser preservados");
  return {items:review.items.length,counts:review.counts};
});
await check("três CTAs do produto fictício",async()=>{
  const values=await new CtaGenerationService(repository as never,provider).testCta("audit-user","audit-product",{count:3});
  assert.ok(values.length>0); assert.ok(values.every(item=>item.text && !/https?:|R\$/u.test(item.text)));
  return {count:values.length,ctas:values};
});
mkdirSync(".runtime/cta-audit",{recursive:true});
writeFileSync(".runtime/cta-audit/provider-results.json",JSON.stringify({model:provider.model,results},null,2));
if(results.some(item=>!item.passed)) process.exitCode=1;
