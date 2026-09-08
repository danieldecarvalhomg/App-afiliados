import { Router, type Request, type Response } from "express";
import type { CtaIntelligenceService } from "../../domain/cta/CtaIntelligenceService";
import { getAuthUser } from "../middleware/auth";

type SafeBackendError = { code?: unknown; message?: unknown };
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
function code(error: unknown) {
  const candidate = error as SafeBackendError | null;
  const known = (value: unknown): value is string => typeof value === "string" && /^(?:CTA_|TEMPLATE_|PRODUCT_|FEATURE_NOT_AVAILABLE_|USAGE_LIMIT_)[A-Z0-9_]{1,100}$/u.test(value);
  // Postgres usa P0001 para exceções de domínio: o código público fica na mensagem.
  if (known(candidate?.code)) return candidate.code;
  if (known(candidate?.message)) return candidate.message;
  return "CTA_INTERNAL_ERROR";
}
const status = (value: string) =>
  value === "CTA_AI_TIMEOUT" ? 504
    : value === "CTA_AI_OVERLOADED" ? 503
    : value === "CTA_AI_RATE_LIMITED" ? 429
    : value.startsWith("CTA_AI_") || value.startsWith("CTA_ASSISTANT_OUTPUT_") || value.startsWith("CTA_TRAINING_OUTPUT_") ? 502
    : value === "CTA_TRAINING_SOURCE_TOO_LARGE" ? 413
    : value.startsWith("FEATURE_NOT_AVAILABLE_") || value.startsWith("USAGE_LIMIT_")
    ? 403
    : value.endsWith("_NOT_FOUND")
    ? 404
    : value.includes("INVALID") ||
        value.includes("REQUIRED") ||
        value.startsWith("CTA_ORIGINAL_")
      ? 400
      : 500;
const publicMessage = (value: string) =>
  (
    ({
      CTA_AI_TIMEOUT: "A IA demorou para responder. Tente novamente; seu texto foi preservado.",
      CTA_AI_RATE_LIMITED: "A IA está temporariamente sobrecarregada. Aguarde um pouco e tente novamente.",
      CTA_AI_PROVIDER_FAILED: "O serviço de IA falhou. Tente novamente em instantes.",
      CTA_AI_OVERLOADED: "O provedor de IA está indisponível por excesso de demanda. Tentamos novamente, mas ele ainda não respondeu. Aguarde um pouco e tente outra vez.",
      CTA_AI_MODEL_UNAVAILABLE: "O modelo de IA configurado está indisponível.",
      CTA_AI_EMPTY_RESPONSE: "A IA retornou uma resposta vazia. Tente novamente.",
      CTA_AI_RESPONSE_INVALID: "A IA retornou uma resposta inválida. Tente novamente.",
      CTA_ASSISTANT_OUTPUT_INVALID: "A IA retornou uma interpretação inválida. Nenhuma preferência foi aplicada; tente novamente.",
      CTA_ASSISTANT_OUTPUT_TOO_LARGE: "A interpretação excedeu o limite. Divida a instrução em partes menores.",
      CTA_TRAINING_OUTPUT_INVALID: "A análise da IA veio incompleta ou inválida. O treinamento não foi aplicado; tente novamente.",
      CTA_TRAINING_OUTPUT_TOO_LARGE: "A análise excedeu o limite de memórias. Divida o treinamento em partes menores.",
      CTA_TRAINING_SOURCE_REQUIRED: "Digite ou cole o texto do treinamento.",
      CTA_MESSAGE_INVALID: "Digite uma mensagem de até 100.000 caracteres.",
      CTA_EXAMPLE_INVALID: "O exemplo deve conter texto e uma avaliação válida.",
      CTA_TEST_REQUEST_INVALID: "Solicite 1 ou 3 CTAs e use uma instrução de até 5.000 caracteres.",
      CTA_TRAINING_REVIEW_NOT_FOUND: "Essa revisão já foi aplicada ou não está mais disponível. Analise o treinamento novamente.",
      CTA_ORIGINAL_MESSAGE_UNAVAILABLE:
        "A mensagem original só está disponível para produtos capturados pelo Monitor de Grupos.",
      CTA_ORIGINAL_MESSAGE_NOT_FOUND:
        "A captura original não está mais disponível no histórico do Monitor de Grupos.",
      CTA_ORIGINAL_LINKS_NOT_FOUND:
        "A mensagem capturada não possui links comerciais que possam ser convertidos.",
      CTA_ORIGINAL_LINKS_NOT_CONVERTED:
        "Nem todos os links da mensagem original terminaram de ser convertidos. Tente novamente após a conversão.",
      CTA_ORIGINAL_MESSAGE_TOO_LONG:
        "A mensagem original ultrapassa o limite permitido para envio.",
      TEMPLATE_DSL_INVALID:
        "O template manual possui um erro de sintaxe. Revise a linha indicada.",
      TEMPLATE_ROUND_TRIP_MISMATCH:
        "A troca de modo foi bloqueada porque a conversão não preservaria o template.",
      TEMPLATE_MULTIPLE_CTA_SLOTS:
        "O template pode ter somente um bloco CTA.",
      CTA_TRAINING_SOURCE_TOO_LARGE:
        "O treinamento excede o limite de 1.000.000 de caracteres.",
      FEATURE_NOT_AVAILABLE_AI_CTA:
        "CTA com IA não está incluído no plano atual.",
      FEATURE_NOT_AVAILABLE_AI_TRAINER:
        "O Treinador de IA não está incluído no plano atual.",
      USAGE_LIMIT_AI_GENERATION:
        "A franquia mensal de gerações de IA foi atingida.",
      USAGE_LIMIT_AI_GENERATION_PRODUCT:
        "Este produto atingiu o limite mensal de gerações de IA. Escolha outro produto ou aguarde a renovação da franquia.",
    }) as Record<string, string>
  )[value] ?? "Não foi possível concluir esta ação no CTA Intelligence.";

export function createCtaRouter(service: CtaIntelligenceService) {
  const router = Router();
  const run =
    (handler: (userId: string, req: Request) => Promise<unknown>) =>
    async (req: Request, res: Response) => {
      try {
        const userId = await owner(req, res);
        if (!userId) return;
        res.json({ success: true, data: await handler(userId, req) });
      } catch (error) {
        const value = code(error);
        console.error("[AfiliHub:CTA] Falha na operação.", {
          method: req.method,
          path: req.path,
          errorCode: value,
        });
        const publicErrorMessage = value === "TEMPLATE_DSL_INVALID" && error instanceof Error
          ? error.message.slice(0, 300)
          : publicMessage(value);
        res
          .status(status(value))
          .json({
            success: false,
            error: { code: value, message: publicErrorMessage },
          });
      }
    };

  router.get(
    "/profile",
    run((id) => service.profile(id)),
  );
  router.patch(
    "/profile",
    run((id, req) => service.updateProfile(id, req.body ?? {})),
  );
  router.post(
    "/preferences/undo",
    run((id) => service.undoPreferences(id)),
  );
  router.get(
    "/rules",
    run((id) => service.rules(id)),
  );
  router.post(
    "/rules",
    run((id, req) => service.addRule(id, req.body ?? {})),
  );
  router.delete(
    "/rules/:id",
    run((id, req) => service.deleteRule(id, req.params.id)),
  );
  router.post(
    "/assistant/message",
    run((id, req) => service.assistant(id, req.body?.message)),
  );
  router.get(
    "/conversation",
    run((id) => service.conversation(id)),
  );
  router.get(
    "/history",
    run((id) => service.history(id)),
  );
  router.delete(
    "/memory",
    run((id) => service.resetMemory(id)),
  );
  router.get(
    "/examples",
    run((id) => service.examples(id)),
  );
  router.post(
    "/examples",
    run((id, req) => service.addExample(id, req.body ?? {})),
  );
  router.delete(
    "/examples/:id",
    run((id, req) => service.deleteExample(id, req.params.id)),
  );
  router.get(
    "/templates",
    run((id) => service.templates(id)),
  );
  router.post(
    "/templates",
    run((id, req) => service.createTemplate(id, req.body ?? {})),
  );
  router.get(
    "/templates/:id",
    run((id, req) => service.template(id, req.params.id)),
  );
  router.patch(
    "/templates/:id",
    run((id, req) => service.updateTemplate(id, req.params.id, req.body ?? {})),
  );
  router.delete(
    "/templates/:id",
    run((id, req) => service.deleteTemplate(id, req.params.id)),
  );
  router.post(
    "/templates/:id/duplicate",
    run((id, req) => service.duplicateTemplate(id, req.params.id)),
  );
  router.post(
    "/templates/:id/set-default",
    run((id, req) => service.setDefaultTemplate(id, req.params.id)),
  );
  router.patch(
    "/templates/:id/structure",
    run((id, req) =>
      service.applyTemplateOperations(
        id,
        req.params.id,
        req.body?.operations ?? [],
      ),
    ),
  );
  router.post(
    "/templates/:id/preview",
    run((id, req) => service.preview(id, req.params.id, req.body ?? {})),
  );
  router.post(
    "/templates/parse",
    run((_id, req) => Promise.resolve(service.parseTemplate(req.body?.dsl))),
  );
  router.post(
    "/templates/serialize",
    run((_id, req) => Promise.resolve(service.serializeTemplate(req.body?.document))),
  );
  router.post(
    "/templates/structural-preview",
    run((_id, req) => Promise.resolve(service.structuralPreview(req.body?.document))),
  );
  router.get(
    "/copy",
    run((id) => service.copy(id)),
  );
  router.post(
    "/copy",
    run((id, req) => service.createCopy(id, req.body ?? {})),
  );
  router.patch(
    "/copy/:id",
    run((id, req) => service.updateCopy(id, req.params.id, req.body ?? {})),
  );
  router.delete(
    "/copy/:id",
    run((id, req) => service.deleteCopy(id, req.params.id)),
  );
  router.post(
    "/products/:id/generate",
    run((id, req) => service.generate(id, req.params.id, req.body ?? {})),
  );
  router.get(
    "/products/:id/ai-usage",
    run((id, req) => service.productAiGenerationUsage(id, req.params.id)),
  );
  router.post(
    "/products/:id/test-cta",
    run((id, req) => service.testCta(id, req.params.id, req.body ?? {})),
  );
  router.post(
    "/products/:id/regenerate",
    run((id, req) => service.regenerate(id, req.params.id, req.body ?? {})),
  );
  router.post(
    "/generations/:id/regenerate-cta",
    run((id, req) => service.regenerateCta(id, req.params.id, req.body?.instruction)),
  );
  router.post(
    "/products/:id/original-message",
    run((id, req) => service.originalMessage(id, req.params.id)),
  );
  router.patch(
    "/generations/:id",
    run((id, req) => service.edit(id, req.params.id, req.body?.finalText)),
  );
  router.post(
    "/generations/:id/learn-edit",
    run((id, req) => service.learnFromEdit(id, req.params.id, req.body?.ctaText)),
  );
  router.post(
    "/training/analyze",
    run((id, req) => service.trainingReview(id, req.body?.source)),
  );
  router.post(
    "/training/:id/apply",
    run((id, req) => service.applyTraining(id, req.params.id)),
  );
  router.get(
    "/memory/learned",
    run((id) => service.learnedMemory(id)),
  );
  router.delete(
    "/memory/items/:id",
    run((id, req) => service.deleteLearnedMemory(id, req.params.id)),
  );
  return router;
}
