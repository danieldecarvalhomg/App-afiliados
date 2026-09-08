import { Router, raw, type Request, type Response } from 'express';
import type { AppResult } from '../../domain/errors';
import type { AffiliateAccountService } from '../../domain/affiliate/AffiliateAccountService';
import type { AffiliateConversionService } from '../../domain/affiliate/AffiliateConversionService';
import type { ProductService } from '../../domain/products/ProductService';
import { getAuthUser } from '../middleware/auth';
import type { ProductMediaService } from '../../domain/media/ProductMediaService';

async function owner(req: Request, res: Response): Promise<string | null> {
  const user = await getAuthUser(req); if (user) return user.id;
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' } }); return null;
}
function status(result: AppResult<unknown>, created = false): number {
  if (result.success) return created ? 201 : 200;
  if (!('error' in result)) return 500;
  if (result.error.code === 'VALIDATION_ERROR') return 400;
  if (result.error.code.endsWith('_NOT_FOUND')) return 404;
  if (result.error.code.endsWith('_CONFLICT') || result.error.code.endsWith('_NOT_ALLOWED')) return 409;
  if (result.error.code.endsWith('_NOT_CONFIGURED')) return 503;
  return 500;
}
export function createAffiliateRouter(accounts: AffiliateAccountService): Router {
  const router = Router();
  router.get('/accounts', async (req, res) => { const id = await owner(req, res); if (id) { const result = await accounts.list(id); res.status(status(result)).json(result); } });
  router.put('/accounts/shopee', async (req, res) => { const id = await owner(req, res); if (id) { const result = await accounts.configureShopee(id, req.body?.appId, req.body?.secret); res.status(status(result)).json(result); } });
  router.put('/accounts/amazon', async (req, res) => { const id = await owner(req, res); if (id) { const result = await accounts.configureAmazon(id, req.body?.appId, req.body?.secret, req.body?.partnerTag); res.status(status(result)).json(result); } });
  router.put('/accounts/mercado-livre', async (req, res) => { const id = await owner(req, res); if (id) { const result = await accounts.configureMercadoLivre(id, req.body?.appId, req.body?.secret, req.body?.accessToken, req.body?.refreshToken); res.status(status(result)).json(result); } });
  return router;
}
export function createProductsRouter(products: ProductService, conversions: AffiliateConversionService, media?: ProductMediaService): Router {
  const router = Router();
  router.get('/', async (req, res) => { const id = await owner(req, res); if (id) { const result = await products.list(id, typeof req.query.sourceType === 'string' ? req.query.sourceType : undefined); res.status(status(result)).json(result); } });
  router.post('/', async (req, res) => { const id = await owner(req, res); if (id) { const result = await products.createManual(id, req.body ?? {}); res.status(status(result, true)).json(result); } });
  router.delete('/:id', async (req, res) => { const id = await owner(req, res); if (id) { const result = await products.delete(id, req.params.id); res.status(status(result)).json(result); } });
  router.post('/:id/retry-affiliate', async (req, res) => { const id = await owner(req, res); if (id) { const result = await conversions.reprocess(id, req.params.id); res.status(status(result)).json(result); } });
  router.post('/:id/affiliate-link', async (req, res) => { const id = await owner(req, res); if (id) { const result = await products.completeManualAffiliate(id, req.params.id, req.body?.affiliateUrl); res.status(status(result)).json(result); } });
  router.get('/:id/media', async (req,res)=>{const id=await owner(req,res);if(!id||!media)return;const result=await media.list(id,req.params.id);if(!result)return res.status(404).json({success:false,error:{code:'PRODUCT_NOT_FOUND',message:'Produto não encontrado.'}});res.json({success:true,data:result});});
  router.post('/:id/media', raw({type:['image/jpeg','image/png','image/webp','application/octet-stream'],limit:'8mb'}), async(req,res)=>{const id=await owner(req,res);if(!id||!media)return;try{const bytes=req.body instanceof Buffer?new Uint8Array(req.body):new Uint8Array();const asset=await media.uploadManual(id,req.params.id,bytes,req.headers['content-type']??null);res.status(201).json({success:true,data:asset});}catch(error){const code=error instanceof Error?error.message:'MEDIA_UPLOAD_FAILED';res.status(code==='PRODUCT_NOT_FOUND'?404:400).json({success:false,error:{code,message:mediaMessage(code)}});}});
  router.post('/:id/media/:assetId/select',async(req,res)=>{const id=await owner(req,res);if(!id||!media)return;const selected=await media.selectManual(id,req.params.id,req.params.assetId);res.status(selected?200:409).json(selected?{success:true,data:undefined}:{success:false,error:{code:'MEDIA_SELECTION_NOT_ALLOWED',message:'Esta imagem não pode ser definida como principal.'}});});
  return router;
}

function mediaMessage(code:string){return({IMAGE_TOO_LARGE:'A imagem excede 8 MB.',INVALID_IMAGE_MIME:'Envie uma imagem JPEG, PNG ou WEBP válida.',MIME_MISMATCH:'O tipo declarado não corresponde ao conteúdo real da imagem.',INVALID_IMAGE_DIMENSIONS:'A imagem possui dimensões inválidas.',EMPTY_IMAGE:'Selecione uma imagem.'}as Record<string,string>)[code]??'Não foi possível enviar a imagem.';}
