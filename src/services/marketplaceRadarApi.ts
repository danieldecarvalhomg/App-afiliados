import { supabase } from '../lib/supabase';
import {readJsonResponse} from './apiResponse';
import {notifyProductCatalogChanged} from './productCatalogEvents';
import type { MarketplaceDeal, RadarFilters, RadarPage } from '../domain/marketplaces/discovery/types';
import type { ProductRecord } from '../domain/products/types';
interface Payload<T>{success:boolean;data?:T;error?:{code:string;message:string}}
export class RadarApiError extends Error{constructor(public readonly code:string,message:string){super(message)}}
async function request<T>(path:string,init:RequestInit={}){const {data}=await supabase.auth.getSession();if(!data.session?.access_token)throw new RadarApiError('UNAUTHORIZED','Faça login para usar o Radar.');const response=await fetch(path,{cache:'no-store',...init,headers:{'content-type':'application/json',authorization:`Bearer ${data.session.access_token}`,...init.headers}});const payload=await readJsonResponse<Payload<T>>(response);if(!response.ok||!payload.success)throw new RadarApiError(payload.error?.code??'RADAR_API_ERROR',payload.error?.message??'Falha no Radar.');return payload.data as T;}
function query(filters:RadarFilters){const params=new URLSearchParams();Object.entries(filters).forEach(([key,value])=>{if(value!==undefined&&value!==null&&value!=='')params.set(key,String(value));});return params.toString();}
export const marketplaceRadarApi={list:(filters:RadarFilters={})=>request<RadarPage>(`/api/marketplace-radar/deals?${query(filters)}`),refresh:(marketplace:RadarFilters['marketplace']='shopee')=>request<{received:number;inserted:number;updated:number;unchanged:number}>('/api/marketplace-radar/refresh',{method:'POST',body:JSON.stringify({marketplace})}),prepare:async(id:string)=>{const result=await request<{product:ProductRecord;created:boolean}>(`/api/marketplace-radar/deals/${id}/prepare`,{method:'POST'});if(result.created)notifyProductCatalogChanged();return result;}};
