import type { SupabaseClient } from '@supabase/supabase-js';
import { lookup } from 'node:dns/promises';
import http from 'node:http'; import https from 'node:https';
import { isBlockedAddress, validatePublicHttpUrl } from '../affiliate/UrlResolverService';
import type { ProductMediaStorage, StoredImage } from '../../domain/media/ProductMediaRepository';
import { MAX_PRODUCT_IMAGE_BYTES, validateImage } from './ImageFileValidator';
import sharp from 'sharp';

export async function optimizeProductImage(bytes: Uint8Array, suppliedMimeType?: string | null): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const original = validateImage(bytes, suppliedMimeType);
  try {
    const optimized = new Uint8Array(await sharp(Buffer.from(bytes)).rotate().resize({ width:1600, height:1600, fit:'inside', withoutEnlargement:true })
      .webp({ quality:82, effort:4 }).toBuffer());
    const valid = validateImage(optimized, 'image/webp');
    if (optimized.byteLength < bytes.byteLength || original.width > 1600 || original.height > 1600) return { bytes:optimized, mimeType:valid.mimeType };
  } catch { /* arquivo válido permanece utilizável se o otimizador não reconhecer metadados incomuns */ }
  return { bytes, mimeType:original.mimeType };
}

export async function downloadTrustedImage(raw:string,redirects=0,seen=new Set<string>()):Promise<{bytes:Uint8Array;suppliedMimeType:string|null}>{if(redirects>5)throw new Error('MEDIA_REDIRECT_LIMIT');const url=validatePublicHttpUrl(raw);if(seen.has(url.toString()))throw new Error('MEDIA_REDIRECT_LOOP');seen.add(url.toString());const addresses=await lookup(url.hostname,{all:true,verbatim:true});if(!addresses.length||addresses.some((item)=>isBlockedAddress(item.address)))throw new Error('SSRF_BLOCKED');const address=addresses[0];return new Promise((resolve,reject)=>{const transport=url.protocol==='https:'?https:http;const req=transport.request({protocol:url.protocol,hostname:url.hostname,port:url.port||undefined,path:`${url.pathname}${url.search}`,method:'GET',headers:{'user-agent':'AfiliHub-ProductMedia/1.0','accept':'image/jpeg,image/png,image/webp'},lookup:((_host:string,options:{all?:boolean},callback:(...args:any[])=>void)=>options?.all?callback(null,[address]):callback(null,address.address,address.family))as any},(response)=>{const status=response.statusCode??0;if(status>=300&&status<400){response.destroy();const location=response.headers.location;if(!location)return reject(new Error('MEDIA_REDIRECT_WITHOUT_LOCATION'));void downloadTrustedImage(new URL(location,url).toString(),redirects+1,seen).then(resolve,reject);return;}if(status<200||status>=300){response.destroy();return reject(new Error(status>=500?'MEDIA_SOURCE_TEMPORARILY_UNAVAILABLE':'MEDIA_SOURCE_REJECTED'));}const chunks:Buffer[]=[];let size=0;response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_PRODUCT_IMAGE_BYTES){response.destroy(new Error('IMAGE_TOO_LARGE'));return;}chunks.push(chunk);});response.on('end',()=>resolve({bytes:new Uint8Array(Buffer.concat(chunks)),suppliedMimeType:typeof response.headers['content-type']==='string'?response.headers['content-type'].split(';')[0]:null}));response.on('error',reject);});req.setTimeout(10_000,()=>req.destroy(new Error('MEDIA_DOWNLOAD_TIMEOUT')));req.on('error',reject);req.end();});}

export class SupabaseProductMediaStorage implements ProductMediaStorage{
  constructor(private readonly db:SupabaseClient){}
  fetchTrustedSource(url:string){return downloadTrustedImage(url);}
  async store(userId:string,productId:string,_assetId:string,bytes:Uint8Array,suppliedMimeType?:string|null):Promise<StoredImage>{const optimized=await optimizeProductImage(bytes,suppliedMimeType);const valid=validateImage(optimized.bytes,optimized.mimeType);const extension=valid.mimeType==='image/jpeg'?'jpg':valid.mimeType==='image/png'?'png':'webp';const storagePath=`${userId}/${productId}/${valid.contentHash}.${extension}`;const {error}=await this.db.storage.from('product-media').upload(storagePath,optimized.bytes,{contentType:valid.mimeType,upsert:false,cacheControl:'31536000'});if(error&&!(error.message??'').toLowerCase().includes('already exists'))throw error;return{storagePath,mimeType:valid.mimeType,fileSize:optimized.bytes.byteLength,width:valid.width,height:valid.height,contentHash:valid.contentHash,analysisBytes:optimized.bytes};}
  async read(storagePath:string){const {data,error}=await this.db.storage.from('product-media').download(storagePath);if(error)throw error;const bytes=new Uint8Array(await data.arrayBuffer());const valid=validateImage(bytes,data.type);return{bytes,mimeType:valid.mimeType};}
  async sign(storagePath:string){const {data,error}=await this.db.storage.from('product-media').createSignedUrl(storagePath,300);if(error)return null;return data.signedUrl;}
}
