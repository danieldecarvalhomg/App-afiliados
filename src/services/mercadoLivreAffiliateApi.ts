import { supabase } from '../lib/supabase';
import { readJsonResponse } from './apiResponse';
import type { BrowserCompanionInstanceStatus, MercadoLivreAffiliateHealthStatus, MercadoLivreBrowserSessionStatus } from '../domain/affiliate/types';

interface Payload<T>{success:boolean;data?:T;error?:{code:string;message:string}}
export interface BrowserCompanionInstanceSummary {
  id:string;name:string;status:BrowserCompanionInstanceStatus;extensionVersion:string;adapterVersion:number;
  mercadoLivreStatus:MercadoLivreBrowserSessionStatus;lastSeenAt:string|null;lastSuccessAt:string|null;
  lastErrorCode:string|null;tokenExpiresAt:string;createdAt:string;revokedAt:string|null;
}
export interface BrowserCompanionJobSummary {
  id:string;status:'PENDING'|'CLAIMED'|'PROCESSING'|'SUCCESS'|'FAILED'|'EXPIRED'|'NEEDS_USER_ACTION'|'CANCELLED';
  sourceUrl:string;trackingLabel:string|null;resultUrl:string|null;errorCode:string|null;
  expiresAt:string;createdAt:string;updatedAt:string;
}
export interface MercadoLivreAffiliateStatus {
  companion:BrowserCompanionInstanceSummary|null;
  instances:BrowserCompanionInstanceSummary[];
  mercadoLivre:{status:MercadoLivreBrowserSessionStatus;lastSuccessAt:string|null;lastErrorCode:string|null};
  remote:{
    configured:boolean;
    provider:'browserbase'|'hyperbrowser'|null;
    preferredProvider:'browserbase'|'hyperbrowser'|null;
    availableProviders:Array<'browserbase'|'hyperbrowser'>;
    status:'NOT_CONFIGURED'|'NEEDS_LOGIN'|'CONNECTING'|'READY'|'ERROR'|'REVOKED';
    lastCheckedAt:string|null;lastSuccessAt:string|null;lastErrorCode:string|null;loginInProgress:boolean;
  };
  global:{status:MercadoLivreAffiliateHealthStatus;circuitState:'CLOSED'|'OPEN'|'HALF_OPEN';lastCheckAt:string|null;lastSuccessAt:string|null;lastErrorCode:string|null;adapterVersion:number};
  metrics:{generationCount:number;successCount:number;failureCount:number;successRate:number;averageLatency:number;p95Latency:number;portalChangedCount:number;userActionCount:number;offlineCount:number;expiredJobs:number;failuresByCategory:Record<string,number>};
  required:{extensionVersion:string;adapterVersion:number};
}
async function request<T>(path:string,init:RequestInit={}){const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw new Error('Faça login para configurar o Mercado Livre.');const response=await fetch(`/api/browser-companion/user${path}`,{cache:'no-store',...init,headers:{'content-type':'application/json',authorization:`Bearer ${data.session.access_token}`,...init.headers}});const payload=await readJsonResponse<Payload<T>>(response);if(!response.ok||!payload.success)throw new Error(payload.error?.message??'Falha na integração Mercado Livre.');return payload.data as T;}
export const mercadoLivreAffiliateApi={
  status:()=>request<MercadoLivreAffiliateStatus>('/status'),
  createPairing:(name='Chrome')=>request<{code:string;expiresAt:string}>('/pairings',{method:'POST',body:JSON.stringify({name})}),
  revoke:(instanceId:string)=>request<void>(`/instances/${encodeURIComponent(instanceId)}`,{method:'DELETE'}),
  test:(sourceUrl:string,trackingLabel?:string)=>request<BrowserCompanionJobSummary>('/test',{method:'POST',body:JSON.stringify({sourceUrl,trackingLabel})}),
  job:(jobId:string)=>request<BrowserCompanionJobSummary>(`/jobs/${encodeURIComponent(jobId)}`),
  beginRemoteLogin:(mobile = false)=>request<{liveUrl:string;expiresAt:string}>('/remote/login',{method:'POST',body:JSON.stringify({mobile})}),
  verifyRemoteLogin:()=>request<{ready:boolean;status:string}>('/remote/verify',{method:'POST'}),
  testRemote:(sourceUrl:string,trackingLabel?:string)=>request<BrowserCompanionJobSummary>('/remote/test',{method:'POST',body:JSON.stringify({sourceUrl,trackingLabel})}),
};
