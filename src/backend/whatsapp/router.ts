import { Router, type Request, type Response } from "express";
import type { AppResult } from "../../domain/errors";
import type { AuthUser } from "../middleware/auth";
import { getAuthUser } from "../middleware/auth";
import type { WhatsAppService } from "../../services/whatsappService";
import { whatsAppEventBus } from "./eventBus";

function statusFor(result: AppResult<unknown>): number {
  if (!("error" in result)) return 200;
  const code = result.error.code;
  if (code === "UNAUTHORIZED") return 401;
  if (code.endsWith("_FORBIDDEN")) return 403;
  if (code.endsWith("_NOT_FOUND")) return 404;
  if (
    code === "WHATSAPP_CONNECTION_LIMIT_REACHED" ||
    code === "WHATSAPP_ALREADY_CONNECTED"
  )
    return 409;
  if (code === "VALIDATION_ERROR") return 400;
  if (code === "WHATSAPP_NOT_CONNECTED" || code === "WHATSAPP_LOGGED_OUT")
    return 409;
  if (code === "WHATSAPP_PERSISTENCE_ERROR") return 503;
  return 500;
}

async function authorized(
  req: Request,
  res: Response,
): Promise<AuthUser | null> {
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
    });
  }
  return user;
}

function sendResult(
  res: Response,
  result: AppResult<unknown>,
  successStatus = 200,
): void {
  res.status(result.success ? successStatus : statusFor(result)).json(result);
}

export function createWhatsAppRouter(service: WhatsAppService): Router {
  const router = Router();

  router.get("/events", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");
    const unsubscribe = whatsAppEventBus.subscribe(user.id, (event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  router.get("/connections", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.listUserConnections(user.id));
  });

  router.post("/connections", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(
      res,
      await service.createUserConnection(user.id, req.body?.label),
      201,
    );
  });

  router.get("/groups", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.listUserGroups(user.id));
  });

  router.get("/connections/:id", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.getUserConnection(user.id, req.params.id));
  });

  router.get("/connections/:id/qr", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    const owned = await service.getUserConnection(user.id, req.params.id);
    if (!owned.success) return sendResult(res, owned);
    res.json({
      success: true,
      data: { qr: whatsAppEventBus.getLatestQr(user.id, req.params.id) },
    });
  });

  router.delete("/connections/:id", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.deleteUserConnection(user.id, req.params.id));
  });

  router.post("/connections/:id/connect", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.connectUserWhatsApp(user.id, req.params.id));
  });

  router.post("/connections/:id/disconnect", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(
      res,
      await service.disconnectUserWhatsApp(user.id, req.params.id),
    );
  });

  router.get("/connections/:id/status", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(
      res,
      await service.getUserConnectionStatus(user.id, req.params.id),
    );
  });

  router.get("/connections/:id/groups", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.getConnectionGroups(user.id, req.params.id));
  });

  router.post("/connections/:id/groups/sync", async (req, res) => {
    const user = await authorized(req, res);
    if (!user) return;
    sendResult(res, await service.syncConnectionGroups(user.id, req.params.id));
  });

  return router;
}
