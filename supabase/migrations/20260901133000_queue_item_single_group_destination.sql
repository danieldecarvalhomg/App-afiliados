-- Permite que um item use a cadência de uma campanha, mas seja entregue
-- somente a um grupo específico pertencente a ela.
CREATE OR REPLACE FUNCTION public.enqueue_dispatch_queue_item_for_group(
  p_user_id UUID,
  p_campaign_id UUID,
  p_source_type TEXT,
  p_source_reference_id UUID,
  p_snapshot JSONB,
  p_scheduled_at TIMESTAMPTZ,
  p_idempotency_key TEXT,
  p_placement TEXT,
  p_whatsapp_group_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
DECLARE
  v_id UUID;
  c public.campaigns%ROWTYPE;
  v_position INT;
  v_destinations JSONB;
  v_config JSONB;
BEGIN
  SELECT * INTO c
  FROM public.campaigns
  WHERE id=p_campaign_id
    AND user_id=p_user_id
    AND status NOT IN('cancelled','archived','completed')
  FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_QUEUEABLE'; END IF;

  SELECT id INTO v_id
  FROM public.queue_items
  WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  IF jsonb_typeof(p_snapshot)<>'object'
    OR (COALESCE(BTRIM(p_snapshot->>'text'),'')=''
      AND NULLIF(p_snapshot->>'primaryMediaAssetId','') IS NULL)
  THEN
    RAISE EXCEPTION 'QUEUE_CONTENT_EMPTY';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'whatsappGroupId',g.id,
        'name',g.name,
        'externalGroupId',g.external_group_id
      ) ORDER BY d.created_at
    ),
    '[]'::JSONB
  ) INTO v_destinations
  FROM public.campaign_destinations d
  JOIN public.whatsapp_groups g ON g.id=d.whatsapp_group_id
  WHERE d.campaign_id=c.id
    AND g.id=p_whatsapp_group_id
    AND g.user_id=p_user_id
    AND g.connection_id=c.connection_id
    AND g.sync_status='active';

  IF jsonb_array_length(v_destinations)=0 THEN
    RAISE EXCEPTION 'QUEUE_GROUP_NOT_IN_CAMPAIGN';
  END IF;

  v_config=jsonb_build_object(
    'mode',c.mode,
    'intervalBetweenItemsSeconds',c.interval_between_items_seconds,
    'timezone',c.timezone,
    'allowedStartTime',c.allowed_start_time,
    'allowedEndTime',c.allowed_end_time,
    'allowedDays',c.allowed_days,
    'fixedSlots',c.fixed_slots
  );

  IF p_placement='next' THEN
    SELECT COALESCE(MIN(position),1) INTO v_position
    FROM public.queue_items
    WHERE campaign_id=c.id
      AND status NOT IN('completed','partially_failed','failed','cancelled')
      AND started_at IS NULL;
    UPDATE public.queue_items
    SET position=position+1
    WHERE campaign_id=c.id
      AND position>=v_position
      AND status NOT IN('completed','partially_failed','failed','cancelled')
      AND started_at IS NULL;
  ELSE
    SELECT COALESCE(MAX(position),0)+1 INTO v_position
    FROM public.queue_items
    WHERE campaign_id=c.id;
  END IF;

  INSERT INTO public.queue_items(
    user_id,campaign_id,source_type,source_reference_id,content_snapshot,
    destination_snapshot,queue_config_snapshot,position,scheduled_at,
    next_execution_at,status,idempotency_key,product_id,product_title,
    copy_text,affiliate_url,scheduled_for,updated_at
  ) VALUES (
    p_user_id,c.id,p_source_type,p_source_reference_id,p_snapshot,
    v_destinations,v_config,v_position,p_scheduled_at,
    CASE WHEN c.mode='manual' THEN NULL ELSE p_scheduled_at END,
    CASE WHEN c.mode='manual' OR p_scheduled_at<=NOW() THEN 'queued' ELSE 'scheduled' END,
    p_idempotency_key,NULLIF(p_snapshot->>'productId','')::UUID,
    p_snapshot->>'productTitle',COALESCE(p_snapshot->>'text',''),
    COALESCE(p_snapshot->>'affiliateUrl',''),p_scheduled_at,NOW()
  ) RETURNING id INTO v_id;

  INSERT INTO public.queue_deliveries(
    user_id,queue_item_id,campaign_id,connection_id,whatsapp_group_id,
    status,scheduled_at,next_attempt_at
  )
  SELECT
    p_user_id,v_id,c.id,c.connection_id,(x->>'whatsappGroupId')::UUID,
    CASE WHEN c.mode<>'manual' AND p_scheduled_at>NOW()
      THEN 'scheduled' ELSE 'pending' END,
    p_scheduled_at,p_scheduled_at
  FROM jsonb_array_elements(v_destinations) x;

  PERFORM public.recalculate_dispatch_queue(c.id,NOW());
  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_id
    FROM public.queue_items
    WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;
    RETURN v_id;
END
$$;

REVOKE ALL ON FUNCTION public.enqueue_dispatch_queue_item_for_group(
  UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT,TEXT,UUID
) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_dispatch_queue_item_for_group(
  UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT,TEXT,UUID
) TO service_role;
