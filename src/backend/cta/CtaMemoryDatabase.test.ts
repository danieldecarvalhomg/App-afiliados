import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const u = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
const p = "00000000-0000-0000-0000-000000000003";
const s = "00000000-0000-0000-0000-000000000004";
const instruction = { kind: "instruction", scope: "persistent", semanticText: "Use linguagem natural", condition: {}, polarity: "positive", priority: 80 };
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql AS 'SELECT NULL::uuid';
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE cta_profiles(id UUID PRIMARY KEY,user_id UUID UNIQUE REFERENCES auth.users,version INTEGER DEFAULT 1,memory_epoch INTEGER DEFAULT 1,tone TEXT,length TEXT,emoji_level TEXT,repetition_mode TEXT,structured_preferences JSONB,natural_language_preferences TEXT,updated_at TIMESTAMPTZ);
    CREATE TABLE cta_rules(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,profile_id UUID,rule_type TEXT,value TEXT,scope TEXT DEFAULT 'persistent',condition JSONB DEFAULT '[]',active BOOLEAN DEFAULT TRUE,archived_at TIMESTAMPTZ,updated_at TIMESTAMPTZ);
    CREATE TABLE cta_examples(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID,original_text TEXT,active BOOLEAN DEFAULT TRUE);
    CREATE TABLE cta_feedback(user_id UUID); CREATE TABLE cta_inferred_preferences(user_id UUID);
    CREATE TABLE cta_conversations(user_id UUID); CREATE TABLE cta_profile_versions(user_id UUID);
    CREATE TABLE message_templates(id UUID PRIMARY KEY,user_id UUID,name TEXT);
    CREATE TABLE products(id UUID PRIMARY KEY,user_id UUID,title TEXT);
  `);
  const original = readFileSync("supabase/migrations/20260827160000_cta_trainer_template_engine.sql", "utf8");
  const start = original.indexOf("CREATE TABLE IF NOT EXISTS public.cta_training_sources");
  const end = original.indexOf("DROP FUNCTION IF EXISTS", start);
  await db.exec(original.slice(start, end));
  if (process.env.CTA_AUDIT_BASELINE !== "true") await db.exec(readFileSync("supabase/migrations/20260905150000_cta_trainer_audit.sql", "utf8"));
}, 30_000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec(`TRUNCATE auth.users,cta_profiles,cta_training_sources,cta_memory_items,cta_memory_versions,cta_rules,cta_examples,message_templates,products CASCADE;
    INSERT INTO auth.users VALUES ('${u}'),('${other}'); INSERT INTO cta_profiles(id,user_id) VALUES ('${p}','${u}');
    INSERT INTO cta_training_sources(id,user_id,original_content,char_count,chunk_count,status) VALUES ('${s}','${u}','manual',6,1,'review');`);
});
const apply = (items: unknown[] = [instruction], conflicts: unknown[] = []) => db.query("SELECT apply_cta_training_memory($1,$2,$3,$4,$5,'[]') AS version", [u,p,s,JSON.stringify(items),JSON.stringify(conflicts)]);
const record = (items: unknown[]) => db.query("SELECT record_cta_conversation_memory($1,$2,$3)",[u,p,JSON.stringify(items)]);
const active = async () => (await db.query<{ id: string }>("SELECT * FROM cta_memory_items WHERE active")).rows;

describe("memória CTA no PostgreSQL local", () => {
  it("aplica revisão, persiste snapshot e rejeita reaplicação", async () => {
    expect((await apply()).rows[0]).toEqual({ version:1 });
    expect(await active()).toHaveLength(1);
    expect((await db.query("SELECT status FROM cta_training_sources")).rows[0]).toEqual({status:"applied"});
    await expect(apply()).rejects.toThrow("CTA_TRAINING_REVIEW_NOT_FOUND");
  });
  it("reverte toda a transação quando um item é inválido", async () => {
    await expect(apply([instruction,{...instruction,kind:"invalid"}])).rejects.toThrow();
    expect(await active()).toHaveLength(0);
    expect((await db.query("SELECT status FROM cta_training_sources")).rows[0]).toEqual({status:"review"});
  });
  it("isola proprietário do perfil e da revisão", async () => {
    await expect(db.query("SELECT apply_cta_training_memory($1,$2,$3,'[]','[]','[]')",[other,p,s])).rejects.toThrow("CTA_PROFILE_OWNER_MISMATCH");
    await db.query("UPDATE cta_training_sources SET user_id=$1",[other]);
    await expect(apply()).rejects.toThrow("CTA_TRAINING_REVIEW_NOT_FOUND");
  });
  it("importação elimina duplicatas existentes e itens one-off", async () => {
    await record([instruction]);
    await apply([instruction,{...instruction,scope:"one_off",semanticText:"Só agora"}]);
    expect(await active()).toHaveLength(1);
  });
  it("conversa preserva regra geral ao inserir exceção com mesmo texto", async () => {
    await record([instruction]);
    await record([{...instruction,scope:"exception",condition:{category:"Casa"}}]);
    expect(await active()).toHaveLength(2);
  });
  it("reconciliação mantém regra anterior quando a revisão preserva ambas", async () => {
    await record([instruction]);
    const exception={...instruction,scope:"exception",semanticText:"Use humor em brinquedos",condition:{category:"Brinquedos"}};
    await apply([instruction,exception],[{prior:instruction.semanticText,replacement:exception.semanticText,resolution:"coexistir"}]);
    expect(await active()).toHaveLength(2);
  });
  it("remoção retira também a regra determinística equivalente e é idempotente", async () => {
    await record([instruction]);
    await db.query("INSERT INTO cta_rules(user_id,profile_id,value) VALUES($1,$2,$3)",[u,p,instruction.semanticText]);
    const id=(await active())[0].id;
    await db.query("SELECT deactivate_cta_memory_item($1,$2)",[u,id]);
    expect((await db.query("SELECT active FROM cta_rules")).rows[0]).toEqual({active:false});
    expect((await db.query("SELECT deactivate_cta_memory_item($1,$2) AS removed",[u,id])).rows[0]).toEqual({removed:false});
  });
  it("feedback e regras invalidam a versão usada por cache e reuso", async () => {
    await db.query("INSERT INTO cta_examples(user_id,original_text) VALUES($1,'CTA positivo')",[u]);
    expect((await db.query("SELECT version FROM cta_profiles")).rows[0]).toEqual({version:2});
    await db.query("DELETE FROM cta_examples WHERE user_id=$1",[u]);
    expect((await db.query("SELECT version FROM cta_profiles")).rows[0]).toEqual({version:3});
  });
  it("reset limpa aprendizagem, invalida revisão antiga e preserva produto/template", async () => {
    await record([instruction]);
    await db.query("INSERT INTO products VALUES(gen_random_uuid(),$1,'Produto');",[u]);
    await db.query("INSERT INTO message_templates VALUES(gen_random_uuid(),$1,'Template');",[u]);
    await db.query("SELECT reset_cta_memory($1)",[u]);
    expect(await active()).toHaveLength(0);
    expect((await db.query("SELECT memory_epoch FROM cta_profiles")).rows[0]).toEqual({memory_epoch:2});
    expect((await db.query("SELECT * FROM products")).rows).toHaveLength(1);
    expect((await db.query("SELECT * FROM message_templates")).rows).toHaveLength(1);
    await expect(apply()).rejects.toThrow("CTA_TRAINING_REVIEW_NOT_FOUND");
  });
  it("cliente authenticated não pode chamar RPC administrativa", async () => {
    await db.exec("SET ROLE authenticated");
    try { await expect(db.query("SELECT reset_cta_memory($1)",[u])).rejects.toThrow("permission denied"); }
    finally { await db.exec("RESET ROLE"); }
  });
});
