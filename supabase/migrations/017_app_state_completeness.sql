-- Estado real usado pelo dashboard: automações e assinatura.

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  trigger_condition TEXT NOT NULL CHECK (char_length(trigger_condition) BETWEEN 1 AND 500),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'paused' CHECK (status IN ('active', 'paused')),
  trigger_count INTEGER NOT NULL DEFAULT 0 CHECK (trigger_count >= 0),
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_rules_user_status_idx
  ON public.automation_rules(user_id, status, created_at DESC);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS automation_rules_owner ON public.automation_rules;
CREATE POLICY automation_rules_owner ON public.automation_rules
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price_monthly >= 0),
  status TEXT NOT NULL CHECK (status IN ('ativo', 'pendente', 'cancelado')),
  renewal_date TIMESTAMPTZ,
  dispatch_limit INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_limit >= 0),
  dispatch_used INTEGER NOT NULL DEFAULT 0 CHECK (dispatch_used >= 0),
  channel_limit INTEGER NOT NULL DEFAULT 0 CHECK (channel_limit >= 0),
  channel_used INTEGER NOT NULL DEFAULT 0 CHECK (channel_used >= 0),
  ai_generation_limit INTEGER NOT NULL DEFAULT 0 CHECK (ai_generation_limit >= 0),
  ai_generation_used INTEGER NOT NULL DEFAULT 0 CHECK (ai_generation_used >= 0),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.subscriptions FROM authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
DROP POLICY IF EXISTS subscriptions_owner_read ON public.subscriptions;
CREATE POLICY subscriptions_owner_read ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());

