-- Uma queda entre claim e send devolve a entrega sem consumir retry.
CREATE OR REPLACE FUNCTION public.defer_disconnected_delivery(p_delivery_id UUID,p_worker_id TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_connection UUID;v_item UUID;
BEGIN
  UPDATE public.queue_deliveries SET status='pending',attempt_count=GREATEST(attempt_count-1,0),next_attempt_at=NOW()+INTERVAL '15 seconds',claimed_at=NULL,claimed_by=NULL,updated_at=NOW()
  WHERE id=p_delivery_id AND claimed_by=p_worker_id AND status='claimed' RETURNING connection_id,queue_item_id INTO v_connection,v_item;
  IF v_connection IS NULL THEN RETURN;END IF;
  UPDATE public.whatsapp_dispatch_state SET processing_delivery_id=NULL,processing_queue_item_id=v_item,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE connection_id=v_connection AND processing_delivery_id=p_delivery_id;
  PERFORM public.refresh_queue_item_status(v_item);
END $$;
REVOKE ALL ON FUNCTION public.defer_disconnected_delivery(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defer_disconnected_delivery(UUID,TEXT) TO service_role;
