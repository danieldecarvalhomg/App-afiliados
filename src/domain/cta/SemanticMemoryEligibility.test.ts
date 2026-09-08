import { describe, expect, it } from "vitest";
import { semanticMemoryEligible } from "./SemanticMemoryEligibility";
import { PreferenceConflictResolver } from "./PreferenceConflictResolver";
import type { CtaMemoryItem, CtaRule } from "./types";
const facts = { title: "Echo Dot", category: "Eletrônicos", marketplace: "amazon" };
const memory = { active:true,scope:"conditional",semanticText:"Echo Dot em oferta, somente na Shopee",condition:{} } as CtaMemoryItem;
describe("condições da memória", () => {
  it.each([
    [{marketplace:"shopee"},false], [{category:"Casa"},false],
    [{category:"eletronicos",marketplace:"amazon"},true], [{category:"Eletrônicos",marketplace:"shopee"},false],
    [{category:["Casa","Eletrônicos"]},true], [{product:"Echo"},true],
    [{conditions:[{field:"marketplace",operator:"neq",value:"amazon"}]},false],
    [{conditions:[{field:"category",operator:"eq",value:"eletronicos"}]},true],
    [{conditions:[{field:"category",operator:"equals",value:"eletronicos"}]},true],
    [{conditions:[{field:"category",operator:"equals",value:"Casa"}]},false],
    [{humor:true},true], [{},true],
  ])("avalia condições %j como %s sem usar coincidência do texto", (condition, eligible) => {
    expect(semanticMemoryEligible({...memory,condition},facts)).toBe(eligible);
  });
  it("exclui memória temporária ou inativa", () => {
    expect(semanticMemoryEligible({...memory,scope:"one_off"},facts)).toBe(false);
    expect(semanticMemoryEligible({...memory,active:false},facts)).toBe(false);
  });
  it("uma exceção não arquiva a regra geral oposta", () => {
    const rules: CtaRule[] = [{id:"r",userId:"u",profileId:"p",createdAt:"",active:true,ruleType:"forbidden_word",value:"emoji",scope:"persistent",condition:[]}];
    const result = new PreferenceConflictResolver().resolve(rules,[{action:"add",ruleType:"required_word",value:"emoji",condition:[{field:"category",value:"Brinquedos"}]}],"exception");
    expect(result.archiveIds).toEqual([]);
  });
});
