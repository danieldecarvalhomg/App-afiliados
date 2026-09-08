import{describe,expect,it}from'vitest';
import{CtaValidator}from'./CtaValidator';
import type{CtaFacts,CtaRule}from'./types';

const base:CtaFacts={productId:'p',title:'Echo Dot',category:null,price:249,originalPrice:399,discountPercent:37.59,couponCode:'ECHO20',couponDescription:null,freeShipping:true,marketplace:'shopee',affiliateUrl:'https://s.shopee.com.br/abc',sourceUrl:'https://shopee.com.br/produto'};
const validator=new CtaValidator();

describe('CtaValidator factual hard policy',()=>{
  it('aplica uma proibição somente na categoria autorizada',()=>{
    const rule:CtaRule={id:'r',userId:'u',profileId:'p',ruleType:'forbidden_word',value:'rotina',scope:'conditional',condition:[{field:'category',operator:'equals',value:'Casa'}],active:true,createdAt:''};
    expect(validator.validate('Uma ideia para a rotina',{...base,category:'Eletrônicos'},[rule]).errors).not.toContain('PROHIBITED_PHRASE');
    expect(validator.validate('Uma ideia para a rotina',{...base,category:'Casa'},[rule]).errors).toContain('PROHIBITED_PHRASE');
  });
  it('aceita somente fatos e affiliate URL corretos',()=>expect(validator.validate('Echo Dot\nDe R$ 399 por R$ 249\nCupom ECHO20\nFrete grátis\nhttps://s.shopee.com.br/abc',base)).toMatchObject({valid:true,publishable:true}));
  it('rejeita preço inventado',()=>expect(validator.validate('Por R$ 199',base).errors).toContain('FACT_PRICE_MISMATCH'));
  it('rejeita cupom inventado',()=>expect(validator.validate('Cupom PROMO20',base).errors).toContain('FACT_COUPON_MISMATCH'));
  it('rejeita cupom quando ausente',()=>expect(validator.validate('Cupom PROMO20',{...base,couponCode:null}).errors).toContain('FACT_COUPON_INVENTED'));
  it('aceita ramos else que informam a ausência de cupom e de link',()=>{
    const facts={...base,couponCode:null,couponLink:null};
    const text=`Sem cupom\nCupom sem link\nMarketplace: shopee\n${facts.affiliateUrl}`;
    expect(validator.validate(text,facts)).toMatchObject({valid:true,publishable:true,errors:[]});
  });
  it('não deixa a procura por código atravessar a quebra de linha',()=>{
    const facts={...base,couponCode:null};
    expect(validator.validate(`Sem cupom\nMarketplace: shopee\n${facts.affiliateUrl}`,facts)).toMatchObject({valid:true,publishable:true,errors:[]});
  });
  it('continua rejeitando código explícito depois de uma negação',()=>expect(validator.validate('Sem cupom\nCupom PROMO20',{...base,couponCode:null}).errors).toContain('FACT_COUPON_INVENTED'));
  it('aceita link de resgate sem código de cupom',()=>expect(validator.validate('👉 Pegue o cupom:\nhttps://coupon.test/echo\nhttps://s.shopee.com.br/abc',{...base,couponCode:null,couponLink:'https://coupon.test/echo'})).toMatchObject({valid:true,publishable:true,errors:[]}));
  it('aceita cupom descritivo literal sem exigir código',()=>expect(validator.validate('Cupom: R$30 OFF\nhttps://s.shopee.com.br/abc',{...base,couponCode:null,couponDescription:'R$30 OFF'})).toMatchObject({valid:true,publishable:true,errors:[]}));
  it('rejeita frete inventado',()=>expect(validator.validate('Frete grátis',{...base,freeShipping:null}).errors).toContain('FACT_FREE_SHIPPING_INVENTED'));
  it('rejeita desconto incorreto',()=>expect(validator.validate('50% OFF',base).errors).toContain('FACT_DISCOUNT_MISMATCH'));
  it('não confunde porcentagem de um cupom conhecido com o desconto do produto',()=>{
    const facts={...base,discountPercent:58.74,couponCode:'25% OFF FULL'};
    const text=`Cupom: 25% OFF FULL\nAproveite o cupom 25% OFF FULL!\n${facts.affiliateUrl}`;
    expect(validator.validate(text,facts)).toMatchObject({valid:true,publishable:true,errors:[]});
  });
  it('não confunde porcentagem no nome do produto com desconto',()=>expect(validator.validate('Percarbonato 100% Puro\nR$ 16,90',{...base,title:'Percarbonato 100% Puro',price:16.9,originalPrice:49.9,discountPercent:66.13}).errors).not.toContain('FACT_DISCOUNT_MISMATCH'));
  it.each(['Últimas unidades','Menor preço histórico','Menor preço','Só hoje','Antes que acabe','Última chance','Entrega amanhã','Possui som potente'])('rejeita claim não suportada %s',(claim)=>expect(validator.validate(claim,base).errors).toContain('UNSUPPORTED_FACTUAL_CLAIM'));
  it('rejeita link diferente e source_url',()=>{expect(validator.validate('https://example.com',base).errors).toContain('AFFILIATE_URL_MISMATCH');expect(validator.validate(base.sourceUrl!,base).errors).toContain('SOURCE_URL_FORBIDDEN');});
  it('preview sem affiliate URL pode ser válido mas nunca publicável',()=>expect(validator.validate('Echo Dot por R$ 249',{...base,affiliateUrl:null}).publishable).toBe(false));
  it('aplica frase proibida explícita',()=>{const rule:CtaRule={id:'r',userId:'u',profileId:'p',ruleType:'forbidden_phrase',value:'oferta imperdível',scope:'persistent',condition:[],active:true,createdAt:''};expect(validator.validate('Oferta imperdível',base,[rule]).errors).toContain('PROHIBITED_PHRASE');});
});
