import express from 'express';
import { createServer } from 'vite';
import { appendFileSync } from 'node:fs';
import { db,auditUserId } from './cta-audit-fixture';
const { SupabaseCtaRepository }=await import('../src/backend/cta/SupabaseCtaRepository');
const { GeminiCtaProvider }=await import('../src/backend/cta/GeminiCtaProvider');
const { SupabaseCtaMemoryResetService }=await import('../src/backend/cta/SupabaseCtaMemoryResetService');
const { SupabaseUsageQuotaService }=await import('../src/backend/usage/SupabaseUsageQuotaService');
const { CtaIntelligenceService }=await import('../src/domain/cta/CtaIntelligenceService');
const { createCtaRouter }=await import('../src/backend/cta/router');
const { getAuthUser }=await import('../src/backend/middleware/auth');
const repository=new SupabaseCtaRepository(db);
const provider=new GeminiCtaProvider(process.env.GEMINI_API_KEY!);
const interpretChunk=provider.interpretTrainingChunk.bind(provider);
provider.interpretTrainingChunk=async(input)=>{const result=await interpretChunk(input);appendFileSync('.runtime/cta-audit-real/training-chunks.jsonl',JSON.stringify({chunkIndex:input.chunkIndex,chars:input.content.length,tail:input.content.slice(-1000),output:result.output})+'\n');return result;};
const service=new CtaIntelligenceService(repository,provider,new SupabaseCtaMemoryResetService(db),undefined,undefined,undefined,new SupabaseUsageQuotaService(db));
const app=express();app.use(express.json({limit:'8mb'}));
app.use('/api',async(req,res,next)=>{
  const user=await getAuthUser(req);
  if(user?.id!==auditUserId){res.status(403).json({success:false,error:{code:'AUDIT_ACCOUNT_REQUIRED',message:'Use a conta de auditoria.'}});return;}
  const started=Date.now();
  res.on('finish',()=>appendFileSync('.runtime/cta-audit-real/http.jsonl',JSON.stringify({path:req.path,method:req.method,status:res.statusCode,ms:Date.now()-started,chars:typeof req.body?.message==='string'?req.body.message.length:typeof req.body?.source==='string'?req.body.source.length:undefined})+'\n'));
  next();
});
app.use('/api/cta',createCtaRouter(service));
app.get('/api/products',async(_req,res)=>{
  const rows=await db.from('products').select('id').eq('user_id',auditUserId);
  const products=await Promise.all((rows.data??[]).map(row=>repository.getProduct(auditUserId,row.id)));
  res.json({success:true,data:products});
});
const html=`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><main style="max-width:1200px;margin:auto;padding:24px"><p>Auditoria com conta de teste • Gemini e banco reais</p><form id="login"><label>E-mail<input id="email" type="email" required></label><label>Senha<input id="password" type="password" required></label><button>Entrar</button><p id="error"></p></form><div id="root"></div></main><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {CtaStudioView} from '/src/views/CtaStudioView.tsx';import {supabase} from '/src/lib/supabase.ts';import '/src/index.css';
const root=createRoot(document.getElementById('root'));function show(){document.getElementById('login').hidden=true;root.render(React.createElement(CtaStudioView));}
document.getElementById('login').onsubmit=async(event)=>{event.preventDefault();const result=await supabase.auth.signInWithPassword({email:document.getElementById('email').value,password:document.getElementById('password').value});if(result.error)document.getElementById('error').textContent=result.error.message;else show();};
const {data}=await supabase.auth.getSession();if(data.session?.user?.id===${JSON.stringify(auditUserId)})show();
</script></body></html>`;
const vite=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
app.get('/',async(_req,res)=>res.type('html').send(await vite.transformIndexHtml('/',html)));
app.use(vite.middlewares);
app.listen(3107,'127.0.0.1',()=>console.log('Auditoria disponível em http://127.0.0.1:3107 — sem workers de envio.'));
