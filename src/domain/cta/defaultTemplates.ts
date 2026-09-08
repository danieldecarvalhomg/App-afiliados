import {availableCtaBlocks} from './defaultBlueprint';
import type {CtaBlock} from './types';
import { demonstrationTemplateDocument, documentToDsl } from './LegacyTemplateAdapter';
import type { MessageTemplateDocument } from './types';

export interface OfficialTemplateSeed {officialKey:string;name:string;description:string;blocks:CtaBlock[];document:MessageTemplateDocument;dsl:string;}

export function officialTemplateSeeds():OfficialTemplateSeed[]{
  const byKey=new Map(availableCtaBlocks().map(block=>[block.key,block]));
  const keys=['opening','product','original_price','price','coupon','coupon_link','affiliate_link'];
  const blocks=keys.map((key,position)=>({...byKey.get(key)!,position,whatsappFormat:key==='product'||key==='price'?'bold':key==='original_price'?'strikethrough':'normal'} as CtaBlock));
  const document=demonstrationTemplateDocument();
  return[{officialKey:'promofy_demo',name:'Template de Demonstração',description:'Exemplo funcional com CTA inicial, fatos, condicionais, links independentes e formatação WhatsApp.',blocks,document,dsl:documentToDsl(document)}];
}
