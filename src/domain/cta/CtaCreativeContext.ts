import type{CtaFacts,CtaProductCreativeContext,CtaTemplateCreativeContext,EffectiveCtaBlueprint}from'./types';

export function buildProductCreativeContext(facts:CtaFacts):CtaProductCreativeContext{return{
  productId:facts.productId,title:facts.title,category:facts.category,marketplace:facts.marketplace||null,
  price:facts.price,originalPrice:facts.originalPrice,discountPercent:facts.discountPercent,
  coupon:facts.couponCode??facts.couponDescription,couponDescription:facts.couponDescription,freeShipping:facts.freeShipping,
  validatedAttributes:[],validatedDescription:null,hasAffiliateUrl:Boolean(facts.affiliateUrl),hasCouponLink:Boolean(facts.couponLink),
};}

export function buildTemplateCreativeContext(blueprint:EffectiveCtaBlueprint):CtaTemplateCreativeContext{
  const orderedBlocks=blueprint.blocks.slice().sort((a,b)=>(a.position??0)-(b.position??0)).map((block,index)=>({
    blockId:block.id,key:block.key,label:block.label,position:index,kind:block.kind,copyMode:block.copyMode??null,
    objective:block.objective??null,instruction:block.generationInstruction??null,
  }));
  return{orderedBlocks,visibleFactualBlocks:Object.fromEntries(orderedBlocks.filter(block=>block.kind==='factual').map(block=>[block.key,true])),aiSlotIds:orderedBlocks.filter(block=>block.copyMode==='AI_GENERATED').map(block=>block.blockId)};
}
