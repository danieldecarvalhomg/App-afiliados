import { supabase } from "../lib/supabase";
import type { SelfServicePlanCode } from "../domain/subscription/plans";

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) throw new Error("Usuário não autenticado.");
  return data.session.access_token;
}

export async function changeSubscriptionPlan(planCode: SelfServicePlanCode) {
  const response = await fetch("/api/account/subscription", {
    method: "POST",
    headers: {
      authorization: `Bearer ${await accessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ planCode }),
  });
  const payload = await response.json() as {
    success: boolean;
    data?: { planCode: SelfServicePlanCode; unchanged: boolean };
    error?: { message?: string };
  };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.error?.message ?? "Não foi possível alterar o plano.");
  }
  return payload.data;
}

export async function deleteAccount() {
  const response = await fetch("/api/account", {
    method: "DELETE",
    headers: { authorization: `Bearer ${await accessToken()}` },
  });
  if (!response.ok) throw new Error("ACCOUNT_DELETION_FAILED");
}
