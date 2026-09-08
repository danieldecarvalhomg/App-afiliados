import { config, parse } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
config({ quiet: true });
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession:false, autoRefreshToken:false } });
const file = '.env.cta-audit';
let credentials = existsSync(file) ? parse(readFileSync(file)) : null;
if (!credentials) {
  const email = `cta-audit-${Date.now()}@example.com`;
  const password = randomBytes(30).toString('base64url');
  const {data,error} = await db.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Auditoria CTA — conta de teste'}});
  if(error) throw error;
  credentials={CTA_AUDIT_EMAIL:email,CTA_AUDIT_PASSWORD:password,CTA_AUDIT_USER_ID:data.user.id};
  writeFileSync(file,Object.entries(credentials).map(([k,v])=>`${k}=${v}`).join('\n'));
  const plan=await db.rpc('apply_subscription_plan',{p_user_id:data.user.id,p_plan_code:'pro',p_billing_mode:'preview'});
  if(plan.error) throw plan.error;
}
export const auditCredentials=credentials;
export const auditUserId=credentials.CTA_AUDIT_USER_ID;
const existing=await db.from('products').select('id,title').eq('user_id',auditUserId);
if(existing.error) throw existing.error;
if(!existing.data?.length) {
  const inserted=await db.from('products').insert([
    {user_id:auditUserId,title:'Echo Dot 5ª geração — dispositivo de teste',category:'Eletrônicos',marketplace:'amazon',source_type:'manual',price:249,affiliate_status:'pending_url'},
    {user_id:auditUserId,title:'Air Fryer Mondial 4 litros — dispositivo de teste',category:'Casa',marketplace:'shopee',source_type:'manual',price:299,affiliate_status:'pending_url'},
  ]).select('id,title');
  if(inserted.error) throw inserted.error;
}
const auth = createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const login=await auth.auth.signInWithPassword({email:credentials.CTA_AUDIT_EMAIL,password:credentials.CTA_AUDIT_PASSWORD});
if(login.error) throw login.error;
export const auditToken=login.data.session!.access_token;
