import{beforeEach,describe,expect,it,vi}from'vitest';

const mocks=vi.hoisted(()=>({generateContent:vi.fn()}));
vi.mock('@google/genai',()=>({GoogleGenAI:class{models={generateContent:mocks.generateContent};},ThinkingLevel:{MINIMAL:'minimal'}}));

import{GeminiCtaProvider}from'./GeminiCtaProvider';
import type{CtaCreativeGenerationInput}from'../../domain/cta/CtaAIProvider';
import type{CtaBlock,CtaProfile}from'../../domain/cta/types';

const creative=(id:string,key:string,position:number):CtaBlock=>({id,key,label:key,kind:'creative',enabled:true,position,positionMode:'flexible',frequency:'always',conditions:[],format:'separate_line',whatsappFormat:'normal',groupId:null,generationInstruction:null,fixedText:null,copyMode:'AI_GENERATED',copyLibraryItemId:null,objective:key});
const factual=(id:string,key:string,position:number):CtaBlock=>({...creative(id,key,position),kind:'factual',copyMode:null,objective:null});
const profile:CtaProfile={id:'profile',userId:'u',tone:'natural',length:'short',emojiLevel:'moderate',repetitionMode:'balanced',structuredPreferences:{sensationalism:false},naturalLanguagePreferences:'Parecer indicação de amigo, com poucos emojis',version:1,createdAt:'',updatedAt:''};
const blocks=[creative('opening-id','opening',0),factual('product-id','product',1),factual('price-id','price',2),creative('cta-id','cta',3)];
const input:CtaCreativeGenerationInput={
  facts:{productId:'echo',title:'Echo Dot',category:'Eletrônicos',price:249,originalPrice:399,discountPercent:37.59,couponCode:'ECHO20',couponDescription:null,freeShipping:true,marketplace:'shopee',affiliateUrl:'https://affiliate.test/echo',sourceUrl:'https://source.secret/echo'},
  creativeContext:{productId:'echo',title:'Echo Dot',category:'Eletrônicos',marketplace:'shopee',price:249,originalPrice:399,discountPercent:37.59,coupon:'ECHO20',couponDescription:null,freeShipping:true,validatedAttributes:[],validatedDescription:null,hasAffiliateUrl:true},
  templateContext:{orderedBlocks:blocks.map((block,position)=>({blockId:block.id,key:block.key,label:block.label,position,kind:block.kind,copyMode:block.copyMode??null,objective:block.objective??null,instruction:null})),visibleFactualBlocks:{product:true,price:true},aiSlotIds:['opening-id','cta-id']},
  profile,blueprint:{id:'template',userId:'u',profileId:'profile',version:1,isDefault:true,blocks,createdAt:'',updatedAt:''},memory:{rules:[],examples:[{id:'ex',text:'Tava de olho nesse?',sentiment:'positive',inferredTraits:['natural'],context:{category:'Eletrônicos'},createdAt:''}],recentSignatures:[],recentVariantSlots:[],preferences:'Natural'},instruction:null,variantIndex:0,
};

describe('GeminiCtaProvider product-aware prompt',()=>{
  it('lê todas as seções antes de interpretar um comando muito longo',async()=>{
    const message='a'.repeat(12000)+'REGRA DO MEIO'+'b'.repeat(12000)+'REGRA DO FIM';
    mocks.generateContent.mockImplementation(async(args)=>({text:JSON.stringify(String(args.contents).includes('Você interpreta uma PARTE')?{summary:[],items:[]}:{scope:'one_off',profilePatch:{},ruleChanges:[],structureOperations:[],requiresConfirmation:false,reply:'Li tudo',changeSummary:[]})}));
    await new GeminiCtaProvider('test').interpretCtaInstruction({message,profile,blueprint:input.blueprint,rules:[],recentGenerations:[]});
    expect(mocks.generateContent).toHaveBeenCalledTimes(4);
    const calls=mocks.generateContent.mock.calls;
    expect(calls[1][0].contents).toContain('REGRA DO MEIO');
    expect(calls[2][0].contents).toContain('REGRA DO FIM');
    expect(calls[3][0].contents).toContain('CONFERÊNCIA DAS SEÇÕES');
    expect(calls[3][0].contents).toContain(message);
  });
  it.each(['null', '[]', '"text"', '{bad json'])('recusa resposta JSON inválida %s', async (text) => {
    mocks.generateContent.mockResolvedValue({ text });
    await expect(new GeminiCtaProvider('test').generateCta(input)).rejects.toThrow('CTA_AI_RESPONSE_INVALID');
  });
  it.each([[429, 'CTA_AI_RATE_LIMITED'], [404, 'CTA_AI_MODEL_UNAVAILABLE'], [503, 'CTA_AI_OVERLOADED']])('mapeia HTTP %s do provedor', async (status, code) => {
    mocks.generateContent.mockRejectedValue({ status });
    await expect(new GeminiCtaProvider('test').generateCta(input)).rejects.toThrow(code as string);
  });
  it('identifica TimeoutError nativo', async () => {
    mocks.generateContent.mockRejectedValue(new DOMException('operation aborted', 'TimeoutError'));
    await expect(new GeminiCtaProvider('test').generateCta(input)).rejects.toThrow('CTA_AI_TIMEOUT');
  });
  it('recupera indisponibilidade transitória com tentativas limitadas', async () => {
    mocks.generateContent.mockRejectedValueOnce({status:503}).mockRejectedValueOnce({status:502});
    await expect(new GeminiCtaProvider('test').generateCta(input)).resolves.toHaveProperty('output.slots');
    expect(mocks.generateContent).toHaveBeenCalledTimes(3);
    const calls=mocks.generateContent.mock.calls;
    expect(calls[2][0].config.httpOptions.timeout).toBeLessThan(calls[0][0].config.httpOptions.timeout);
  });
  it('remove falhas do cache para permitir nova tentativa', async () => {
    const provider = new GeminiCtaProvider('test');
    mocks.generateContent.mockRejectedValueOnce({ status: 429 });
    await expect(provider.generateCta(input)).rejects.toThrow('CTA_AI_RATE_LIMITED');
    await provider.generateCta(input);
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
  });
  beforeEach(()=>{mocks.generateContent.mockReset().mockResolvedValue({text:JSON.stringify({slots:[{blockId:'opening-id',text:'Tava de olho no Echo Dot?'},{blockId:'cta-id',text:'Vale conferir 👇'}]})});});
  it('envia produto, template, estilo e memória em uma única chamada sem source_url',async()=>{await new GeminiCtaProvider('test').generateCta(input);expect(mocks.generateContent).toHaveBeenCalledOnce();const prompt=mocks.generateContent.mock.calls[0][0].contents as string;expect(prompt).toContain('Echo Dot');expect(prompt).toContain('opening-id');expect(prompt).toContain('cta-id');expect(prompt).toContain('visibleFactualBlocks');expect(prompt).toContain('indicação de amigo');expect(prompt).toContain('Tava de olho nesse?');expect(prompt).not.toContain('https://source.secret/echo');});
  it('repair de genericidade mantém IDs e recebe contexto criativo',async()=>{await new GeminiCtaProvider('test').repairCta({...input,invalidText:'Super oferta!\n\nGaranta já!',invalidSlots:[{blockId:'opening-id',text:'Super oferta!'},{blockId:'cta-id',text:'Garanta já!'}],errors:['AI_COPY_TOO_GENERIC']});const prompt=mocks.generateContent.mock.calls[0][0].contents as string;expect(prompt).toContain('Torne o conjunto mais específico');expect(prompt).toContain('Echo Dot');expect(prompt).toContain('opening-id');expect(prompt).toContain('cta-id');});
});
