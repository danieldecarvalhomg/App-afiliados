-- Conversão afiliada é uma dependência, não uma falha transitória. A execução
-- fica estacionada sem consumir tentativas e é liberada pelo evento persistente.

ALTER TABLE public.automation_executions
  DROP CONSTRAINT IF EXISTS automation_executions_status_check;
ALTER TABLE public.automation_executions
  ADD CONSTRAINT automation_executions_status_check CHECK (status IN (
    'received','evaluating','matched','processing','awaiting_review','queued','completed',
    'ignored','failed','cancelled','waiting_dependency','retry_wait'
  ));

ALTER TABLE public.internal_automation_jobs
  DROP CONSTRAINT IF EXISTS internal_automation_jobs_event_type_check;
ALTER TABLE public.internal_automation_jobs
  ADD CONSTRAINT internal_automation_jobs_event_type_check CHECK(event_type IN(
    'PROMOTION_DETECTED','MARKETPLACE_DEAL','PRODUCT_CREATED','AFFILIATE_CONVERTED',
    'QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED'
  ));

CREATE OR REPLACE FUNCTION public.enqueue_internal_automation(
  p_user_id UUID,p_event_type TEXT,p_idempotency_key TEXT,p_payload JSONB
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF p_event_type NOT IN (
    'PROMOTION_DETECTED','MARKETPLACE_DEAL','PRODUCT_CREATED','AFFILIATE_CONVERTED',
    'QUEUE_ITEM_ADDED','OFFER_APPROVED','OFFER_REJECTED','DISPATCH_SENT','DISPATCH_FAILED'
  ) OR NULLIF(trim(p_idempotency_key),'') IS NULL OR char_length(p_idempotency_key)>180
    OR jsonb_typeof(COALESCE(p_payload,'{}'::jsonb))<>'object'
  THEN RAISE EXCEPTION 'INTERNAL_AUTOMATION_INPUT_INVALID'; END IF;
  INSERT INTO public.internal_automation_jobs(user_id,event_type,idempotency_key,payload)
  VALUES(p_user_id,p_event_type,trim(p_idempotency_key),COALESCE(p_payload,'{}'::jsonb))
  ON CONFLICT(user_id,event_type,idempotency_key) DO UPDATE
    SET updated_at=public.internal_automation_jobs.updated_at
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_internal_automation(UUID,TEXT,TEXT,JSONB) TO service_role;

-- Migra retentativas já abertas. Se o produto já estiver convertido, libera
-- imediatamente; caso contrário, estaciona até AFFILIATE_CONVERTED.
UPDATE public.automation_executions AS e
SET status='received',attempt_count=0,available_at=NOW(),completed_at=NULL,
    error_code=NULL,error_message_safe=NULL,locked_at=NULL,locked_by=NULL,updated_at=NOW()
WHERE e.status IN('retry_wait','failed')
  AND (
    e.error_code='AUTOMATION_AFFILIATE_PENDING'
    OR (
      e.error_code='AUTOMATION_PROCESSING_FAILED'
      AND EXISTS (
        SELECT 1 FROM public.automation_execution_steps AS wait_step
        WHERE wait_step.execution_id=e.id
          AND wait_step.step_type='affiliate_wait'
          AND wait_step.facts->>'waitingFor'='affiliate_conversion'
      )
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.automation_execution_steps AS s
    JOIN public.products AS p ON p.id::TEXT=s.facts->>'productId' AND p.user_id=e.user_id
    WHERE s.execution_id=e.id AND p.affiliate_status='converted' AND NULLIF(p.affiliate_url,'') IS NOT NULL
  );

UPDATE public.automation_executions AS e
SET status='waiting_dependency',attempt_count=0,completed_at=NULL,
    locked_at=NULL,locked_by=NULL,updated_at=NOW()
WHERE e.status IN('retry_wait','failed')
  AND (
    e.error_code='AUTOMATION_AFFILIATE_PENDING'
    OR (
      e.error_code='AUTOMATION_PROCESSING_FAILED'
      AND EXISTS (
        SELECT 1 FROM public.automation_execution_steps AS wait_step
        WHERE wait_step.execution_id=e.id
          AND wait_step.step_type='affiliate_wait'
          AND wait_step.facts->>'waitingFor'='affiliate_conversion'
      )
    )
  );
