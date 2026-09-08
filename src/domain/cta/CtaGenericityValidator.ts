import type{CtaGeneratedSlot,CtaProductCreativeContext}from'./types';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const genericTitle=/^(?:produto|item)(?:\s+[a-z0-9_-]+)?$/iu;
const contextualLanguage=/\b(?:tava|estava|ficou|chegou|olho|lista|nesse|nessa|nele|nela|condi[cç][aã]o|pre[cç]o|cupom|frete|desconto)\b/iu;
const genericOnly=/^(?:olha(?:\s+s[oó])?\s+)?(?:(?:essa|esta|uma)\s+)?(?:super\s+)?(?:oferta|oportunidade)(?:\s+(?:incr[ií]vel|imperd[ií]vel))?(?:\s+que\s+separei\s+para\s+voc[eê])?[!. 👀🔥]*$|^(?:(?:vale|d[aá]\s+uma\s+olhada\s+e)\s+)?(?:aproveitar|conferir|confira|aproveite|garanta)(?:\s+j[aá])?(?:\s+agora)?(?:\s+o\s+seu)?(?:\s+por\s+aqui)?[!. 👇🔥]*$|^(?:uma\s+)?boa\s+escolha[!. 👇🔥]*$|^n[aã]o\s+perca[!. 👇🔥]*$/iu;

function specificValues(context:CtaProductCreativeContext):string[]{return[context.title,context.category,context.marketplace,context.coupon].filter((value):value is string=>Boolean(value&&value.trim().length>2)).filter(value=>value!==context.title||!genericTitle.test(value.trim()));}

export class CtaGenericityValidator{
  validate(slots:CtaGeneratedSlot[],context:CtaProductCreativeContext):string[]{
    if(!slots.length)return[];
    const values=specificValues(context);const enoughContext=values.length>0||context.price!=null||context.discountPercent!=null||context.freeShipping===true;
    if(!enoughContext)return[];
    const texts=slots.map(slot=>slot.text.trim()).filter(Boolean);if(!texts.length)return['AI_COPY_TOO_GENERIC'];
    const combined=normalize(texts.join(' '));
    const grounded=values.some(value=>combined.includes(normalize(value)))||contextualLanguage.test(combined);
    const entirelyGeneric=texts.every(text=>genericOnly.test(text.trim()));
    return!grounded&&entirelyGeneric?['AI_COPY_TOO_GENERIC']:[];
  }
}
