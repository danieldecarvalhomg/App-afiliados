import{describe,expect,it,vi}from'vitest';import{SupabaseCtaMemoryResetService}from'./SupabaseCtaMemoryResetService';
describe('SupabaseCtaMemoryResetService',()=>{
  it('deriva ownership no backend e chama uma única RPC atômica',async()=>{const rpc=vi.fn().mockResolvedValue({error:null});await new SupabaseCtaMemoryResetService({rpc}as any).reset('user-a');expect(rpc).toHaveBeenCalledOnce();expect(rpc).toHaveBeenCalledWith('reset_cta_memory',{p_user_id:'user-a'});});
  it('propaga erro sem informar sucesso parcial',async()=>{const error=new Error('rollback');const rpc=vi.fn().mockResolvedValue({error});await expect(new SupabaseCtaMemoryResetService({rpc}as any).reset('user-a')).rejects.toBe(error);});
});
