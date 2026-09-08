-- Completa a transição claimed -> sending usada pelo worker de disparos.
-- A tentativa já é contabilizada em claim_next_queue_delivery.
CREATE OR REPLACE FUNCTION public.mark_dispatch_sending(
  p_delivery_id UUID,
  p_worker_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.queue_deliveries
  SET
    status = 'sending',
    sending_started_at = NOW(),
    updated_at = NOW()
  WHERE id = p_delivery_id
    AND claimed_by = p_worker_id
    AND status = 'claimed';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_dispatch_sending(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_dispatch_sending(UUID, TEXT)
  TO service_role;
