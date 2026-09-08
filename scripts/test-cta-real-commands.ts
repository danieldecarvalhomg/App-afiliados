import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { auditToken,auditUserId,db } from './cta-audit-fixture';
import { realCommandCases, longUserCommand } from './cta-real-command-cases';

const runName=process.env.CTA_AUDIT_RUN||'baseline';
const report=`.runtime/cta-audit-real/commands-${runName}.jsonl`;
writeFileSync(report,'');
const base='http://127.0.0.1:3107/api/cta';
export async function request(path:string,body?:unknown,method=body===undefined?'GET':'POST') {
  const response=await fetch(base+path,{method,headers:{authorization:`Bearer ${auditToken}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(240_000)});
  const value=await response.json();
  if(!response.ok || !value.success) throw Error(`${response.status}:${value.error?.code}:${value.error?.message}`);
  return value.data;
}
async function snapshot(){const [profile,memory,rules,examples]=await Promise.all([request('/profile'),request('/memory/learned'),request('/rules'),request('/examples')]);return {profile,memory,rules,examples};}
const only=process.env.CTA_AUDIT_ONLY?.split(',');
const results=[];
for(const test of realCommandCases.filter(test=>!only||only.includes(test.id))) {
  const started=Date.now();let before,after,result;
  try {
    if(test.reset) await request('/memory',undefined,'DELETE');
    before=await snapshot();result=await request('/assistant/message',{message:test.message});after=await snapshot();
    // Preferências gerais podem estar no perfil, sem uma segunda cópia na
    // memória semântica. Avalie o estado persistido completo.
    const text=JSON.stringify({memory:after.memory,preferences:after.profile.naturalLanguagePreferences}).toLowerCase();
    switch(test.check) {
      case 'no_learning':assert.equal(after.profile.version,before.profile.version,'Não deveria alterar versão/memória');assert.equal(after.examples.length,before.examples.length);break;
      case 'persistent':assert.equal(result.applied,true,'Preferência explícita não aplicada');assert.ok(after.profile.version>before.profile.version);break;
      case 'conditional':assert.ok(after.memory.conditional.length>before.memory.conditional.length);assert.equal(after.profile.emojiLevel,before.profile.emojiLevel);break;
      case 'exception':assert.ok(after.memory.exceptions.length>before.memory.exceptions.length);assert.equal(after.profile.emojiLevel,before.profile.emojiLevel);break;
      case 'medium':assert.equal(after.profile.length,'medium');break;
      case 'negative':assert.ok(after.memory.avoid.length>before.memory.avoid.length||after.examples.some((x:any)=>x.sentiment==='negative'));break;
      case 'positive_example':assert.ok(after.examples.filter((x:any)=>x.sentiment==='positive').length>before.examples.filter((x:any)=>x.sentiment==='positive').length);break;
      case 'negative_example':assert.ok(after.examples.filter((x:any)=>x.sentiment==='negative').length>before.examples.filter((x:any)=>x.sentiment==='negative').length);break;
      case 'two_examples':assert.ok(after.examples.length>=before.examples.length+2,'Perdeu um dos exemplos');break;
      case 'five_examples':assert.ok(after.examples.length>=before.examples.length+5,'Perdeu exemplos do lote de cinco');break;
      case 'mixed':assert.equal(after.profile.emojiLevel,'none');assert.ok(after.memory.exceptions.some((x:any)=>/brinquedos/i.test(JSON.stringify(x))));assert.ok(after.memory.conditional.some((x:any)=>/casa/i.test(JSON.stringify(x))));break;
      case 'template':assert.match(result.reply,/Templates/i);assert.equal(after.profile.version,before.profile.version);break;
      case 'long':assert.ok(/emoji/.test(text));assert.ok(/garantia|certifica|médic|cura/.test(text),'Perdeu regra do meio');assert.ok(/estoque|encerramento|imperdível/.test(text),'Perdeu regra do fim');assert.equal(after.profile.emojiLevel,'none');break;
    }
    const record={id:test.id,passed:true,chars:test.message.length,ms:Date.now()-started,message:test.message,result,before,after};results.push(record);appendFileSync(report,JSON.stringify(record)+'\n');console.log(JSON.stringify({id:test.id,passed:true,chars:record.chars,ms:record.ms,reply:result.reply}));
  } catch(error) {
    const record={id:test.id,passed:false,chars:test.message.length,ms:Date.now()-started,message:test.message,error:error instanceof Error?error.message:String(error),result,before,after};results.push(record);appendFileSync(report,JSON.stringify(record)+'\n');console.log(JSON.stringify({id:test.id,passed:false,chars:record.chars,error:record.error}));
  }
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,5000-(Date.now()-started))));
}
// Fontes muito longas usam o fluxo de revisão e aplicação, como na interface.
if(!only || only.includes('training_120000')) {
  try {
    const source=longUserCommand(120000)+'\nExemplo positivo: "Uma ajuda para a rotina da casa".\nExemplo negativo: "Corre, estoque vai acabar!".';
    const review=await request('/training/analyze',{source});
    assert.equal(review.source.charCount,source.length);assert.ok(review.source.chunkCount>=10);assert.ok(review.counts.positiveExamples>0);assert.ok(review.counts.negativeExamples>0);
    const applied=await request(`/training/${review.source.id}/apply`,{});assert.equal(applied.applied,true);
    const {data}=await db.from('cta_training_sources').select('original_content,status').eq('id',review.source.id).eq('user_id',auditUserId).single();
    assert.equal(data?.original_content,source);assert.equal(data?.status,'applied');
    appendFileSync(report,JSON.stringify({id:'training_120000',passed:true,chars:source.length,review,applied})+'\n');console.log(JSON.stringify({id:'training_120000',passed:true,chars:source.length,items:applied.items}));
  } catch(error){process.exitCode=1;appendFileSync(report,JSON.stringify({id:'training_120000',passed:false,error:error instanceof Error?error.message:String(error)})+'\n');console.log('training_120000 FAILED',error instanceof Error?error.message:'error');}
}
if(results.some(result=>!result.passed)) process.exitCode=1;
console.log(`Relatório: ${report}`);
