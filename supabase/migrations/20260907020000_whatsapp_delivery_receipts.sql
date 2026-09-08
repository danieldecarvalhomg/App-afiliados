-- Analytics: receipts reais emitidos pela conexão WhatsApp Web.
-- O estado permanece na própria delivery (fonte operacional), sem tabela paralela.

ALTER TABLE public.queue_deliveries
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS receipt_tracking_started_at TIMESTAMPTZ;

ALTER TABLE public.queue_deliveries
  DROP CONSTRAINT IF EXISTS queue_deliveries_receipt_order_check,
  ADD CONSTRAINT queue_deliveries_receipt_order_check CHECK (
    read_at IS NULL OR delivered_at IS NULL OR read_at >= delivered_at
  );

CREATE INDEX IF NOT EXISTS queue_deliveries_user_delivered_idx
  ON public.queue_deliveries(user_id, delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_deliveries_user_read_idx
  ON public.queue_deliveries(user_id, read_at DESC)
  WHERE read_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.mark_whatsapp_receipt_tracking_started(
  p_user_id UUID,
  p_connection_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.whatsapp_connections
     SET receipt_tracking_started_at = COALESCE(receipt_tracking_started_at, NOW()),
         updated_at = NOW()
   WHERE id = p_connection_id
     AND user_id = p_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_whatsapp_delivery_receipt(
  p_user_id UUID,
  p_connection_id UUID,
  p_external_group_id TEXT,
  p_external_message_id TEXT,
  p_delivered_at TIMESTAMPTZ DEFAULT NULL,
  p_read_at TIMESTAMPTZ DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_id UUID;
  v_delivered_at TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NULL OR p_connection_id IS NULL
     OR NULLIF(BTRIM(p_external_group_id), '') IS NULL
     OR NULLIF(BTRIM(p_external_message_id), '') IS NULL
     OR (p_delivered_at IS NULL AND p_read_at IS NULL) THEN
    RETURN FALSE;
  END IF;

  -- Um read receipt prova que a mensagem foi entregue. Isso não estima o
  -- horário: quando o receipt de entrega não veio, usa o timestamp real de read.
  v_delivered_at := CASE
    WHEN p_delivered_at IS NOT NULL AND p_read_at IS NOT NULL
      THEN LEAST(p_delivered_at, p_read_at)
    ELSE COALESCE(p_delivered_at, p_read_at)
  END;

  SELECT d.id
    INTO v_delivery_id
    FROM public.queue_deliveries d
    JOIN public.whatsapp_groups g
      ON g.id = d.whatsapp_group_id
     AND g.user_id = d.user_id
     AND g.connection_id = d.connection_id
   WHERE d.user_id = p_user_id
     AND d.connection_id = p_connection_id
     AND g.external_group_id = p_external_group_id
     AND (
       d.external_message_id = p_external_message_id
       OR d.id::TEXT = p_external_message_id
     )
   LIMIT 1
   FOR UPDATE OF d;

  IF v_delivery_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.queue_deliveries
     SET delivered_at = CASE
           WHEN v_delivered_at IS NULL THEN delivered_at
           WHEN delivered_at IS NULL THEN v_delivered_at
           ELSE LEAST(delivered_at, v_delivered_at)
         END,
         read_at = CASE
           WHEN p_read_at IS NULL THEN read_at
           WHEN read_at IS NULL THEN p_read_at
           ELSE LEAST(read_at, p_read_at)
         END,
         updated_at = NOW()
   WHERE id = v_delivery_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_whatsapp_delivery_receipt(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_whatsapp_delivery_receipt(
  UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ
) TO service_role;

REVOKE ALL ON FUNCTION public.mark_whatsapp_receipt_tracking_started(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_whatsapp_receipt_tracking_started(UUID, UUID)
  TO service_role;
