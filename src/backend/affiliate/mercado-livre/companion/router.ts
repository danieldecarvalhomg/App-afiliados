import { Router, type Request, type Response } from 'express';
import { getAuthUser } from '../../../middleware/auth';
import type { MercadoLivreCompanionInstance } from './types';
import { MercadoLivreCompanionError } from './types';
import type { MercadoLivreCompanionService } from './MercadoLivreCompanionService';

async function owner(req: Request, res: Response): Promise<string | null> {
  const user = await getAuthUser(req);
  if (user) return user.id;
  res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Usuário não autenticado.' } });
  return null;
}

async function companion(req: Request, res: Response, service: MercadoLivreCompanionService): Promise<MercadoLivreCompanionInstance | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const instance = token ? await service.authenticate(token) : null;
  if (instance) return instance;
  res.status(401).json({ success: false, error: { code: 'COMPANION_UNAUTHORIZED', message: 'Credencial do Companion inválida ou expirada.' } });
  return null;
}

function errorCode(error: unknown): string {
  if (error instanceof MercadoLivreCompanionError) return error.code;
  const value = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  return /^[A-Z][A-Z0-9_]+$/u.test(value) ? value : 'UNKNOWN_ERROR';
}

const messages: Record<string, string> = {
  PAIRING_CODE_INVALID: 'Código de pareamento inválido ou expirado.',
  COMPANION_INSTANCE_NOT_FOUND: 'Extensão não encontrada.',
  COMPANION_JOB_NOT_FOUND: 'Job não encontrado.',
  COMPANION_NOT_PAIRED: 'Conecte a extensão AfiliHub.',
  COMPANION_OFFLINE: 'A extensão AfiliHub está offline.',
  COMPANION_OUTDATED: 'Atualize a extensão AfiliHub.',
  SOURCE_URL_REQUIRED: 'Informe uma URL direta de produto do Mercado Livre.',
  LINK_VALIDATION_FAILED: 'Use a URL direta da página do produto Mercado Livre.',
  JOB_ALREADY_CLAIMED: 'Este job já pertence a outra extensão.',
  CIRCUIT_OPEN: 'A integração foi pausada após detectar mudanças no Portal.',
};

function failure(res: Response, error: unknown) {
  const code = errorCode(error);
  const status = code.includes('NOT_FOUND') ? 404
    : code === 'JOB_ALREADY_CLAIMED' ? 409
      : code === 'COMPANION_OUTDATED' || code === 'CIRCUIT_OPEN' ? 503
        : code === 'UNKNOWN_ERROR' ? 500 : 400;
  return res.status(status).json({ success: false, error: { code, message: messages[code] ?? 'Não foi possível concluir a operação.' } });
}

export function createMercadoLivreCompanionRouter(service: MercadoLivreCompanionService) {
  const router = Router();

  router.post('/extension/pair', async (req, res) => {
    try { res.status(201).json({ success: true, data: await service.pair(req.body ?? {}) }); }
    catch (error) { failure(res, error); }
  });
  router.post('/extension/heartbeat', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      res.json({ success: true, data: await service.heartbeat(instance, req.body ?? {}) });
    } catch (error) { failure(res, error); }
  });
  router.post('/extension/session/sync', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      res.json({ success: true, data: await service.syncSession(instance, req.body ?? {}) });
    } catch (error) {
      console.warn('[AfiliHub:MercadoLivre] Falha ao sincronizar sessão do Companion.', { errorCode: errorCode(error) });
      failure(res, error);
    }
  });
  router.post('/extension/disconnect', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      await service.revoke(instance.userId, instance.id);
      res.json({ success: true, data: undefined });
    } catch (error) { failure(res, error); }
  });
  router.post('/extension/jobs/claim', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      res.json({ success: true, data: await service.claim(instance) });
    } catch (error) { failure(res, error); }
  });
  router.post('/extension/jobs/:id/processing', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      await service.processing(instance, req.params.id);
      res.json({ success: true, data: undefined });
    } catch (error) { failure(res, error); }
  });
  router.post('/extension/jobs/:id/complete', async (req, res) => {
    try {
      const instance = await companion(req, res, service); if (!instance) return;
      res.json({ success: true, data: await service.complete(instance, req.params.id, req.body ?? {}) });
    } catch (error) { failure(res, error); }
  });

  router.get('/user/status', async (req, res) => {
    try { const id = await owner(req, res); if (id) res.json({ success: true, data: await service.status(id) }); }
    catch (error) { failure(res, error); }
  });
  router.post('/user/session/refresh', async (req, res) => {
    try { const id = await owner(req, res); if (id) res.json({ success: true, data: await service.refreshSession(id) }); }
    catch (error) { failure(res, error); }
  });
  router.post('/user/pairings', async (req, res) => {
    try { const id = await owner(req, res); if (id) res.status(201).json({ success: true, data: await service.createPairing(id, req.body?.name) }); }
    catch (error) { failure(res, error); }
  });
  router.delete('/user/instances/:id', async (req, res) => {
    try { const id = await owner(req, res); if (id) { await service.revoke(id, req.params.id); res.json({ success: true, data: undefined }); } }
    catch (error) { failure(res, error); }
  });
  router.post('/user/test', async (req, res) => {
    try { const id = await owner(req, res); if (id) res.status(202).json({ success: true, data: await service.createTest(id, req.body?.sourceUrl, req.body?.trackingLabel) }); }
    catch (error) { failure(res, error); }
  });
  router.get('/user/jobs/:id', async (req, res) => {
    try { const id = await owner(req, res); if (id) res.json({ success: true, data: await service.getJob(id, req.params.id) }); }
    catch (error) { failure(res, error); }
  });

  return router;
}
