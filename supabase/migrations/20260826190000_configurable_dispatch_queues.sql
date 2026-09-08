-- Filas configuráveis: evolução incremental do Dispatch Engine existente.
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'continuous',
  ADD COLUMN IF NOT EXISTS interval_between_items_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS allowed_start_time TIME NOT NULL DEFAULT '00:00',
  ADD COLUMN IF NOT EXISTS allowed_end_time TIME NOT NULL DEFAULT '23:59',
  ADD COLUMN IF NOT EXISTS allowed_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::SMALLINT[],
  ADD COLUMN IF NOT EXISTS fixed_slots TIME[] NOT NULL DEFAULT ARRAY[]::TIME[],
  ADD COLUMN IF NOT EXISTS last_item_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_dispatched_at TIMESTAMPTZ;
UPDATE public.campaigns SET interval_between_items_seconds=default_interval_seconds WHERE interval_between_items_seconds=30 AND default_interval_seconds<>30;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK(status IN('draft','active','pause_requested','paused','completed','cancelled','archived'));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_queue_mode_check CHECK(mode IN('continuous','fixed_slots','manual'));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_queue_interval_check CHECK(interval_between_items_seconds BETWEEN 1 AND 86400);
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_queue_window_check CHECK(allowed_start_time<allowed_end_time);
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_queue_days_check CHECK(cardinality(allowed_days)>0 AND allowed_days<@ARRAY[1,2,3,4,5,6,7]::SMALLINT[]);
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_queue_slots_check CHECK(mode<>'fixed_slots' OR cardinality(fixed_slots)>0);

ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS next_execution_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS destination_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS queue_config_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS manual_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
WITH ranked AS (SELECT id,ROW_NUMBER() OVER(PARTITION BY campaign_id ORDER BY created_at,id)::INTEGER AS value FROM public.queue_items WHERE campaign_id IS NOT NULL)
UPDATE public.queue_items q SET position=ranked.value FROM ranked WHERE q.id=ranked.id AND q.position IS NULL;
UPDATE public.queue_items SET position=COALESCE(position,1),next_execution_at=CASE WHEN status IN('completed','partially_failed','failed','cancelled') THEN NULL ELSE scheduled_at END WHERE campaign_id IS NOT NULL;
ALTER TABLE public.queue_items ALTER COLUMN position SET DEFAULT 1;
CREATE INDEX IF NOT EXISTS queue_items_queue_position_idx ON public.queue_items(campaign_id,position) WHERE status NOT IN('completed','partially_failed','failed','cancelled');
CREATE INDEX IF NOT EXISTS queue_items_next_execution_idx ON public.queue_items(next_execution_at,campaign_id) WHERE status IN('scheduled','queued','sending');
ALTER TABLE public.whatsapp_dispatch_state ADD COLUMN IF NOT EXISTS processing_queue_item_id UUID REFERENCES public.queue_items(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.dispatch_next_eligible(p_campaign_id UUID,p_cursor TIMESTAMPTZ) RETURNS TIMESTAMPTZ LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE c public.campaigns%ROWTYPE;v_local TIMESTAMP;v_day DATE;v_candidate TIMESTAMPTZ;v_slot TIME;v_offset INT;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id;
  IF c.id IS NULL OR c.mode='manual' THEN RETURN NULL;END IF;
  v_local=p_cursor AT TIME ZONE c.timezone;
  FOR v_offset IN 0..370 LOOP
    v_day=v_local::DATE+v_offset;
    IF EXTRACT(ISODOW FROM v_day)::INT=ANY(c.allowed_days) THEN
      IF c.mode='continuous' THEN
        v_candidate=(v_day+c.allowed_start_time) AT TIME ZONE c.timezone;
        IF v_offset=0 THEN v_candidate=GREATEST(v_candidate,p_cursor);END IF;
        IF v_candidate<=((v_day+c.allowed_end_time) AT TIME ZONE c.timezone) THEN RETURN v_candidate;END IF;
      ELSE
        FOREACH v_slot IN ARRAY c.fixed_slots LOOP
          IF v_slot>=c.allowed_start_time AND v_slot<=c.allowed_end_time THEN
            v_candidate=(v_day+v_slot) AT TIME ZONE c.timezone;
            IF v_candidate>=p_cursor THEN RETURN v_candidate;END IF;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'QUEUE_SCHEDULE_UNAVAILABLE';
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_dispatch_queue(p_campaign_id UUID,p_now TIMESTAMPTZ DEFAULT NOW()) RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
DECLARE c public.campaigns%ROWTYPE;q RECORD;v_cursor TIMESTAMPTZ;v_next TIMESTAMPTZ;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id FOR UPDATE;IF c.id IS NULL THEN RETURN;END IF;
  IF c.status NOT IN('active','draft') THEN UPDATE public.queue_items SET next_execution_at=NULL,updated_at=NOW() WHERE campaign_id=c.id AND started_at IS NULL AND status IN('queued','scheduled');RETURN;END IF;
  v_cursor=GREATEST(p_now,COALESCE(c.last_item_completed_at+make_interval(secs=>c.interval_between_items_seconds),p_now));
  FOR q IN SELECT id,manual_requested_at FROM public.queue_items WHERE campaign_id=c.id AND started_at IS NULL AND status IN('queued','scheduled','paused') ORDER BY position,id FOR UPDATE LOOP
    IF c.mode='manual' THEN v_next=CASE WHEN q.manual_requested_at IS NOT NULL THEN GREATEST(q.manual_requested_at,p_now) ELSE NULL END;
    ELSE v_next=public.dispatch_next_eligible(c.id,v_cursor);v_cursor=v_next+make_interval(secs=>c.interval_between_items_seconds);END IF;
    UPDATE public.queue_items SET next_execution_at=v_next,scheduled_at=COALESCE(v_next,scheduled_at),scheduled_for=COALESCE(v_next,scheduled_for),status=CASE WHEN v_next IS NULL OR v_next<=p_now THEN 'queued' ELSE 'scheduled' END,updated_at=NOW() WHERE id=q.id;
    UPDATE public.queue_deliveries SET scheduled_at=COALESCE(v_next,scheduled_at),next_attempt_at=CASE WHEN status IN('pending','scheduled') THEN COALESCE(v_next,next_attempt_at) ELSE next_attempt_at END,status=CASE WHEN status IN('pending','scheduled') THEN CASE WHEN v_next IS NOT NULL AND v_next>p_now THEN 'scheduled' ELSE 'pending' END ELSE status END,updated_at=NOW() WHERE queue_item_id=q.id;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_queue_item_status(p_item_id UUID) RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_total INT;v_sent INT;v_active INT;v_waiting INT;v_failed INT;v_status TEXT;v_current TEXT;v_campaign UUID;v_was_terminal BOOLEAN;
BEGIN
  SELECT status,campaign_id,status IN('completed','partially_failed','failed','cancelled') INTO v_current,v_campaign,v_was_terminal FROM public.queue_items WHERE id=p_item_id FOR UPDATE;IF v_current IN('paused','cancelled') THEN RETURN;END IF;
  SELECT COUNT(*),COUNT(*)FILTER(WHERE status='sent'),COUNT(*)FILTER(WHERE status IN('claimed','sending')),COUNT(*)FILTER(WHERE status IN('pending','scheduled','retry_wait')),COUNT(*)FILTER(WHERE status IN('failed','uncertain')) INTO v_total,v_sent,v_active,v_waiting,v_failed FROM public.queue_deliveries WHERE queue_item_id=p_item_id;
  v_status=CASE WHEN v_total>0 AND v_sent=v_total THEN 'completed' WHEN v_active>0 THEN 'sending' WHEN v_waiting>0 THEN CASE WHEN EXISTS(SELECT 1 FROM public.queue_items WHERE id=p_item_id AND next_execution_at>NOW()) THEN 'scheduled' ELSE 'queued' END WHEN v_failed>0 AND v_sent>0 THEN 'partially_failed' WHEN v_failed>0 THEN 'failed' ELSE 'queued' END;
  UPDATE public.queue_items SET status=v_status,started_at=CASE WHEN v_status='sending' THEN COALESCE(started_at,NOW()) ELSE started_at END,completed_at=CASE WHEN v_status IN('completed','partially_failed','failed') THEN COALESCE(completed_at,NOW()) ELSE completed_at END,next_execution_at=CASE WHEN v_status IN('completed','partially_failed','failed') THEN NULL ELSE next_execution_at END,updated_at=NOW() WHERE id=p_item_id;
  IF NOT v_was_terminal AND v_status IN('completed','partially_failed','failed') THEN
    UPDATE public.campaigns SET last_item_completed_at=NOW(),last_dispatched_at=NOW(),status=CASE WHEN status='pause_requested' THEN 'paused' ELSE status END,updated_at=NOW() WHERE id=v_campaign;
    PERFORM public.recalculate_dispatch_queue(v_campaign,NOW());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.create_dispatch_queue(p_user_id UUID,p_name TEXT,p_connection_id UUID,p_group_ids UUID[],p_interval_seconds INTEGER,p_timezone TEXT,p_mode TEXT,p_allowed_start_time TIME,p_allowed_end_time TIME,p_allowed_days SMALLINT[],p_fixed_slots TIME[]) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE id=p_connection_id AND user_id=p_user_id) THEN RAISE EXCEPTION 'CAMPAIGN_CONNECTION_FORBIDDEN';END IF;
  IF COALESCE(cardinality(p_group_ids),0)=0 OR EXISTS(SELECT 1 FROM unnest(p_group_ids) x(id) WHERE NOT EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.id=x.id AND g.user_id=p_user_id AND g.connection_id=p_connection_id AND g.sync_status='active')) THEN RAISE EXCEPTION 'CAMPAIGN_GROUP_FORBIDDEN';END IF;
  INSERT INTO public.campaigns(user_id,name,connection_id,status,default_interval_seconds,interval_between_items_seconds,timezone,mode,allowed_start_time,allowed_end_time,allowed_days,fixed_slots,updated_at)
  VALUES(p_user_id,BTRIM(p_name),p_connection_id,'active',p_interval_seconds,p_interval_seconds,p_timezone,p_mode,p_allowed_start_time,p_allowed_end_time,p_allowed_days,p_fixed_slots,NOW()) RETURNING id INTO v_id;
  INSERT INTO public.campaign_destinations(user_id,campaign_id,whatsapp_group_id) SELECT p_user_id,v_id,id FROM(SELECT DISTINCT unnest(p_group_ids) id)s;
  INSERT INTO public.whatsapp_dispatch_state(connection_id,user_id) VALUES(p_connection_id,p_user_id) ON CONFLICT(connection_id) DO NOTHING;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_dispatch_queue(p_user_id UUID,p_campaign_id UUID,p_name TEXT,p_connection_id UUID,p_group_ids UUID[],p_interval_seconds INTEGER,p_timezone TEXT,p_mode TEXT,p_allowed_start_time TIME,p_allowed_end_time TIME,p_allowed_days SMALLINT[],p_fixed_slots TIME[]) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.campaigns%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id AND user_id=p_user_id FOR UPDATE;IF c.id IS NULL THEN RETURN NULL;END IF;
  IF c.status IN('cancelled','archived') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_EDITABLE';END IF;
  IF p_connection_id<>c.connection_id AND EXISTS(SELECT 1 FROM public.queue_items WHERE campaign_id=c.id AND status NOT IN('completed','partially_failed','failed','cancelled')) THEN RAISE EXCEPTION 'QUEUE_CONNECTION_HAS_ACTIVE_ITEMS';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE id=p_connection_id AND user_id=p_user_id) OR EXISTS(SELECT 1 FROM unnest(p_group_ids) x(id) WHERE NOT EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.id=x.id AND g.user_id=p_user_id AND g.connection_id=p_connection_id AND g.sync_status='active')) THEN RAISE EXCEPTION 'CAMPAIGN_GROUP_FORBIDDEN';END IF;
  UPDATE public.campaigns SET name=BTRIM(p_name),connection_id=p_connection_id,default_interval_seconds=p_interval_seconds,interval_between_items_seconds=p_interval_seconds,timezone=p_timezone,mode=p_mode,allowed_start_time=p_allowed_start_time,allowed_end_time=p_allowed_end_time,allowed_days=p_allowed_days,fixed_slots=p_fixed_slots,updated_at=NOW() WHERE id=c.id;
  DELETE FROM public.campaign_destinations WHERE campaign_id=c.id;INSERT INTO public.campaign_destinations(user_id,campaign_id,whatsapp_group_id) SELECT p_user_id,c.id,id FROM(SELECT DISTINCT unnest(p_group_ids) id)s;
  INSERT INTO public.whatsapp_dispatch_state(connection_id,user_id) VALUES(p_connection_id,p_user_id) ON CONFLICT(connection_id) DO NOTHING;PERFORM public.recalculate_dispatch_queue(c.id,NOW());RETURN c.id;
END $$;

CREATE OR REPLACE FUNCTION public.set_dispatch_campaign_status(p_user_id UUID,p_campaign_id UUID,p_status TEXT) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;v_current UUID;
BEGIN
  IF p_status NOT IN('active','paused','cancelled','archived') THEN RAISE EXCEPTION 'CAMPAIGN_STATUS_INVALID';END IF;
  SELECT q.id INTO v_current FROM public.queue_items q WHERE q.campaign_id=p_campaign_id AND q.started_at IS NOT NULL AND q.status IN('sending','queued','scheduled') ORDER BY q.position LIMIT 1;
  UPDATE public.campaigns SET status=CASE WHEN p_status='paused' AND v_current IS NOT NULL THEN 'pause_requested' ELSE p_status END,updated_at=NOW() WHERE id=p_campaign_id AND user_id=p_user_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL;END IF;
  IF p_status IN('cancelled','archived') THEN UPDATE public.queue_items SET status='cancelled',next_execution_at=NULL,updated_at=NOW() WHERE campaign_id=v_id AND started_at IS NULL AND status NOT IN('completed','partially_failed','failed','cancelled');UPDATE public.queue_deliveries SET status='cancelled',updated_at=NOW() WHERE campaign_id=v_id AND status IN('pending','scheduled','retry_wait');END IF;
  IF p_status='active' THEN PERFORM public.recalculate_dispatch_queue(v_id,NOW());ELSIF p_status='paused' AND v_current IS NULL THEN PERFORM public.recalculate_dispatch_queue(v_id,NOW());END IF;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_dispatch_queue_item(p_user_id UUID,p_campaign_id UUID,p_source_type TEXT,p_source_reference_id UUID,p_snapshot JSONB,p_scheduled_at TIMESTAMPTZ,p_idempotency_key TEXT,p_placement TEXT DEFAULT 'end') RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;c public.campaigns%ROWTYPE;v_position INT;v_destinations JSONB;v_config JSONB;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id AND user_id=p_user_id AND status NOT IN('cancelled','archived','completed') FOR UPDATE;IF c.id IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_QUEUEABLE';END IF;
  SELECT id INTO v_id FROM public.queue_items WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;IF v_id IS NOT NULL THEN RETURN v_id;END IF;
  IF jsonb_typeof(p_snapshot)<>'object' OR (COALESCE(BTRIM(p_snapshot->>'text'),'')='' AND NULLIF(p_snapshot->>'primaryMediaAssetId','') IS NULL) THEN RAISE EXCEPTION 'QUEUE_CONTENT_EMPTY';END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('whatsappGroupId',g.id,'name',g.name,'externalGroupId',g.external_group_id) ORDER BY d.created_at),'[]'::JSONB) INTO v_destinations FROM public.campaign_destinations d JOIN public.whatsapp_groups g ON g.id=d.whatsapp_group_id WHERE d.campaign_id=c.id;
  IF jsonb_array_length(v_destinations)=0 THEN RAISE EXCEPTION 'CAMPAIGN_DESTINATIONS_REQUIRED';END IF;
  v_config=jsonb_build_object('mode',c.mode,'intervalBetweenItemsSeconds',c.interval_between_items_seconds,'timezone',c.timezone,'allowedStartTime',c.allowed_start_time,'allowedEndTime',c.allowed_end_time,'allowedDays',c.allowed_days,'fixedSlots',c.fixed_slots);
  IF p_placement='next' THEN SELECT COALESCE(MIN(position),1) INTO v_position FROM public.queue_items WHERE campaign_id=c.id AND status NOT IN('completed','partially_failed','failed','cancelled') AND started_at IS NULL;UPDATE public.queue_items SET position=position+1 WHERE campaign_id=c.id AND position>=v_position AND status NOT IN('completed','partially_failed','failed','cancelled') AND started_at IS NULL;
  ELSE SELECT COALESCE(MAX(position),0)+1 INTO v_position FROM public.queue_items WHERE campaign_id=c.id;END IF;
  INSERT INTO public.queue_items(user_id,campaign_id,source_type,source_reference_id,content_snapshot,destination_snapshot,queue_config_snapshot,position,scheduled_at,next_execution_at,status,idempotency_key,product_id,product_title,copy_text,affiliate_url,scheduled_for,updated_at)
  VALUES(p_user_id,c.id,p_source_type,p_source_reference_id,p_snapshot,v_destinations,v_config,v_position,p_scheduled_at,CASE WHEN c.mode='manual' THEN NULL ELSE p_scheduled_at END,CASE WHEN c.mode='manual' OR p_scheduled_at<=NOW() THEN 'queued' ELSE 'scheduled' END,p_idempotency_key,NULLIF(p_snapshot->>'productId','')::UUID,p_snapshot->>'productTitle',COALESCE(p_snapshot->>'text',''),COALESCE(p_snapshot->>'affiliateUrl',''),p_scheduled_at,NOW()) RETURNING id INTO v_id;
  INSERT INTO public.queue_deliveries(user_id,queue_item_id,campaign_id,connection_id,whatsapp_group_id,status,scheduled_at,next_attempt_at) SELECT p_user_id,v_id,c.id,c.connection_id,(x->>'whatsappGroupId')::UUID,CASE WHEN c.mode<>'manual' AND p_scheduled_at>NOW() THEN 'scheduled' ELSE 'pending' END,p_scheduled_at,p_scheduled_at FROM jsonb_array_elements(v_destinations)x;
  PERFORM public.recalculate_dispatch_queue(c.id,NOW());RETURN v_id;
EXCEPTION WHEN unique_violation THEN SELECT id INTO v_id FROM public.queue_items WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;RETURN v_id;END $$;

CREATE OR REPLACE FUNCTION public.reorder_dispatch_queue_items(p_user_id UUID,p_campaign_id UUID,p_item_ids UUID[]) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.campaigns WHERE id=p_campaign_id AND user_id=p_user_id) THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';END IF;
  IF cardinality(p_item_ids)<>(SELECT COUNT(*) FROM public.queue_items WHERE campaign_id=p_campaign_id AND user_id=p_user_id AND started_at IS NULL AND status NOT IN('completed','partially_failed','failed','cancelled')) OR EXISTS(SELECT 1 FROM unnest(p_item_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.queue_items q WHERE q.id=id AND q.campaign_id=p_campaign_id AND q.user_id=p_user_id AND q.started_at IS NULL AND q.status NOT IN('completed','partially_failed','failed','cancelled'))) THEN RAISE EXCEPTION 'QUEUE_ORDER_INVALID';END IF;
  UPDATE public.queue_items q SET position=x.ordinality,updated_at=NOW() FROM unnest(p_item_ids) WITH ORDINALITY x(id,ordinality) WHERE q.id=x.id;PERFORM public.recalculate_dispatch_queue(p_campaign_id,NOW());
END $$;

CREATE OR REPLACE FUNCTION public.request_dispatch_queue_next(p_user_id UUID,p_campaign_id UUID) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.campaigns WHERE id=p_campaign_id AND user_id=p_user_id AND mode='manual' AND status='active') THEN RAISE EXCEPTION 'QUEUE_MANUAL_REQUIRED';END IF;
  SELECT id INTO v_id FROM public.queue_items WHERE campaign_id=p_campaign_id AND user_id=p_user_id AND started_at IS NULL AND status IN('queued','scheduled') ORDER BY position,id FOR UPDATE LIMIT 1;IF v_id IS NULL THEN RETURN NULL;END IF;
  UPDATE public.queue_items SET manual_requested_at=NOW(),next_execution_at=NOW(),status='queued',updated_at=NOW() WHERE id=v_id;UPDATE public.queue_deliveries SET status=CASE WHEN status='scheduled' THEN 'pending' ELSE status END,scheduled_at=NOW(),next_attempt_at=CASE WHEN status IN('pending','scheduled') THEN NOW() ELSE next_attempt_at END,updated_at=NOW() WHERE queue_item_id=v_id;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.retry_dispatch_delivery(p_user_id UUID,p_delivery_id UUID,p_include_uncertain BOOLEAN DEFAULT FALSE) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;v_item UUID;v_campaign UUID;
BEGIN
  UPDATE public.queue_deliveries SET status='pending',attempt_count=0,next_attempt_at=NOW(),last_error_code=NULL,last_error_at=NULL,updated_at=NOW() WHERE id=p_delivery_id AND user_id=p_user_id AND (status='failed' OR (p_include_uncertain AND status='uncertain')) RETURNING id,queue_item_id,campaign_id INTO v_id,v_item,v_campaign;
  IF v_id IS NULL THEN RETURN NULL;END IF;UPDATE public.queue_items SET status='queued',completed_at=NULL,next_execution_at=NOW(),updated_at=NOW() WHERE id=v_item;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.set_dispatch_queue_paused(p_user_id UUID,p_queue_item_id UUID,p_paused BOOLEAN) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN UPDATE public.queue_items SET status=CASE WHEN p_paused THEN 'paused' ELSE CASE WHEN scheduled_at>NOW() THEN 'scheduled' ELSE 'queued' END END,next_execution_at=CASE WHEN p_paused THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=p_queue_item_id AND user_id=p_user_id AND started_at IS NULL AND status NOT IN('completed','partially_failed','failed','cancelled') RETURNING id INTO v_id;RETURN v_id;END $$;
CREATE OR REPLACE FUNCTION public.cancel_dispatch_queue_item(p_user_id UUID,p_queue_item_id UUID) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id UUID;BEGIN UPDATE public.queue_items SET status='cancelled',next_execution_at=NULL,updated_at=NOW() WHERE id=p_queue_item_id AND user_id=p_user_id AND started_at IS NULL AND status NOT IN('completed','cancelled') RETURNING id INTO v_id;UPDATE public.queue_deliveries SET status='cancelled',updated_at=NOW() WHERE queue_item_id=v_id AND status IN('pending','scheduled','retry_wait');RETURN v_id;END $$;
CREATE OR REPLACE FUNCTION public.retry_dispatch_queue_item(p_user_id UUID,p_queue_item_id UUID,p_include_uncertain BOOLEAN DEFAULT FALSE) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id UUID;BEGIN UPDATE public.queue_items SET status='queued',completed_at=NULL,next_execution_at=NOW(),updated_at=NOW() WHERE id=p_queue_item_id AND user_id=p_user_id AND status IN('failed','partially_failed') RETURNING id INTO v_id;UPDATE public.queue_deliveries SET status='pending',attempt_count=0,next_attempt_at=NOW(),last_error_code=NULL,last_error_at=NULL,updated_at=NOW() WHERE queue_item_id=v_id AND (status='failed' OR (p_include_uncertain AND status='uncertain'));RETURN v_id;END $$;

CREATE OR REPLACE FUNCTION public.claim_next_queue_delivery(p_worker_id TEXT,p_stale_before TIMESTAMPTZ) RETURNS SETOF public.queue_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.whatsapp_dispatch_state%ROWTYPE;v_delivery UUID;v_item UUID;
BEGIN
  FOR s IN SELECT state.* FROM public.whatsapp_dispatch_state state JOIN public.whatsapp_connections wc ON wc.id=state.connection_id AND wc.status='connected' WHERE state.processing_delivery_id IS NULL AND state.next_send_at<=NOW() ORDER BY state.next_send_at,state.connection_id FOR UPDATE OF state SKIP LOCKED LOOP
    IF s.processing_queue_item_id IS NOT NULL THEN v_item=s.processing_queue_item_id;
    ELSE
      SELECT q.id INTO v_item FROM public.campaigns c JOIN LATERAL(SELECT qi.* FROM public.queue_items qi WHERE qi.campaign_id=c.id AND qi.status IN('queued','scheduled','sending') AND qi.started_at IS NULL AND qi.next_execution_at<=NOW() AND (c.mode<>'manual' OR qi.manual_requested_at IS NOT NULL) ORDER BY qi.position,qi.id LIMIT 1)q ON TRUE WHERE c.connection_id=s.connection_id AND c.status='active' ORDER BY c.last_dispatched_at NULLS FIRST,c.created_at,q.position LIMIT 1;
    END IF;
    IF v_item IS NULL THEN CONTINUE;END IF;
    SELECT d.id INTO v_delivery FROM public.queue_deliveries d JOIN public.queue_items q ON q.id=d.queue_item_id JOIN public.campaigns c ON c.id=d.campaign_id WHERE d.queue_item_id=v_item AND (c.status='active' OR (c.status='pause_requested' AND q.started_at IS NOT NULL)) AND d.status IN('pending','scheduled','retry_wait') AND COALESCE(d.next_attempt_at,d.scheduled_at)<=NOW() AND d.attempt_count<3 ORDER BY d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1;
    IF v_delivery IS NOT NULL THEN
      UPDATE public.queue_items SET started_at=COALESCE(started_at,NOW()),status='sending',updated_at=NOW() WHERE id=v_item;
      UPDATE public.whatsapp_dispatch_state SET processing_delivery_id=v_delivery,processing_queue_item_id=v_item,claimed_by=p_worker_id,claimed_at=NOW(),updated_at=NOW() WHERE connection_id=s.connection_id;
      RETURN QUERY UPDATE public.queue_deliveries SET status='claimed',attempt_count=attempt_count+1,claimed_at=NOW(),claimed_by=p_worker_id,updated_at=NOW() WHERE id=v_delivery RETURNING *;RETURN;
    END IF;
  END LOOP;RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.mark_dispatch_sent(p_delivery_id UUID,p_worker_id TEXT,p_external_message_id TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_connection UUID;v_item UUID;v_terminal BOOLEAN;
BEGIN
  UPDATE public.queue_deliveries SET status='sent',external_message_id=p_external_message_id,sent_at=NOW(),claimed_at=NULL,claimed_by=NULL,updated_at=NOW() WHERE id=p_delivery_id AND claimed_by=p_worker_id AND status='sending' RETURNING connection_id,queue_item_id INTO v_connection,v_item;
  IF v_connection IS NULL THEN RAISE EXCEPTION 'DELIVERY_CLAIM_LOST';END IF;PERFORM public.refresh_queue_item_status(v_item);SELECT status IN('completed','partially_failed','failed','cancelled') INTO v_terminal FROM public.queue_items WHERE id=v_item;
  UPDATE public.whatsapp_dispatch_state SET last_sent_at=NOW(),next_send_at=NOW()+INTERVAL '2 seconds',processing_delivery_id=NULL,processing_queue_item_id=CASE WHEN v_terminal THEN NULL ELSE v_item END,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE connection_id=v_connection AND processing_delivery_id=p_delivery_id;
END $$;

CREATE OR REPLACE FUNCTION public.release_dispatch_delivery(p_delivery_id UUID,p_worker_id TEXT,p_status TEXT,p_error_code TEXT,p_next_attempt_at TIMESTAMPTZ DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_connection UUID;v_item UUID;v_terminal BOOLEAN;
BEGIN
  IF p_status NOT IN('retry_wait','failed','uncertain') THEN RAISE EXCEPTION 'DELIVERY_STATUS_INVALID';END IF;
  UPDATE public.queue_deliveries SET status=p_status,last_error_code=p_error_code,last_error_at=NOW(),next_attempt_at=CASE WHEN p_status='retry_wait' THEN p_next_attempt_at ELSE next_attempt_at END,claimed_at=NULL,claimed_by=NULL,updated_at=NOW() WHERE id=p_delivery_id AND claimed_by=p_worker_id AND status IN('claimed','sending') RETURNING connection_id,queue_item_id INTO v_connection,v_item;
  IF v_connection IS NULL THEN RETURN;END IF;PERFORM public.refresh_queue_item_status(v_item);SELECT status IN('completed','partially_failed','failed','cancelled') INTO v_terminal FROM public.queue_items WHERE id=v_item;
  UPDATE public.whatsapp_dispatch_state SET next_send_at=CASE WHEN v_terminal THEN NOW()+INTERVAL '2 seconds' ELSE next_send_at END,processing_delivery_id=NULL,processing_queue_item_id=CASE WHEN v_terminal THEN NULL ELSE v_item END,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE connection_id=v_connection AND processing_delivery_id=p_delivery_id;
END $$;

REVOKE ALL ON FUNCTION public.create_dispatch_queue(UUID,TEXT,UUID,UUID[],INTEGER,TEXT,TEXT,TIME,TIME,SMALLINT[],TIME[]),public.update_dispatch_queue(UUID,UUID,TEXT,UUID,UUID[],INTEGER,TEXT,TEXT,TIME,TIME,SMALLINT[],TIME[]),public.reorder_dispatch_queue_items(UUID,UUID,UUID[]),public.request_dispatch_queue_next(UUID,UUID),public.retry_dispatch_delivery(UUID,UUID,BOOLEAN),public.enqueue_dispatch_queue_item(UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispatch_queue(UUID,TEXT,UUID,UUID[],INTEGER,TEXT,TEXT,TIME,TIME,SMALLINT[],TIME[]),public.update_dispatch_queue(UUID,UUID,TEXT,UUID,UUID[],INTEGER,TEXT,TEXT,TIME,TIME,SMALLINT[],TIME[]),public.reorder_dispatch_queue_items(UUID,UUID,UUID[]),public.request_dispatch_queue_next(UUID,UUID),public.retry_dispatch_delivery(UUID,UUID,BOOLEAN),public.enqueue_dispatch_queue_item(UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT,TEXT),public.set_dispatch_campaign_status(UUID,UUID,TEXT),public.set_dispatch_queue_paused(UUID,UUID,BOOLEAN),public.cancel_dispatch_queue_item(UUID,UUID),public.retry_dispatch_queue_item(UUID,UUID,BOOLEAN) TO service_role;
