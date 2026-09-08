import { describe, expect, it, vi } from "vitest";
import { SupabaseCtaRepository } from "./SupabaseCtaRepository";

function query(result: unknown) {
  const chain: Record<string, any> = {};
  for (const name of ["select","eq","insert","update","order","limit","single","maybeSingle"]) chain[name]=vi.fn(()=>chain);
  chain.then=(resolve: (value: unknown)=>unknown,reject: (error: unknown)=>unknown)=>Promise.resolve(result).then(resolve,reject);
  return chain;
}
const row = {id:"p",user_id:"u",version:4};
describe("persistência do treinador", () => {
  it("recupera perfil criado por outra requisição simultânea", async () => {
    const initial=query({data:null,error:null}), insert=query({data:null,error:{code:"23505"}}), existing=query({data:row,error:null});
    const db={from:vi.fn().mockReturnValueOnce(initial).mockReturnValueOnce(insert).mockReturnValueOnce(existing)};
    const result=await new SupabaseCtaRepository(db as never).getOrCreateProfile("u");
    expect(result.version).toBe(4); expect(existing.eq).toHaveBeenCalledWith("user_id","u");
  });
  it("não mascara erro diferente de conflito de unicidade", async () => {
    const error={code:"42501"};
    const db={from:vi.fn().mockReturnValueOnce(query({data:null,error:null})).mockReturnValueOnce(query({data:null,error}))};
    await expect(new SupabaseCtaRepository(db as never).getOrCreateProfile("u")).rejects.toEqual(error);
  });
  it("análise terminando após reset não ressuscita revisão", async () => {
    const chain=query({data:null,error:null});
    const repository=new SupabaseCtaRepository({from:()=>chain} as never);
    await expect(repository.saveTrainingReview("u","s",{} as never)).rejects.toThrow("CTA_TRAINING_SOURCE_NOT_FOUND");
    expect(chain.eq).toHaveBeenCalledWith("status","analyzing");
    expect(chain.eq).toHaveBeenCalledWith("user_id","u");
  });
  it("falha atrasada não sobrescreve status de reset/aplicação", async () => {
    const chain=query({data:null,error:null});
    await new SupabaseCtaRepository({from:()=>chain} as never).failTrainingSource("u","s","CTA_AI_TIMEOUT");
    expect(chain.eq).toHaveBeenCalledWith("status","analyzing");
  });
  it("lista de exemplos do usuário não fica limitada aos 20 da busca contextual", async () => {
    const chain=query({data:Array.from({length:35},(_,i)=>({id:String(i),original_text:"CTA",sentiment:"positive"})),error:null});
    const items=await new SupabaseCtaRepository({from:()=>chain} as never).listExamples("u");
    expect(items).toHaveLength(35); expect(chain.limit).toHaveBeenCalledWith(100);
    expect(chain.eq).toHaveBeenCalledWith("user_id","u"); expect(chain.eq).toHaveBeenCalledWith("active",true);
  });
});
