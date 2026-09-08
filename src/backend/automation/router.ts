import { Router, type Request, type Response } from "express";
import type { AutomationEngine } from "../../domain/automation/AutomationEngine";
import { getAuthUser } from "../middleware/auth";
import type { AutomationEventBus } from "./eventBus";
const messages: Record<string, string> = {
  AUTOMATION_NOT_FOUND: "Automação não encontrada.",
  AUTOMATION_NAME_INVALID: "Informe um nome válido.",
  AUTOMATION_TRIGGER_INVALID: "Selecione um gatilho válido.",
  AUTOMATION_CONDITIONS_INVALID: "Revise as condições.",
  AUTOMATION_CONDITION_OPERATOR_INVALID:
    "O operador não é compatível com o campo.",
  AUTOMATION_CONDITION_VALUE_REQUIRED: "Informe o valor da condição.",
  AUTOMATION_ACTION_INVALID: "Selecione uma ação válida.",
  AUTOMATION_QUEUE_UNAVAILABLE: "A fila configurada não está disponível.",
  AUTOMATION_TEMPLATE_UNAVAILABLE:
    "O template configurado não está disponível.",
  AUTOMATION_MONITOR_UNAVAILABLE: "O monitor configurado não está disponível.",
  AUTOMATION_GROUP_UNAVAILABLE: "O grupo configurado não está disponível.",
  AUTOMATION_ORDER_INVALID: "A ordem enviada é inválida.",
  AUTOMATION_ACTIVATION_CONFIRMATION_REQUIRED:
    "Confirme a ativação automática antes de continuar.",
  AUTOMATION_TEST_SOURCE_REQUIRED: "Selecione um produto real para testar.",
  CTA_ORIGINAL_MESSAGE_UNAVAILABLE:
    "O Modo 1 exige um produto capturado pelo Monitor de Grupos.",
  CTA_ORIGINAL_MESSAGE_NOT_FOUND:
    "A mensagem original capturada não está mais disponível para este produto.",
  AUTOMATION_REVIEW_NOT_FOUND: "A revisão não está mais disponível.",
  AUTOMATION_REVIEW_TEXT_INVALID:
    "O texto editado não passou pela validação factual.",
  AUTOMATION_EXECUTION_NOT_FOUND: "Falha não encontrada.",
  AUTOMATION_EXECUTION_DELETE_NOT_ALLOWED:
    "Só é possível excluir execuções que falharam ou aguardam nova tentativa.",
};
const code = (e: unknown) => {
  const raw = e instanceof Error ? e.message : "AUTOMATION_INTERNAL_ERROR";
  return (
    Object.keys(messages).find((x) => raw.includes(x)) ??
    (/^[A-Z][A-Z0-9_]+$/.test(raw) ? raw : "AUTOMATION_INTERNAL_ERROR")
  );
};
async function owner(req: Request, res: Response) {
  const user = await getAuthUser(req);
  if (user) return user.id;
  res
    .status(401)
    .json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
    });
  return null;
}
export function createAutomationRouter(
  service: AutomationEngine,
  events: AutomationEventBus,
) {
  const router = Router();
  const run =
    (handler: (userId: string, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      const userId = await owner(req, res);
      if (!userId) return;
      try {
        res.json({ success: true, data: await handler(userId, req) });
      } catch (error) {
        const errorCode = code(error);
        console.error("[AfiliHub:Automation] Operação recusada.", {
          path: req.path,
          errorCode,
        });
        res
          .status(
            errorCode.endsWith("NOT_FOUND")
              ? 404
              : errorCode.includes("UNAVAILABLE")
                ? 409
                : errorCode === "AUTOMATION_INTERNAL_ERROR"
                  ? 500
                  : 400,
          )
          .json({
            success: false,
            error: {
              code: errorCode,
              message:
                messages[errorCode] ?? "Não foi possível concluir a operação.",
            },
          });
      }
    };
  router.get("/events", async (req, res) => {
    const userId = await owner(req, res);
    if (!userId) return;
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.write(": connected\n\n");
    const unsubscribe = events.subscribe(userId, (event) => {
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
  router.get(
    "/",
    run((userId) => service.list(userId)),
  );
  router.post(
    "/",
    run((userId, req) => service.create(userId, req.body)),
  );
  router.get(
    "/options",
    run((userId) => service.options(userId)),
  );
  router.post(
    "/reorder",
    run((userId, req) =>
      service.reorder(userId, Array.isArray(req.body?.ids) ? req.body.ids : []),
    ),
  );
  router.get(
    "/executions",
    run((userId, req) =>
      service.executions(
        userId,
        typeof req.query.automationId === "string"
          ? req.query.automationId
          : undefined,
      ),
      ),
  );
  router.delete(
    "/executions/:id",
    run((userId, req) => service.deleteExecution(userId, req.params.id)),
  );
  router.get(
    "/reviews",
    run((userId) => service.reviews(userId)),
  );
  router.get(
    "/:id",
    run((userId, req) => service.get(userId, req.params.id)),
  );
  router.put(
    "/:id",
    run((userId, req) => service.update(userId, req.params.id, req.body)),
  );
  router.post(
    "/:id/activate",
    run(async (userId, req) => {
      const item = await service.get(userId, req.params.id);
      if (!item) throw new Error("AUTOMATION_NOT_FOUND");
      if (
        item.actionType === "QUEUE_AUTOMATICALLY" &&
        req.body?.confirmedAutomatic !== true
      )
        throw new Error("AUTOMATION_ACTIVATION_CONFIRMATION_REQUIRED");
      return service.status(userId, item.id, "active");
    }),
  );
  router.post(
    "/:id/pause",
    run((userId, req) => service.status(userId, req.params.id, "paused")),
  );
  router.post(
    "/:id/resume",
    run((userId, req) => service.status(userId, req.params.id, "active")),
  );
  router.post(
    "/:id/archive",
    run((userId, req) => service.status(userId, req.params.id, "archived")),
  );
  router.post(
    "/:id/dry-run",
    run((userId, req) => service.dryRun(userId, req.params.id, req.body ?? {})),
  );
  router.post(
    "/reviews/:id/approve",
    run((userId, req) => service.approveReview(userId, req.params.id)),
  );
  router.post(
    "/reviews/:id/reject",
    run((userId, req) =>
      service.rejectReview(userId, req.params.id, req.body?.reason),
    ),
  );
  router.patch(
    "/reviews/:id",
    run((userId, req) =>
      service.editReview(userId, req.params.id, String(req.body?.text ?? "")),
    ),
  );
  return router;
}
