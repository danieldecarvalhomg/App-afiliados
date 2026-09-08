import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ImagePlus, Images, LoaderCircle } from 'lucide-react';
import type { ProductRecord } from '../../domain/products/types';
import type { ProductPresentationContext } from '../../domain/media/types';
import { productsApi } from '../../services/productsApi';

export function ProductMediaPanel({product}:{product:ProductRecord}){
  const [context,setContext]=useState<ProductPresentationContext|null>(null);const [open,setOpen]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);const input=useRef<HTMLInputElement>(null);
  async function load(){try{setContext(await productsApi.media(product.id));}catch{/* card continua funcional sem mídia */}}
  useEffect(()=>{void load();},[product.id,product.mediaStatus]);
  async function upload(file?:File){if(!file)return;setBusy(true);setError(null);try{await productsApi.uploadMedia(product.id,file);await load();setOpen(true);}catch(cause){setError(cause instanceof Error?cause.message:'Falha ao enviar imagem.');}finally{setBusy(false);if(input.current)input.current.value='';}}
  async function select(assetId:string){setBusy(true);setError(null);try{await productsApi.selectMedia(product.id,assetId);await load();}catch(cause){setError(cause instanceof Error?cause.message:'Falha ao selecionar imagem.');}finally{setBusy(false);}}
  const primary=context?.primaryImage;const all=[...(primary?[primary]:[]),...(context?.alternativeImages??[])];
  return <div className="space-y-2">{primary?.displayUrl?<div className="relative"><img src={primary.displayUrl} alt={product.title} className="h-40 w-full rounded-lg object-cover"/><span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold tracking-wide">PRIMARY IMAGE</span></div>:<div className="flex h-40 items-center justify-center rounded-lg bg-[#F8FAFC]"><Images className="h-8 w-8 text-[#6B6F7B]"/></div>}
    <div className="flex items-center justify-between gap-2 text-xs text-[#6B6F7B]"><span>{context?.mediaStatus==='needs_review'?'Imagem precisa de revisão':primary?(primary.selectionStatus==='manual_selected'?'Selecionada manualmente':'Selecionada automaticamente'):'Nenhuma imagem disponível'}</span><button type="button" onClick={()=>setOpen(!open)} className="text-white hover:underline">{all.length?'Trocar imagem':'Enviar imagem'}</button></div>
    {context?.mediaStatus==='needs_review'&&<div className="flex items-center gap-1 text-xs text-amber-300"><AlertTriangle className="h-3.5 w-3.5"/>Encontramos uma imagem, mas ela precisa ser revisada.</div>}
    {open&&<div className="space-y-3 rounded-lg border border-[#E8E9ED] bg-[#F8FAFC] p-3"><div className="grid grid-cols-3 gap-2">{all.map((asset)=><button type="button" key={asset.id} disabled={busy||asset.analysisStatus!=='completed'} onClick={()=>void select(asset.id)} className={`relative overflow-hidden rounded border ${asset.isPrimary?'border-emerald-500':'border-[#E8E9ED]'}`}>{asset.displayUrl&&<img src={asset.displayUrl} className="aspect-square w-full object-cover" alt="Candidata real"/>}{asset.isPrimary&&<Check className="absolute right-1 top-1 h-4 w-4 rounded-full bg-emerald-500 p-0.5 text-black"/>}</button>)}</div><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event)=>void upload(event.target.files?.[0])}/><button type="button" disabled={busy} onClick={()=>input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded border border-[#D4D4D8] py-2 text-xs">{busy?<LoaderCircle className="h-4 w-4 animate-spin"/>:<ImagePlus className="h-4 w-4"/>}Enviar outra</button>{error&&<p className="text-xs text-red-300">{error}</p>}</div>}
  </div>;
}
