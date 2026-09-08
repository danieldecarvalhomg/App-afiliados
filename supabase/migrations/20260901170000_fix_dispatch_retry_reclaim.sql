-- Permite que entregas e itens que já começaram sejam novamente elegíveis
-- depois de uma solicitação explícita de retry.
CREATE OR REPLACE FUNCTION public.retry_dispatch_delivery(
  p_user_id UUID,
  p_delivery_id UUID,
  p_include_uncertain BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_item UUID;
BEGIN
  UPDATE public.queue_deliveries
  SET
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = NOW(),
    last_error_code = NULL,
    last_error_at = NULL,
    claimed_at = NULL,
    claimed_by = NULL,
    updated_at = NOW()
  WHERE id = p_delivery_id
    AND user_id = p_user_id
    AND (status = 'failed' OR (p_include_uncertain AND status = 'uncertain'))
  RETURNING id, queue_item_id INTO v_id, v_item;

  IF v_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.queue_items
  SET
    status = 'queued',
    started_at = NULL,
    completed_at = NULL,
    next_execution_at = NOW(),
    updated_at = NOW()
  WHERE id = v_item;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_dispatch_queue_item(
  p_user_id UUID,
  p_queue_item_id UUID,
  p_include_uncertain BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  UPDATE public.queue_items
  SET
    status = 'queued',
    started_at = NULL,
    completed_at = NULL,
    next_execution_at = NOW(),
    updated_at = NOW()
  WHERE id = p_queue_item_id
    AND user_id = p_user_id
    AND status IN ('failed', 'partially_failed')
  RETURNING id INTO v_id;

  UPDATE public.queue_deliveries
  SET
    status = 'pending',
    attempt_count = 0,
    next_attempt_at = NOW(),
    last_error_code = NULL,
    last_error_at = NULL,
    claimed_at = NULL,
    claimed_by = NULL,
    updated_at = NOW()
  WHERE queue_item_id = v_id
    AND (status = 'failed' OR (p_include_uncertain AND status = 'uncertain'));

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_dispatch_delivery(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.retry_dispatch_queue_item(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_dispatch_delivery(UUID, UUID, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.retry_dispatch_queue_item(UUID, UUID, BOOLEAN)
  TO service_role;
