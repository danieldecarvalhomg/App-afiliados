import type {CtaBlock} from './types';

const block=(key:string,label:string,kind:CtaBlock['kind'],patch:Partial<CtaBlock>={}):CtaBlock=>({
  id:key,key,label,kind,enabled:true,position:0,positionMode:'flexible',frequency:'always',conditions:[],format:'separate_line',whatsappFormat:'normal',groupId:null,
  generationInstruction:null,fixedText:null,copyMode:kind==='creative'?'AI_GENERATED':null,copyLibraryItemId:null,
  objective:kind==='creative'?label:null,...patch,
});

export function availableCtaBlocks():CtaBlock[]{return[
  block('opening','CTA','creative'),
  block('product','Produto','factual',{positionMode:'pinned'}),
  block('price','Preço','factual',{positionMode:'pinned'}),
  block('original_price','Preço anterior','factual',{conditions:[{field:'original_price',operator:'exists'}]}),
  block('discount','Desconto','factual',{conditions:[{field:'discount',operator:'gt',value:0}],frequency:'frequent'}),
  block('coupon','Cupom','factual',{conditions:[{field:'coupon',operator:'exists'}]}),
  block('coupon_link','Link do cupom','factual',{conditions:[{field:'coupon_link',operator:'exists'}]}),
  block('free_shipping','Frete grátis','factual',{conditions:[{field:'free_shipping',operator:'eq',value:true}]}),
  block('marketplace','Marketplace','factual',{frequency:'sometimes'}),
  block('affiliate_link','Link afiliado','factual',{positionMode:'pinned'}),
].map((item,position)=>({...item,position}));}

/** Blueprint de demonstração. Novos templates usam deliberadamente []. */
export function defaultCtaBlocks():CtaBlock[]{return availableCtaBlocks();}
