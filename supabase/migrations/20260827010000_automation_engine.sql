-- Automation Engine V1: evolução incremental de automation_rules.

ALTER TABLE public.automation_rules DROP CONSTRAINT IF EXISTS automation_rules_status_check;
ALTER TABLE public.automation_rules
  ALTER COLUMN status SET DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'PRODUCT_CREATED',
  ADD COLUMN IF NOT EXISTS trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS condition_mode TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS preparation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS action_type TEXT NOT NULL DEFAULT 'PRODUCT_ONLY',
  ADD COLUMN IF NOT EXISTS action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evaluation_order INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_after_match BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS safety_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code TEXT;
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_status_check
  CHECK (status IN ('draft','active','paused','error','archived'));
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_condition_mode_check
  CHECK (condition_mode IN ('all','any'));
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_trigger_type_check
  CHECK (trigger_type IN ('PROMOTION_DETECTED','MARKETPLACE_DEAL','PRODUCT_CREATED'));
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_action_type_check
  CHECK (action_type IN ('QUEUE_AUTOMATICALLY','REVIEW_FIRST','PRODUCT_ONLY'));
ALTER TABLE public.automation_rules ADD CONSTRAINT automation_rules_json_check
  CHECK (jsonb_typeof(trigger_config)='object' AND jsonb_typeof(conditions)='array'
    AND jsonb_typeof(preparation_config)='object' AND jsonb_typeof(action_config)='object');
-- Regras legadas não possuem configuração versionada segura; permanecem inertes até serem editadas/ativadas.
UPDATE public.automation_rules SET status='draft' WHERE status IN ('active','paused') AND conditions='[]'::jsonb;

CREATE INDEX IF NOT EXISTS automation_rules_evaluation_idx
  ON public.automation_rules(user_id,status,trigger_type,evaluation_order,id);

CREATE TABLE IF NOT EXISTS public.automation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  configuration_snapshot JSONB NOT NULL CHECK (jsonb_typeof(configuration_snapshot)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(automation_id,version)
);

CREATE TABLE IF NOT EXISTS public.automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  automation_version_id UUID NOT NULL REFERENCES public.automation_versions(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_reference_id TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(event_payload)='object'),
  origin TEXT NOT NULL DEFAULT 'domain',
  causation_id TEXT,
  evaluation_order INTEGER NOT NULL DEFAULT 0,
  stop_after_match BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received','evaluating','matched','processing','awaiting_review','queued','completed',
    'ignored','failed','cancelled','retry_wait'
  )),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message_safe TEXT,
  prepared_snapshot_id UUID,
  queue_item_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(automation_id,automation_version_id,source_type,source_reference_id)
);
CREATE INDEX IF NOT EXISTS automation_executions_claim_idx
  ON public.automation_executions(status,available_at,created_at)
  WHERE status IN ('received','retry_wait','processing');
CREATE INDEX IF NOT EXISTS automation_executions_history_idx
  ON public.automation_executions(user_id,automation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.automation_prepared_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  snapshot_version INTEGER NOT NULL DEFAULT 1,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source_type TEXT NOT NULL,
  source_reference_id TEXT,
  final_text TEXT NOT NULL CHECK (char_length(final_text) BETWEEN 1 AND 4096),
  primary_media_asset_id UUID REFERENCES public.product_media_assets(id) ON DELETE SET NULL,
  affiliate_url TEXT,
  template_id UUID REFERENCES public.cta_templates(id) ON DELETE SET NULL,
  template_version INTEGER,
  cta_generation_id UUID REFERENCES public.cta_history(id) ON DELETE RESTRICT,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  UNIQUE(execution_id,snapshot_version)
);
ALTER TABLE public.automation_executions DROP CONSTRAINT IF EXISTS automation_executions_prepared_snapshot_id_fkey;
ALTER TABLE public.automation_executions ADD CONSTRAINT automation_executions_prepared_snapshot_id_fkey
  FOREIGN KEY(prepared_snapshot_id) REFERENCES public.automation_prepared_snapshots(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.automation_execution_steps (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed','failed','skipped','completed')),
  facts JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(facts)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_execution_steps_idx ON public.automation_execution_steps(execution_id,id);

CREATE TABLE IF NOT EXISTS public.automation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  automation_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  execution_id UUID NOT NULL UNIQUE REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  prepared_snapshot_id UUID NOT NULL REFERENCES public.automation_prepared_snapshots(id) ON DELETE RESTRICT,
  planned_queue_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS automation_reviews_inbox_idx ON public.automation_reviews(user_id,status,created_at DESC);

ALTER TABLE public.automation_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_prepared_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS automation_versions_owner ON public.automation_versions;
CREATE POLICY automation_versions_owner ON public.automation_versions FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS automation_executions_owner ON public.automation_executions;
CREATE POLICY automation_executions_owner ON public.automation_executions FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS automation_snapshots_owner ON public.automation_prepared_snapshots;
CREATE POLICY automation_snapshots_owner ON public.automation_prepared_snapshots FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS automation_steps_owner ON public.automation_execution_steps;
CREATE POLICY automation_steps_owner ON public.automation_execution_steps FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS automation_reviews_owner ON public.automation_reviews;
CREATE POLICY automation_reviews_owner ON public.automation_reviews FOR SELECT USING(user_id=auth.uid());

REVOKE INSERT,UPDATE,DELETE ON public.automation_versions,public.automation_executions,
  public.automation_prepared_snapshots,public.automation_execution_steps,public.automation_reviews FROM authenticated;

CREATE OR REPLACE FUNCTION public.claim_next_automation_execution(p_worker_id TEXT,p_stale_before TIMESTAMPTZ)
RETURNS SETOF public.automation_executions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN QUERY WITH candidate AS (
    SELECT id FROM public.automation_executions
    WHERE (status IN ('received','retry_wait') AND available_at<=NOW() AND attempt_count<3)
       OR (status='processing' AND locked_at<p_stale_before AND attempt_count<3)
    ORDER BY created_at,evaluation_order FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE public.automation_executions e SET status='processing',attempt_count=e.attempt_count+1,
    locked_at=NOW(),locked_by=p_worker_id,started_at=COALESCE(e.started_at,NOW()),updated_at=NOW(),error_code=NULL
    FROM candidate WHERE e.id=candidate.id RETURNING e.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_automation_execution(TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_automation_execution(TEXT,TIMESTAMPTZ) TO service_role;

-- Eventos configuráveis passam pela fila interna existente.
ALTER TABLE public.internal_automation_jobs DROP CONSTRAINT IF EXISTS internal_automation_jobs_event_type_check;
ALTER TABLE public.internal_automation_jobs ADD CONSTRAINT internal_automation_jobs_event_type_check CHECK(event_type IN(
  'PROMOTION_DETECTED','MARKETPLACE_DEAL','PRODUCT_CREATED','QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED'
));
CREATE OR REPLACE FUNCTION public.enqueue_internal_automation(
  p_user_id UUID,p_event_type TEXT,p_idempotency_key TEXT,p_payload JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_event_type NOT IN ('PROMOTION_DETECTED','MARKETPLACE_DEAL','PRODUCT_CREATED','QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED')
    OR NULLIF(trim(p_idempotency_key),'') IS NULL OR char_length(p_idempotency_key)>180
    OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'INTERNAL_AUTOMATION_INPUT_INVALID'; END IF;
  INSERT INTO public.internal_automation_jobs(user_id,event_type,idempotency_key,payload)
  VALUES(p_user_id,p_event_type,trim(p_idempotency_key),COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT(user_id,event_type,idempotency_key) DO UPDATE SET updated_at=public.internal_automation_jobs.updated_at
  RETURNING id INTO v_id; RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) TO service_role;
