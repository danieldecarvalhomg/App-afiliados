import { describe, expect, it } from 'vitest';
import { PLAN_CATALOG, isSelfServicePlanCode, planHasFeature } from './plans';

describe('catálogo de planos',()=>{
  it('mantém a ordem e os preços comerciais definidos',()=>{
    expect(PLAN_CATALOG.map((plan)=>[plan.code,plan.priceMonthly])).toEqual([
      ['free',0],['essential',69],['advanced',129],['pro',219],['scale',329],['personal',null],
    ]);
  });
  it('limita Mercado Livre e IA sem bloquear Amazon e Shopee no Grátis',()=>{
    const free=PLAN_CATALOG[0];
    expect(free.limits.mercadoLivreConversions).toBe(0);
    expect(free.limits.aiGenerations).toBe(0);
    expect(planHasFeature('free','mercado_livre')).toBe(false);
    expect(planHasFeature('free','amazon')).toBe(true);
    expect(planHasFeature('free','shopee')).toBe(true);
  });
  it('espelha as franquias principais até o Escala',()=>{
    expect(PLAN_CATALOG.find((plan)=>plan.code==='advanced')?.limits).toMatchObject({mercadoLivreConversions:1000,aiGenerations:300,monitoredGroups:10});
    expect(PLAN_CATALOG.find((plan)=>plan.code==='scale')?.limits).toMatchObject({mercadoLivreConversions:5000,aiGenerations:2000,monitoredGroups:50});
  });
  it('permite troca automática apenas nos planos padronizados',()=>{
    expect(['free','essential','advanced','pro','scale'].every(isSelfServicePlanCode)).toBe(true);
    expect(isSelfServicePlanCode('personal')).toBe(false);
    expect(isSelfServicePlanCode('invalid')).toBe(false);
  });
});
