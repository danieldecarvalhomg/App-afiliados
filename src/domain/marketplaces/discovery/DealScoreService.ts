import type { MarketplaceDeal } from './types';

export interface DealScoreResult { score: number; version: 'v1'; reasons: string[]; }
export class DealScoreService {
  score(deal: MarketplaceDeal, now = Date.now()): DealScoreResult {
    let points = 0, available = 0; const reasons: string[] = []; const add=(value:number,max:number,reason?:string)=>{points+=value;available+=max;if(reason)reasons.push(reason);};
    if (deal.discountPercent != null) { const value=Math.round(Math.max(0,Math.min(100,deal.discountPercent))*.3); add(value,30,value>=15?'bom desconto':undefined); }
    if (deal.commissionRate != null) { const value=Math.round(Math.min(25,Math.max(0,deal.commissionRate)*2.5)); add(value,25,value>=10?'comissão elevada':undefined); }
    if (deal.salesCount != null) { const value=Math.min(15,Math.round(Math.log10(Math.max(0,deal.salesCount)+1)*4)); add(value,15,value>=8?'alto volume de vendas':undefined); }
    if (deal.rating != null) { const value=Math.round(Math.max(0,Math.min(5,deal.rating))*2); add(value,10,value>=8?'boa avaliação':undefined); }
    if (deal.coupon != null) add(deal.coupon?7:0,7,deal.coupon?'cupom disponível':undefined);
    if (deal.freeShipping != null) add(deal.freeShipping?5:0,5,deal.freeShipping?'frete grátis':undefined);
    const ageHours=Math.max(0,(now-new Date(deal.discoveredAt).getTime())/3_600_000);const freshness=Math.max(0,Math.round(8-ageHours/6));add(freshness,8,freshness>=6?'oferta recente':undefined);
    return { score: available ? Math.max(0,Math.min(100,Math.round(points/available*100))) : 0, version:'v1', reasons };
  }
}
