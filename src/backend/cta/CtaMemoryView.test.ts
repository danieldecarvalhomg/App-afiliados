import {describe,expect,it} from 'vitest';
import {groupCtaMemoryItems} from './SupabaseCtaRepository';

describe('CTA memory view',()=>{
  it('mostra referência somente em exemplos e referências',()=>{
    const reference={id:'r',userId:'u',profileId:'p',sourceId:null,kind:'reference',scope:'persistent',semanticText:'Cenário de cozinha',condition:{},polarity:'neutral',priority:80,active:true,supersedesItemId:null,metadata:{},createdAt:'',updatedAt:''} as const;
    const view=groupCtaMemoryItems([reference],1);
    expect(view.general).toEqual([]);
    expect(view.examples).toEqual([reference]);
  });
});
