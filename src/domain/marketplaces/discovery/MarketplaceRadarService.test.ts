import { describe, expect, it, vi } from 'vitest';
import { MarketplaceDiscoveryScheduler, MarketplaceRadarService, nextRadarRunAt } from './MarketplaceRadarService';
import type { MarketplaceRadarRepository } from './MarketplaceRadarRepository';

type Status='not_configured'|'pending_validation'|'valid'|'invalid'|'error';
const base={id:'deal-1',userId:'user-a',marketplace:'shopee' as const,externalProductId:'p1',title:'Oferta',imageUrl:'https://cdn.shopee.com.br/main.jpg',imageUrls:['https://cdn.shopee.com.br/alt.jpg'],productUrl:'https://shopee.com.br/p1',commissionRate:12,discoveredAt:new Date().toISOString()};
function setup(status:Status='valid'){
  let prepared=false;
  const repo={getAccount:vi.fn(async()=>status==='valid'?{id:'account-a',credentials:{appId:'a',secret:'s'}}:null),getValidationStatus:vi.fn(async()=>status),acquireRefresh:vi.fn(async()=>({acquired:true,errorCode:null})),finishRefresh:vi.fn(async()=>{}),listDueAccounts:vi.fn(async()=>status==='valid'?[{userId:'user-a',marketplace:'shopee'}]:[]),upsertDeals:vi.fn(async()=>({inserted:1,updated:0,unchanged:0})),markMissingDeals:vi.fn(async()=>0),listDeals:vi.fn(async()=>({items:[base],nextCursor:null})),getDeal:vi.fn(async(_user:string,id:string)=>id==='deal-b'?null:base),prepareProduct:vi.fn(async()=>{const created=!prepared;prepared=true;return{product:{id:'product',sourceType:'marketplace_radar'},created};}),createConversion:vi.fn(async()=>{}),recordEvent:vi.fn(async()=>{})} as unknown as MarketplaceRadarRepository;
  const provider={marketplace:'shopee' as const,getDeals:vi.fn(async()=>({deals:[base],page:1,hasNextPage:false})),searchDeals:vi.fn(),getDeal:vi.fn()};const conversions={kick:vi.fn()} as any;const media={addMarketplaceImages:vi.fn(async()=>{})} as any;
  return{repo,provider,conversions,media,service:new MarketplaceRadarService(repo,[provider],conversions,media)};
}

describe('MarketplaceRadarService individual',()=>{
  it.each<Status>(['not_configured','pending_validation','invalid','error'])('%s bloqueia listagem e não consulta deals',async(status)=>{const x=setup(status);await expect(x.service.list('user-a',{})).resolves.toMatchObject({success:true,data:{affiliateStatus:status,items:[]}});expect(x.repo.listDeals).not.toHaveBeenCalled();});
  it('valid libera deals, comissão e filtro de comissão',async()=>{const x=setup();await expect(x.service.list('user-a',{minCommission:10,sort:'commission'})).resolves.toMatchObject({success:true,data:{affiliateStatus:'valid',items:[{commissionRate:12}]}});expect(x.repo.listDeals).toHaveBeenCalledWith('user-a',{marketplace:'shopee',minCommission:10,sort:'commission'});});
  it('sem conta bloqueia refresh e não chama provider',async()=>{const x=setup('not_configured');await expect(x.service.refresh('user-a')).resolves.toMatchObject({success:false,error:{code:'RADAR_PROVIDER_NOT_CONFIGURED'}});expect(x.provider.getDeals).not.toHaveBeenCalled();});
  it('valid permite refresh e retorna contagens separadas',async()=>{const x=setup();await expect(x.service.refresh('user-a')).resolves.toMatchObject({success:true,data:{received:1,inserted:1,updated:0,unchanged:0}});expect(x.repo.upsertDeals).toHaveBeenCalledWith('user-a','account-a',[base]);});
  it('usuário não prepara deal que não pertence a ele',async()=>{const x=setup();await expect(x.service.prepare('user-a','deal-b')).resolves.toMatchObject({success:false,error:{code:'RADAR_DEAL_NOT_FOUND'}});expect(x.repo.prepareProduct).not.toHaveBeenCalled();});
  it('prepare é idempotente e cria uma única conversão',async()=>{const x=setup();await expect(x.service.prepare('user-a','deal-1')).resolves.toMatchObject({success:true,data:{created:true}});await expect(x.service.prepare('user-a','deal-1')).resolves.toMatchObject({success:true,data:{created:false}});expect(x.repo.createConversion).toHaveBeenCalledTimes(1);expect(x.conversions.kick).toHaveBeenCalledTimes(1);});
  it('prepare vincula todas as imagens reais do deal ao Product Media',async()=>{const x=setup();await x.service.prepare('user-a','deal-1');expect(x.media.addMarketplaceImages).toHaveBeenCalledWith('user-a','product','deal-1',[base.imageUrl,...base.imageUrls]);});
});

describe('MarketplaceDiscoveryScheduler diário',()=>{
  it('calcula o próximo meio-dia no horário de São Paulo',()=>{
    expect(nextRadarRunAt(new Date('2026-08-31T14:00:00.000Z')).toISOString()).toBe('2026-08-31T15:00:00.000Z');
    expect(nextRadarRunAt(new Date('2026-08-31T15:00:01.000Z')).toISOString()).toBe('2026-09-01T15:00:00.000Z');
  });

  it('não coleta no boot e executa somente quando chega o meio-dia',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T14:00:00.000Z'));
    const service={refresh:vi.fn(async()=>({success:true,data:{}}))} as any;
    const repository={listDueAccounts:vi.fn(async()=>[{userId:'user-a',marketplace:'shopee'}])} as any;
    const scheduler=new MarketplaceDiscoveryScheduler(service,repository);
    scheduler.start();
    expect(service.refresh).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60*60*1000);
    expect(service.refresh).toHaveBeenCalledTimes(1);
    expect(service.refresh).toHaveBeenCalledWith('user-a','shopee','scheduler');
    scheduler.stop();
    vi.useRealTimers();
  });
});
