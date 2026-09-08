import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {auditToken,auditUserId,db} from './cta-audit-fixture';
const report:any[]=[];
async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST'){
  const response=await fetch('http://127.0.0.1:3107/api/cta'+path,{method,headers:{authorization:`Bearer ${auditToken}`,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(240000)});
  const value=await response.json();if(!response.ok)throw Error(`${response.status}:${value.error?.code}`);return value.data;
}
async function check(id:string,action:()=>Promise<unknown>){try{const result=await action();report.push({id,passed:true,result});console.log(JSON.stringify(report.at(-1)));}catch(error){report.push({id,passed:false,error:String(error)});console.log(JSON.stringify(report.at(-1)));process.exitCode=1;}writeFileSync('.runtime/cta-audit-real/generation-final.json',JSON.stringify(report,null,2));}
const products=await db.from('products').select('id,title').eq('user_id',auditUserId);if(products.error)throw products.error;
for(const product of products.data??[])await check(`three_ctas_${product.title}`,async()=>{
  const before=await api('/profile');const values=await api(`/products/${product.id}/test-cta`,{count:3});
  assert.equal(values.length,3);assert.equal(new Set(values.map((v:any)=>v.text)).size,3);
  for(const value of values){assert.ok(value.text.length>10);assert.doesNotMatch(value.text,/\p{Extended_Pictographic}|https?:|R\$|imperdível|estoque|última chance|garantid|sem usar as mãos|refeições mais rápidas|automação residencial/iu);assert.ok(value.text.trim().endsWith('?'),'Manual pede pergunta quando não há descrição confirmada');}
  assert.equal((await api('/profile')).version,before.version);return values;
});
await check('feedback_and_remove',async()=>{
  const before=await api('/profile');const text='Auditoria: uma ideia simples para a cozinha';
  await api('/examples',{text,sentiment:'positive'});const examples=await api('/examples');const example=examples.find((item:any)=>item.text===text);
  assert.ok(example);assert.ok((await api('/profile')).version>before.version);
  await api(`/examples/${example.id}`,undefined,'DELETE');assert.ok(!(await api('/examples')).some((item:any)=>item.id===example.id));return {saved:true,removed:true};
});
await check('reject_oversized_and_invalid_without_learning',async()=>{
  const before=await api('/profile');let rejected=0;
  for(const [path,body] of [['/assistant/message',{message:'x'.repeat(100001)}],['/assistant/message',{message:'   '}],['/assistant/message',{message:{text:'abc'}}],['/training/analyze',{source:'x'.repeat(1000001)}],[`/products/${products.data![0].id}/test-cta`,{count:2}]] as const){
    try{await api(path,body);assert.fail('Pedido inválido aceito');}catch(error){assert.match(String(error),/400:|413:/);rejected++;}
  }
  assert.equal((await api('/profile')).version,before.version);return {rejected};
});
