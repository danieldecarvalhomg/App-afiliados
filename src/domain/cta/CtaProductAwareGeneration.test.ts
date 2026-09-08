import{describe,expect,it,vi}from'vitest';
import{CtaGenerationService}from'./CtaGenerationService';
import{CtaGenericityValidator}from'./CtaGenericityValidator';
import{availableCtaBlocks}from'./defaultBlueprint';
import type{CtaBlock,CtaFacts,CtaProfile,CtaTemplate}from'./types';

const echo:CtaFacts={productId:'echo',title:'Echo Dot',category:'Eletrônicos',price:249,originalPrice:399,discountPercent:37.59,couponCode:'ECHO20',couponDescription:null,freeShipping:true,marketplace:'shopee',affiliateUrl:'https://affiliate.test/echo',sourceUrl:'https://source.test/echo'};
const profile:CtaProfile={id:'profile',userId:'u',tone:'natural',length:'medium',emojiLevel:'moderate',repetitionMode:'balanced',structuredPreferences:{sensationalism:false},naturalLanguagePreferences:'Poucos emojis; tom de indicação de amigo',version:1,createdAt:'',updatedAt:''};
const block=(key:string,position:number):CtaBlock=>({...availableCtaBlocks().find(item=>item.key===key)!,position,frequency:'always'});

function setup(blocks:CtaBlock[],profileOverride:CtaProfile=profile){
  const template:CtaTemplate={id:'template',userId:'u',name:'Contextual',description:null,active:true,isDefault:true,version:1,blocks,presentation:{defaultCaption:'',watermark:{enabled:false,text:'',position:'bottom-right',opacity:0.72}},officialKey:null,createdAt:'',updatedAt:''};
  const repository={getOrCreateProfile:vi.fn().mockResolvedValue(profileOverride),listRules:vi.fn().mockResolvedValue([]),listRelevantExamples:vi.fn().mockResolvedValue([{id:'example',text:'Tava de olho nesse?',sentiment:'positive',inferredTraits:['natural'],context:{category:'Eletrônicos'},createdAt:''}]),listRecentGenerations:vi.fn().mockResolvedValue([]),getTemplate:vi.fn().mockResolvedValue(template),getDefaultTemplate:vi.fn().mockResolvedValue(template),getProduct:vi.fn(),createGeneration:vi.fn()};
  const provider={generateCta:vi.fn(),repairCta:vi.fn()};
  return{service:new CtaGenerationService(repository as never,provider as never),provider,repository};
}

describe('CTA product-aware creative slots',()=>{
  it('não repete o último teste quando feedback altera a versão do perfil',async()=>{
    const{service,provider,repository}=setup([block('opening',0)]);
    repository.getProduct.mockResolvedValue({...echo,id:'echo',userId:'u'});
    provider.generateCta.mockResolvedValue({output:{slots:[],candidates:[{text:'Você estava de olho no Echo Dot?',angle:'curiosidade'}]},provider:'test',model:'test',processingMs:1});
    provider.repairCta.mockResolvedValue({output:{slots:[],candidates:[{text:'Que tal comparar o Echo Dot com as opções da sua lista?',angle:'comparação'}]},provider:'test',model:'test',processingMs:1});
    const first=await service.testCta('u','echo');
    repository.getOrCreateProfile.mockResolvedValue({...profile,version:2});
    const second=await service.testCta('u','echo',{instruction:'Outra abordagem, sem repetir o ângulo recente'});
    expect(second[0].text).not.toBe(first[0].text);
    expect(provider.repairCta).toHaveBeenCalledOnce();
  });
  it('repara candidato que ignora a pergunta exigida sem descrição confirmada',async()=>{
    const{service,provider,repository}=setup([block('opening',0)]);
    Object.assign(repository,{listRelevantMemory:vi.fn().mockResolvedValue([{kind:'instruction',scope:'conditional',semanticText:'Se não houver descrição suficiente, faça uma pergunta simples.',condition:{},active:true}])});
    provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'O Echo Dot entrou na sua lista.'}]},provider:'test',model:'test',processingMs:1});
    provider.repairCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Você estava de olho no Echo Dot?'}]},provider:'test',model:'test',processingMs:1});
    const result=await service.preview('u','template',echo);
    expect(result.text).toBe('Você estava de olho no Echo Dot?');
    expect(provider.repairCta).toHaveBeenCalledOnce();
  });
  it('elimina palavra proibida antes de exibir o CTA',async()=>{
    const{service,provider,repository}=setup([block('opening',0)]);
    repository.listRules.mockResolvedValue([{id:'r',active:true,scope:'persistent',condition:[],ruleType:'forbidden_word',value:'bacana'}] as never);
    provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Esse Echo Dot parece bacana?'}]},provider:'test',model:'test',processingMs:1});
    provider.repairCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Você estava de olho no Echo Dot?'}]},provider:'test',model:'test',processingMs:1});
    expect((await service.preview('u','template',echo)).text).not.toContain('bacana');
    expect(provider.repairCta).toHaveBeenCalledOnce();
  });
  it('não descarta as últimas regras e memórias de um treinamento detalhado',async()=>{
    const{service,provider,repository}=setup([block('opening',0)]);
    const rules=Array.from({length:20},(_,i)=>({id:`r${i}`,active:true,ruleType:'style',value:`Regra ${i}`,scope:'persistent'}));
    const memories=Array.from({length:25},(_,i)=>({id:`m${i}`,active:true,semanticText:`Preferência ${i}`,scope:'persistent'}));
    repository.listRules.mockResolvedValue(rules as never);
    Object.assign(repository,{listRelevantMemory:vi.fn().mockResolvedValue(memories)});
    provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Tava de olho no Echo Dot?'}]},provider:'test',model:'test',processingMs:1});
    await service.preview('u','template',echo);
    const input=provider.generateCta.mock.calls[0][0];
    expect(input.memory.rules).toHaveLength(20);
    expect(input.memory.semanticItems).toHaveLength(25);
    expect(input.memory.semanticItems.at(-1).id).toBe('m24');
  });
  it('envia Product Creative Context, Template Context, memória e todos os slots em uma chamada coordenada',async()=>{
    const{service,provider}=setup([block('opening',0),block('product',1),block('price',2),block('cta',3)]);
    provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Tava de olho no Echo Dot?'},{blockId:'cta',text:'Vale conferir 👇'}]},provider:'test',model:'contextual',processingMs:1});
    const preview=await service.preview('u','template',echo);const input=provider.generateCta.mock.calls[0][0];
    expect(provider.generateCta).toHaveBeenCalledOnce();expect(input.creativeContext).toMatchObject({title:'Echo Dot',category:'Eletrônicos',price:249,coupon:'ECHO20',hasAffiliateUrl:true,validatedAttributes:[],validatedDescription:null});
    expect(input.templateContext.orderedBlocks.map((item:{key:string})=>item.key)).toEqual(['cta_ia','produto','preco']);
    expect(input.templateContext.visibleFactualBlocks).toMatchObject({produto:true,preco:true});expect(input.templateContext.aiSlotIds).toHaveLength(1);
    expect(input.profile.naturalLanguagePreferences).toContain('indicação de amigo');expect(input.memory.examples).toHaveLength(1);
    expect(preview.text).toBe('Tava de olho no Echo Dot?\n\nEcho Dot\n\nR$ 249,00');
  });

  it('produtos diferentes chegam ao mesmo Template com contextos diferentes',async()=>{
    const{service,provider}=setup([block('opening',0),block('product',1),block('cta',2)]);
    provider.generateCta.mockImplementation(async(input:{creativeContext:{title:string}})=>({output:{slots:[{blockId:'opening',text:`Tava de olho em ${input.creativeContext.title}?`},{blockId:'cta',text:'Vale conferir'}]},provider:'test',model:'contextual',processingMs:1}));
    const air={...echo,productId:'air',title:'Air Fryer Mondial',category:'Eletrodomésticos'};
    const first=await service.preview('u','template',echo);const second=await service.preview('u','template',air);
    expect(first.text).toContain('Echo Dot');expect(second.text).toContain('Air Fryer Mondial');expect(first.text).not.toBe(second.text);
  });

  it('estilos diferentes permanecem disponíveis para mudar a linguagem',async()=>{
    const naturalSetup=setup([block('opening',0)],profile);const shortProfile={...profile,tone:'direto',emojiLevel:'none' as const,naturalLanguagePreferences:'Curto e direto'};const directSetup=setup([block('opening',0)],shortProfile);
    const contextual=async(input:{profile:CtaProfile;creativeContext:{title:string}})=>({output:{slots:[{blockId:'opening',text:input.profile.tone==='direto'?`${input.creativeContext.title}: vale conferir.`:`Tava de olho no ${input.creativeContext.title}? 👀`}]},provider:'test',model:'style',processingMs:1});
    naturalSetup.provider.generateCta.mockImplementation(contextual);directSetup.provider.generateCta.mockImplementation(contextual);
    expect((await naturalSetup.service.preview('u','template',echo)).text).not.toBe((await directSetup.service.preview('u','template',echo)).text);
  });

  it('copy totalmente genérica recebe um único repair contextual',async()=>{
    const{service,provider}=setup([block('opening',0),block('cta',1)]);
    provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Super oferta!'},{blockId:'cta',text:'Garanta já o seu!'}]},provider:'test',model:'generic',processingMs:1});
    provider.repairCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Tava de olho no Echo Dot?'},{blockId:'cta',text:'Vale conferir 👇'}]},provider:'test',model:'repaired',processingMs:1});
    const preview=await service.preview('u','template',echo);expect(provider.repairCta).toHaveBeenCalledOnce();expect(provider.repairCta.mock.calls[0][0].errors).toContain('AI_COPY_TOO_GENERIC');expect(preview.text).toContain('Echo Dot');expect(preview.status).toBe('valid');
  });

  it('copy contextual com CTA simples é aceita sem repair',async()=>{
    const{service,provider}=setup([block('opening',0),block('cta',1)]);provider.generateCta.mockResolvedValue({output:{slots:[{blockId:'opening',text:'Tava de olho no Echo Dot?'},{blockId:'cta',text:'Vale conferir 👇'}]},provider:'test',model:'contextual',processingMs:1});
    expect((await service.preview('u','template',echo)).status).toBe('valid');expect(provider.repairCta).not.toHaveBeenCalled();
  });

  it('seleciona três ângulos distintos em uma única chamada coordenada',async()=>{
    const{service,provider,repository}=setup([block('opening',0),block('product',1),block('cta',2)]);
    repository.getProduct=vi.fn().mockResolvedValue({id:'echo',userId:'u',sourceType:'manual',sourceReferenceId:null,title:'Echo Dot',category:'Eletrônicos',imageUrl:null,price:249,originalPrice:399,discountPercent:37.59,currency:'BRL',couponCode:'ECHO20',couponDescription:null,freeShipping:true,marketplace:'shopee',sourceUrl:'https://source.test/echo',affiliateUrl:'https://affiliate.test/echo',affiliateStatus:'converted',affiliateConversionId:null,observations:null,createdAt:'',updatedAt:''});
    repository.createGeneration.mockImplementation(async(_userId:string,input:any)=>({id:`g-${input.variantIndex}`,userId:'u',createdAt:'',...input}));
    provider.generateCta.mockResolvedValue({output:{slots:[],candidates:[
      {text:'Tava de olho no Echo Dot?',angle:'curiosidade'},
      {text:'Echo Dot apareceu como uma escolha prática para a rotina.',angle:'uso'},
      {text:'Se o Echo Dot estava na sua lista, vale dar uma olhada.',angle:'descoberta'},
      {text:'Uma boa hora para conhecer melhor o Echo Dot.',angle:'oportunidade'},
    ]},provider:'test',model:'contextual',processingMs:1});
    const results=await service.generate('u','echo',{count:3,templateId:'template'});
    expect(results).toHaveLength(3);expect(provider.generateCta).toHaveBeenCalledOnce();expect(provider.repairCta).not.toHaveBeenCalled();expect(new Set(results.map(item=>item.ctaText)).size).toBe(3);expect(new Set(results.map(item=>(item.structureSnapshot as any).angle)).size).toBe(3);
  });

  it('reaproveita candidatos excedentes sem uma nova chamada ao Gemini',async()=>{
    const{service,provider,repository}=setup([block('opening',0),block('product',1)]);const bank:any[]=[];
    (repository as any).claimCtaCandidates=vi.fn(async(_user:string,_key:string,limit:number)=>({items:bank.splice(0,limit),remaining:bank.length}));
    (repository as any).saveCtaCandidates=vi.fn(async(_user:string,_key:string,items:any[])=>{items.forEach((item,index)=>bank.push({id:`pool-${index}`, ...item}));return items.length;});
    provider.generateCta.mockResolvedValue({output:{slots:[],candidates:[
      {text:'Tava de olho no Echo Dot?',angle:'curiosidade'},{text:'Echo Dot pode facilitar a rotina.',angle:'rotina'},{text:'Se estava na lista, vale olhar o Echo Dot.',angle:'lista'}
    ]},provider:'gemini',model:'flash-lite',processingMs:1});
    const first=await service.preview('u','template',echo);await Promise.resolve();const second=await service.preview('u','template',echo);
    expect(first.text).not.toBe(second.text);expect(provider.generateCta).toHaveBeenCalledOnce();expect((repository as any).saveCtaCandidates).toHaveBeenCalled();
  });

  it('produto com poucos dados não força especificidade inventada',()=>{const sparse={...echo,title:'Produto XYZ',category:null,price:null,originalPrice:null,discountPercent:null,couponCode:null,freeShipping:null,marketplace:''};expect(new CtaGenericityValidator().validate([{blockId:'opening',text:'Olha esta oportunidade!'}],{productId:sparse.productId,title:sparse.title,category:null,marketplace:null,price:null,originalPrice:null,discountPercent:null,coupon:null,couponDescription:null,freeShipping:null,validatedAttributes:[],validatedDescription:null,hasAffiliateUrl:false})).toEqual([]);});
});
