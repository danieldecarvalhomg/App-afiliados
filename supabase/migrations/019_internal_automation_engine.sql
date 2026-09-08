-- Automações internas persistentes. Substitui orquestração por webhooks/n8n.

CREATE TABLE IF NOT EXISTS public.internal_automation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'PRODUCT_CREATED','QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED'
  )),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 180),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','retry_wait','completed','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 4),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  last_error_code TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS internal_automation_jobs_claim_idx
  ON public.internal_automation_jobs(status, available_at, created_at)
  WHERE status IN ('pending','retry_wait','processing');

ALTER TABLE public.internal_automation_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS internal_automation_jobs_owner_read ON public.internal_automation_jobs;
CREATE POLICY internal_automation_jobs_owner_read ON public.internal_automation_jobs
  FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enqueue_internal_automation(
  p_user_id UUID, p_event_type TEXT, p_idempotency_key TEXT, p_payload JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_event_type NOT IN ('PRODUCT_CREATED','QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED')
    OR NULLIF(trim(p_idempotency_key), '') IS NULL OR char_length(p_idempotency_key) > 180
    OR jsonb_typeof(COALESCE(p_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INTERNAL_AUTOMATION_INPUT_INVALID';
  END IF;
  INSERT INTO public.internal_automation_jobs(user_id,event_type,idempotency_key,payload)
  VALUES(p_user_id,p_event_type,trim(p_idempotency_key),COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT(user_id,event_type,idempotency_key) DO UPDATE
    SET updated_at = public.internal_automation_jobs.updated_at
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_internal_automation(p_worker_id TEXT, p_stale_before TIMESTAMPTZ)
RETURNS SETOF public.internal_automation_jobs LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id FROM public.internal_automation_jobs
    WHERE (
      status IN ('pending','retry_wait') AND available_at <= NOW()
    ) OR (
      status = 'processing' AND locked_at < p_stale_before AND attempt_count < 4
    )
    ORDER BY available_at, created_at
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.internal_automation_jobs job
  SET status='processing', attempt_count=job.attempt_count+1, locked_at=NOW(), locked_by=p_worker_id,
      last_error_code=NULL, updated_at=NOW()
  FROM candidate WHERE job.id=candidate.id RETURNING job.*;
END $$;

CREATE OR REPLACE FUNCTION public.complete_internal_automation(
  p_job_id UUID, p_worker_id TEXT, p_level TEXT, p_message TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job public.internal_automation_jobs%ROWTYPE;
BEGIN
  UPDATE public.internal_automation_jobs SET status='completed', processed_at=NOW(), locked_at=NULL, locked_by=NULL,
    last_error_code=NULL, updated_at=NOW()
  WHERE id=p_job_id AND status='processing' AND locked_by=p_worker_id RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.system_logs(user_id,level,module,message,details)
  VALUES(v_job.user_id,p_level,'Automação interna',p_message,
    jsonb_build_object('jobId',v_job.id,'eventType',v_job.event_type,'attempt',v_job.attempt_count)::text);
  INSERT INTO public.system_events(user_id,event_type,payload)
  VALUES(v_job.user_id,'automation.internal.completed',jsonb_build_object(
    'job_id',v_job.id,'source_event',v_job.event_type,'attempt',v_job.attempt_count
  ));
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.fail_internal_automation(
  p_job_id UUID, p_worker_id TEXT, p_error_code TEXT, p_retry_at TIMESTAMPTZ
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job public.internal_automation_jobs%ROWTYPE;
BEGIN
  UPDATE public.internal_automation_jobs
  SET status=CASE WHEN p_retry_at IS NULL THEN 'failed' ELSE 'retry_wait' END,
      available_at=COALESCE(p_retry_at,available_at), locked_at=NULL, locked_by=NULL,
      last_error_code=left(COALESCE(p_error_code,'AUTOMATION_FAILED'),120), updated_at=NOW(),
      processed_at=CASE WHEN p_retry_at IS NULL THEN NOW() ELSE NULL END
  WHERE id=p_job_id AND status='processing' AND locked_by=p_worker_id RETURNING * INTO v_job;
  IF v_job.id IS NULL THEN RETURN FALSE; END IF;
  IF p_retry_at IS NULL THEN
    INSERT INTO public.system_logs(user_id,level,module,message,details)
    VALUES(v_job.user_id,'error','Automação interna','Uma automação interna falhou após todas as tentativas.',
      jsonb_build_object('jobId',v_job.id,'eventType',v_job.event_type,'errorCode',v_job.last_error_code)::text);
    INSERT INTO public.system_events(user_id,event_type,payload)
    VALUES(v_job.user_id,'automation.internal.failed',jsonb_build_object(
      'job_id',v_job.id,'source_event',v_job.event_type,'error_code',v_job.last_error_code
    ));
  END IF;
  RETURN TRUE;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_next_internal_automation(TEXT,TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_internal_automation(UUID,TEXT,TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_internal_automation(UUID,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_internal_automation(TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_internal_automation(UUID,TEXT,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_internal_automation(UUID,TEXT,TEXT,TIMESTAMPTZ) TO service_role;

ALTER TABLE public.captured_messages
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.captured_messages DROP CONSTRAINT IF EXISTS captured_messages_review_status_check;
ALTER TABLE public.captured_messages ADD CONSTRAINT captured_messages_review_status_check
  CHECK (review_status IN ('pending','approved','rejected'));
