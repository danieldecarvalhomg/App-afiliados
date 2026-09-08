import { Router, type Request, type Response } from 'express';
import type { AppResult } from '../../domain/errors';
import type { CaptureFilters, WhatsAppMessageType } from '../../domain/monitoring/types';
import type { MonitoringService } from '../../domain/monitoring/MonitorService';
import type { PromotionProcessingService } from '../../domain/monitoring/PromotionProcessingService';
import { getAuthUser } from '../middleware/auth';
import type { OfferReviewService } from '../../domain/monitoring/OfferReviewService';

function statusFor(result: AppResult<unknown>): number {
  if (!('error' in result)) return 200;
  if (result.error.code === 'VALIDATION_ERROR') return 400;
  if (result.error.code.endsWith('_FORBIDDEN')) return 403;
  if (result.error.code.endsWith('_NOT_FOUND')) return 404;
  if (result.error.code.endsWith('_CONFLICT') || result.error.code === 'CAPTURE_REPROCESS_NOT_ALLOWED') return 409;
  if (result.error.code === 'OFFER_PRODUCT_DATA_INCOMPLETE') return 422;
  if (result.error.code === 'MONITORING_PERSISTENCE_ERROR') return 503;
  return 500;
}
async function userId(req: Request, res: Response): Promise<string | null> {
  const user = await getAuthUser(req);
  if (!user) res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' } });
  return user?.id ?? null;
}
function send(res: Response, result: AppResult<unknown>, created = false): void {
  res.status(result.success && created ? 201 : statusFor(result)).json(result);
}

export function createMonitoringRouter(service: MonitoringService, promotionService?: PromotionProcessingService, offerReview?: OfferReviewService): Router {
  const router = Router();
  router.get('/review-settings', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.getReviewSettings(id)); });
  router.patch('/review-settings', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.updateReviewSettings(id, req.body)); });
  router.get('/monitors', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.listMonitors(id)); });
  router.post('/monitors', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.createMonitor(id, req.body?.groupId, req.body?.reviewRequired), true); });
  router.patch('/monitors/:id', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.updateMonitor(id, req.params.id, req.body)); });
  router.delete('/monitors/:id', async (req, res) => { const id = await userId(req, res); if (id) send(res, await service.deleteMonitor(id, req.params.id)); });
  router.get('/captures', async (req, res) => {
    const id = await userId(req, res); if (!id) return;
    const filters: CaptureFilters = {
      connectionId: typeof req.query.connectionId === 'string' ? req.query.connectionId : undefined,
      groupId: typeof req.query.groupId === 'string' ? req.query.groupId : undefined,
      monitorId: typeof req.query.monitorId === 'string' ? req.query.monitorId : undefined,
      messageType: typeof req.query.messageType === 'string' ? req.query.messageType as WhatsAppMessageType : undefined,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit: typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined,
    };
    send(res, await service.listCaptures(id, filters));
  });
  router.delete('/captures', async (req, res) => {
    const id = await userId(req, res); if (id) send(res, await service.clearCaptureHistory(id));
  });
  router.post('/captures/:id/reprocess', async (req, res) => {
    const id = await userId(req, res); if (!id) return;
    if (!promotionService) {
      return res.status(503).json({ success: false, error: {
        code: 'PROMOTION_PROCESSOR_NOT_CONFIGURED', message: 'O processador de promoções não está configurado.',
      } });
    }
    send(res, await promotionService.reprocess(id, req.params.id));
  });
  router.post('/captures/:id/review', async (req, res) => {
    const id = await userId(req, res); if (!id) return;
    if (!offerReview) return res.status(503).json({ success: false, error: {
      code: 'OFFER_REVIEW_NOT_CONFIGURED', message: 'A revisão interna de ofertas não está disponível.',
    } });
    send(res, await offerReview.decide(id, req.params.id, req.body?.decision));
  });
  return router;
}
