import { Router, type Request, type Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSelfServicePlanCode } from "../../domain/subscription/plans";
import { getAuthUser } from "../middleware/auth";

export function createAccountRouter(admin: SupabaseClient) {
  const router = Router();
  router.post("/subscription", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
      });
      return;
    }

    const planCode = req.body?.planCode;
    if (!isSelfServicePlanCode(planCode)) {
      res.status(422).json({
        success: false,
        error: {
          code: "PLAN_NOT_SELF_SERVICE",
          message: "Esse plano não está disponível para troca automática.",
        },
      });
      return;
    }

    try {
      const { data: current, error: currentError } = await admin
        .from("subscriptions")
        .select("plan_code,billing_mode")
        .eq("user_id", user.id)
        .maybeSingle();
      if (currentError) throw currentError;
      if (current?.billing_mode === "live") {
        res.status(409).json({
          success: false,
          error: {
            code: "CHECKOUT_REQUIRED",
            message: "A troca desse plano precisa ser concluída pelo checkout.",
          },
        });
        return;
      }
      if (current?.plan_code === planCode) {
        res.json({ success: true, data: { planCode, unchanged: true } });
        return;
      }

      const { data, error } = await admin.rpc("apply_subscription_plan", {
        p_user_id: user.id,
        p_plan_code: planCode,
        p_billing_mode: "preview",
      });
      if (error) throw error;

      void admin.from("security_events").insert({
        user_id: user.id,
        event_type: "SUBSCRIPTION_PLAN_CHANGED",
        metadata: {
          source: "subscription",
          previous_plan_code: current?.plan_code ?? null,
          plan_code: planCode,
          billing_mode: "preview",
        },
      });

      res.json({
        success: true,
        data: { planCode: data?.plan_code ?? planCode, unchanged: false },
      });
    } catch (error) {
      console.error("[AfiliHub:Account] Falha ao alterar plano.", {
        userId: user.id,
        planCode,
        error: error instanceof Error ? error.message : "unknown",
      });
      res.status(500).json({
        success: false,
        error: {
          code: "SUBSCRIPTION_CHANGE_FAILED",
          message: "Não foi possível alterar o plano agora.",
        },
      });
    }
  });

  router.delete("/", async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    if (!user) {
      res
        .status(401)
        .json({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Usuário não autenticado." },
        });
      return;
    }
    try {
      const { data: memberships, error: membershipsError } = await admin
        .from("account_members")
        .select("account_id, role")
        .eq("user_id", user.id);
      if (membershipsError) throw membershipsError;

      const ownedAccountIds = (memberships ?? [])
        .filter((membership) => membership.role === "owner")
        .map((membership) => membership.account_id as string);
      // Pausa regras antes da exclusão para impedir novas execuções enquanto os
      // registros relacionados são removidos pelo cascade do Auth.
      await admin
        .from("automation_rules")
        .update({ status: "paused", safety_paused_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .in("status", ["active", "error"]);
      await admin
        .from("security_events")
        .insert({
          user_id: user.id,
          event_type: "ACCOUNT_DELETION_REQUESTED",
          metadata: { source: "account" },
        });
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;

      // O vínculo do usuário é removido por cascade, mas a conta de trabalho
      // não referencia auth.users. Remove apenas workspaces que ficaram sem
      // nenhum membro; contas compartilhadas permanecem intactas.
      for (const accountId of ownedAccountIds) {
        const { count, error: countError } = await admin
          .from("account_members")
          .select("user_id", { count: "exact", head: true })
          .eq("account_id", accountId);
        if (countError) throw countError;
        if (count === 0) {
          const { error: accountError } = await admin
            .from("accounts")
            .delete()
            .eq("id", accountId);
          if (accountError) throw accountError;
        }
      }
      res.json({ success: true, data: { deleted: true } });
    } catch (error) {
      console.error("[AfiliHub:Account] Falha ao excluir conta.", {
        userId: user.id,
        error: error instanceof Error ? error.message : "unknown",
      });
      res
        .status(500)
        .json({
          success: false,
          error: {
            code: "ACCOUNT_DELETION_FAILED",
            message: "Não foi possível excluir a conta.",
          },
        });
    }
  });
  return router;
}
