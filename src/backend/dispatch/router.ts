import { Router, type Request, type Response } from 'express';
import type { CampaignService } from '../../domain/dispatch/CampaignService';
import type { CampaignCollectionService } from '../../domain/dispatch/CampaignCollectionService';
import type { QueueService } from '../../domain/dispatch/QueueService';
import { getAuthUser } from '../middleware/auth';
import type { DispatchEventBus } from './eventBus';

type BackendError = { code?: unknown; message?: unknown };

const messages: Record<string, string> = {
  CAMPAIGN_NOT_FOUND: 'Campanha não encontrada.',
  CAMPAIGN_NAME_INVALID: 'Informe um nome válido para a campanha.',
  CAMPAIGN_DESTINATIONS_REQUIRED: 'Selecione ao menos um grupo da conexão.',
  CAMPAIGN_CONNECTION_FORBIDDEN: 'A conexão não pertence a esta conta.',
  CAMPAIGN_GROUP_FORBIDDEN: 'Um dos grupos não pertence à conexão selecionada.',
  CAMPAIGN_GROUP_UNAVAILABLE: 'Um dos grupos selecionados não está mais disponível.',
  CAMPAIGN_NOT_EDITABLE: 'Esta campanha não pode mais ser editada.',
  CAMPAIGN_NOT_QUEUEABLE: 'Esta campanha não aceita novos itens.',
  QUEUE_ITEM_NOT_FOUND: 'Item da fila não encontrado.',
  QUEUE_CONTENT_EMPTY: 'Informe uma mensagem ou uma imagem válida.',
  QUEUE_TEXT_TOO_LONG: 'A mensagem excede o limite de 4.096 caracteres.',
  QUEUE_CAPTION_TOO_LONG: 'A legenda excede o limite de 4.096 caracteres.',
  QUEUE_WATERMARK_TEXT_REQUIRED: 'Informe o texto da marca d’água.',
  QUEUE_WATERMARK_TEXT_TOO_LONG: 'A marca d’água deve ter no máximo 120 caracteres.',
  QUEUE_WATERMARK_POSITION_INVALID: 'Selecione uma posição válida para a marca d’água.',
  QUEUE_WATERMARK_OPACITY_INVALID: 'A opacidade da marca d’água deve ficar entre 10% e 100%.',
  QUEUE_SCHEDULE_INVALID: 'A data de agendamento é inválida.',
  QUEUE_IDEMPOTENCY_KEY_REQUIRED: 'Não foi possível confirmar a operação com segurança.',
  QUEUE_IDEMPOTENCY_CONFLICT: 'Esta confirmação já foi usada com outro conteúdo.',
  QUEUE_SNAPSHOT_CHANGED: 'O conteúdo mudou desde o resumo. Revise antes de confirmar.',
  QUEUE_MEDIA_FORBIDDEN: 'A imagem selecionada não está disponível para envio.',
  QUEUE_SOURCE_NOT_IMPLEMENTED: 'Esta origem ainda não pode ser adicionada à fila.',
  QUEUE_TIME_INVALID: 'Informe horários válidos.',
  QUEUE_TIMEZONE_INVALID: 'Informe um fuso horário IANA válido.',
  QUEUE_MODE_INVALID: 'Selecione um modo de execução válido.',
  QUEUE_INTERVAL_INVALID: 'O intervalo deve ficar entre 1 segundo e 24 horas.',
  QUEUE_WINDOW_INVALID: 'O fim da janela deve ser posterior ao início.',
  QUEUE_DAYS_INVALID: 'Selecione ao menos um dia permitido.',
  QUEUE_SLOTS_REQUIRED: 'Adicione ao menos um horário fixo.',
  QUEUE_SLOT_OUTSIDE_WINDOW: 'Todos os horários fixos devem estar dentro da janela permitida.',
  QUEUE_ORDER_INVALID: 'A nova ordem não corresponde aos itens pendentes da fila.',
  QUEUE_EMPTY: 'Não há item pendente nesta fila.',
  QUEUE_MANUAL_REQUIRED: 'Esta ação só está disponível em filas manuais ativas.',
  QUEUE_DELIVERY_NOT_FOUND: 'A entrega não está disponível para nova tentativa.',
  QUEUE_CONNECTION_HAS_ACTIVE_ITEMS: 'A conexão não pode ser alterada enquanto houver itens ativos.',
  CTA_GENERATION_REQUIRED: 'Selecione uma geração de CTA.',
  CTA_GENERATION_NOT_FOUND: 'A geração de CTA não foi encontrada.',
  CTA_NOT_PUBLISHABLE: 'O CTA ainda não está válido para publicação.',
};

function errorCode(error: unknown) {
  const candidate = error as BackendError | null;
  const raw = error instanceof Error ? error.message : typeof candidate?.message === 'string' ? candidate.message : typeof candidate?.code === 'string' ? candidate.code : 'DISPATCH_INTERNAL_ERROR';
  const known = Object.keys(messages).find((value) => raw.includes(value));
  return known ?? (/^[A-Z][A-Z0-9_]+$/.test(raw) ? raw : 'DISPATCH_INTERNAL_ERROR');
}

function httpStatus(code: string) {
  if (code.endsWith('_NOT_FOUND')) return 404;
  if (code.includes('FORBIDDEN')) return 403;
  if (code.includes('CONFLICT') || code === 'QUEUE_SNAPSHOT_CHANGED') return 409;
  if (code.includes('INVALID') || code.includes('REQUIRED') || code.includes('EMPTY') || code.includes('NOT_QUEUEABLE') || code.includes('NOT_EDITABLE') || code.includes('NOT_RESUMABLE') || code.includes('NOT_PUBLISHABLE') || code.includes('NOT_IMPLEMENTED') || code.includes('UNAVAILABLE')) return 400;
  return 500;
}

async function owner(req: Request, res: Response) {
  const user = await getAuthUser(req);
  if (user) return user.id;
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' } });
  return null;
}

export function createDispatchRouter(campaignCollections: CampaignCollectionService, queues: CampaignService, queue: QueueService, events: DispatchEventBus) {
  const router = Router();
  const run = (handler: (userId: string, req: Request) => Promise<unknown>, event?: (data: any, req: Request) => Omit<Parameters<DispatchEventBus['publish']>[1], 'occurredAt'>) => async (req: Request, res: Response) => {
    const userId = await owner(req, res);
    if (!userId) return;
    try {
      const data = await handler(userId, req);
      if (event) events.publish(userId, event(data, req));
      res.json({ success: true, data });
    } catch (error) {
      const code = errorCode(error);
      const detail = error as BackendError | null;
      console.error('[AfiliHub:Dispatch] Falha segura na operação.', { method: req.method, path: req.path, errorCode: code, databaseCode: typeof detail?.code === 'string' ? detail.code : undefined });
      res.status(httpStatus(code)).json({ success: false, error: { code, message: messages[code] ?? 'Não foi possível concluir esta ação.' } });
    }
  };

  router.get('/campaigns', run((userId) => campaignCollections.list(userId)));
  router.post('/campaigns', run((userId, req) => campaignCollections.create(userId, req.body ?? {}), (data) => ({ type: 'campaign.created', campaignId: data.id })));
  router.get('/campaigns/:id', run((userId, req) => campaignCollections.get(userId, req.params.id)));
  router.patch('/campaigns/:id', run((userId, req) => campaignCollections.update(userId, req.params.id, req.body ?? {}), (data) => ({ type: 'campaign.updated', campaignId: data.id })));

  router.get('/queues', run((userId) => queues.list(userId)));
  router.post('/queues', run((userId, req) => queues.create(userId, req.body ?? {}), (data) => ({ type: 'queue.created', campaignId: data.id, status: data.status })));
  router.get('/queues/:id', run(async (userId, req) => {
    const definition = await queues.get(userId, req.params.id);
    if (!definition) throw new Error('CAMPAIGN_NOT_FOUND');
    return { ...definition, items: await queue.list(userId, undefined, req.params.id) };
  }));
  router.patch('/queues/:id', run((userId, req) => queues.update(userId, req.params.id, req.body ?? {}), (data) => ({ type: 'queue.updated', campaignId: data?.id, status: data?.status })));
  router.post('/queues/:id/pause', run((userId, req) => queues.pause(userId, req.params.id), (data) => ({ type: 'queue.paused', campaignId: data.id, status: data.status })));
  router.post('/queues/:id/resume', run((userId, req) => queues.resume(userId, req.params.id), (data) => ({ type: 'queue.resumed', campaignId: data.id, status: data.status })));
  router.post('/queues/:id/archive', run((userId, req) => queues.archive(userId, req.params.id), (data) => ({ type: 'queue.archived', campaignId: data.id, status: data.status })));
  router.post('/queues/:id/reorder', run((userId, req) => queue.reorder(userId, req.params.id, req.body?.itemIds ?? []), () => ({ type: 'queue.reordered', campaignId: undefined })));
  router.post('/queues/:id/send-next', run((userId, req) => queue.sendNext(userId, req.params.id), (data) => ({ type: 'queue.manual_requested', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));

  router.get('/queue', run((userId, req) => queue.list(userId, typeof req.query.status === 'string' ? req.query.status : undefined, typeof req.query.queueId === 'string' ? req.query.queueId : undefined)));
  router.post('/queue/preview', run((userId, req) => queue.preview(userId, req.body ?? {})));
  router.post('/queue', run((userId, req) => queue.create(userId, req.body ?? {}), (data) => ({ type: 'queue.item.created', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));
  router.get('/queue/:id', run((userId, req) => queue.get(userId, req.params.id)));
  router.get('/queue/:id/deliveries', run(async (userId, req) => (await queue.get(userId, req.params.id)).deliveries));
  router.post('/queue/:id/pause', run((userId, req) => queue.pause(userId, req.params.id), (data) => ({ type: 'queue.item.paused', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));
  router.post('/queue/:id/resume', run((userId, req) => queue.resume(userId, req.params.id), (data) => ({ type: 'queue.item.resumed', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));
  router.post('/queue/:id/cancel', run((userId, req) => queue.cancel(userId, req.params.id), (data) => ({ type: 'queue.item.cancelled', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));
  router.post('/queue/:id/retry-failed', run((userId, req) => queue.retry(userId, req.params.id, req.body?.includeUncertain === true), (data) => ({ type: 'queue.item.retry_requested', campaignId: data.campaignId, queueItemId: data.id, status: data.status })));
  router.post('/deliveries/:id/retry', run((userId, req) => queue.retryDelivery(userId, req.params.id, req.body?.includeUncertain === true), (data) => ({ type: 'queue.delivery.retry_requested', campaignId: data.campaignId, queueItemId: data.queueItemId, deliveryId: data.id, status: data.status })));

  router.get('/dispatch/events', async (req, res) => {
    const userId = await owner(req, res);
    if (!userId) return;
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(': connected\n\n');
    const unsubscribe = events.subscribe(userId, (event) => res.write(`event: dispatch\ndata: ${JSON.stringify(event)}\n\n`));
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    const close = () => { clearInterval(heartbeat); unsubscribe(); };
    req.on('close', close);
    req.on('aborted', close);
  });

  return router;
}
