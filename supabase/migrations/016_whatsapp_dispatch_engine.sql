-- AfiliHub Bloco 4: Campaigns + Queue + WhatsApp Dispatch Engine.
-- Evolui as tabelas legadas sem alterar migrations já aplicadas.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.whatsapp_connections(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_interval_seconds INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE public.campaigns SET status=CASE status WHEN 'ativa' THEN 'active' WHEN 'agendada' THEN 'draft' WHEN 'finalizada' THEN 'completed' WHEN 'pausada' THEN 'paused' ELSE status END;
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_status_check CHECK(status IN('draft','active','paused','completed','cancelled','archived'));
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_interval_check CHECK(default_interval_seconds BETWEEN 1 AND 86400);

DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_destinations' AND column_name='group_id')
    AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='campaign_destinations' AND column_name='whatsapp_group_id') THEN
    ALTER TABLE public.campaign_destinations RENAME COLUMN group_id TO whatsapp_group_id;
  END IF;
END $$;
ALTER TABLE public.campaign_destinations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE UNIQUE INDEX IF NOT EXISTS campaign_destinations_campaign_group_uidx ON public.campaign_destinations(campaign_id,whatsapp_group_id) WHERE whatsapp_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaigns_user_status_idx ON public.campaigns(user_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_destinations_campaign_idx ON public.campaign_destinations(campaign_id,created_at);

CREATE OR REPLACE FUNCTION public.validate_dispatch_campaign_owner() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.connection_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.whatsapp_connections c WHERE c.id=NEW.connection_id AND c.user_id=NEW.user_id) THEN RAISE EXCEPTION 'CAMPAIGN_CONNECTION_FORBIDDEN'; END IF;
  NEW.updated_at=NOW();RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_dispatch_campaign_owner_trigger ON public.campaigns;
CREATE TRIGGER validate_dispatch_campaign_owner_trigger BEFORE INSERT OR UPDATE OF user_id,connection_id,default_interval_seconds,timezone ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.validate_dispatch_campaign_owner();

CREATE OR REPLACE FUNCTION public.validate_campaign_destination_owner() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_connection UUID;
BEGIN
  SELECT connection_id INTO v_connection FROM public.campaigns WHERE id=NEW.campaign_id AND user_id=NEW.user_id;
  IF v_connection IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_FORBIDDEN'; END IF;
  IF NEW.whatsapp_group_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.id=NEW.whatsapp_group_id AND g.user_id=NEW.user_id AND g.connection_id=v_connection AND g.sync_status='active') THEN RAISE EXCEPTION 'CAMPAIGN_GROUP_FORBIDDEN'; END IF;
  NEW.updated_at=NOW();RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_campaign_destination_owner_trigger ON public.campaign_destinations;
CREATE TRIGGER validate_campaign_destination_owner_trigger BEFORE INSERT OR UPDATE OF user_id,campaign_id,whatsapp_group_id ON public.campaign_destinations FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_destination_owner();

ALTER TABLE public.queue_items
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_reference_id UUID,
  ADD COLUMN IF NOT EXISTS content_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.queue_items ALTER COLUMN product_title DROP NOT NULL;
ALTER TABLE public.queue_items ALTER COLUMN copy_text DROP NOT NULL;
ALTER TABLE public.queue_items ALTER COLUMN affiliate_url DROP NOT NULL;
UPDATE public.queue_items SET scheduled_at=COALESCE(scheduled_at,scheduled_for,created_at),source_type=COALESCE(source_type,'manual'),content_snapshot=COALESCE(content_snapshot,jsonb_build_object('text',COALESCE(copy_text,''),'primaryMediaAssetId',NULL,'hasMedia',false,'affiliateUrl',NULLIF(affiliate_url,''),'productId',product_id,'productTitle',product_title,'ctaGenerationId',NULL,'templateId',NULL,'templateVersion',NULL,'generatedAt',created_at)),idempotency_key=COALESCE(idempotency_key,id::TEXT),status=CASE status WHEN 'pendente' THEN 'queued' WHEN 'enviando' THEN 'sending' WHEN 'enviado' THEN 'completed' WHEN 'falhou' THEN 'failed' WHEN 'pausado' THEN 'paused' ELSE status END;
ALTER TABLE public.queue_items DROP CONSTRAINT IF EXISTS queue_items_status_check;
ALTER TABLE public.queue_items ADD CONSTRAINT queue_items_dispatch_status_check CHECK(status IN('draft','scheduled','queued','sending','completed','partially_failed','failed','paused','cancelled'));
ALTER TABLE public.queue_items ADD CONSTRAINT queue_items_source_type_check CHECK(source_type IS NULL OR source_type IN('cta_generation','offer','manual'));
ALTER TABLE public.queue_items ADD CONSTRAINT queue_items_snapshot_type_check CHECK(content_snapshot IS NULL OR jsonb_typeof(content_snapshot)='object');
CREATE UNIQUE INDEX IF NOT EXISTS queue_items_user_idempotency_uidx ON public.queue_items(user_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS queue_items_user_status_schedule_idx ON public.queue_items(user_id,status,scheduled_at,created_at);
CREATE INDEX IF NOT EXISTS queue_items_campaign_idx ON public.queue_items(campaign_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.queue_deliveries(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  queue_item_id UUID NOT NULL REFERENCES public.queue_items(id) ON DELETE CASCADE,campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE RESTRICT,whatsapp_group_id UUID NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','scheduled','claimed','sending','sent','retry_wait','failed','cancelled','skipped','uncertain')),
  scheduled_at TIMESTAMPTZ NOT NULL,next_attempt_at TIMESTAMPTZ,attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  last_error_code TEXT,last_error_at TIMESTAMPTZ,claimed_at TIMESTAMPTZ,claimed_by TEXT,sending_started_at TIMESTAMPTZ,sent_at TIMESTAMPTZ,external_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),UNIQUE(queue_item_id,whatsapp_group_id)
);
CREATE INDEX IF NOT EXISTS queue_deliveries_due_idx ON public.queue_deliveries(status,scheduled_at,next_attempt_at,connection_id);
CREATE INDEX IF NOT EXISTS queue_deliveries_item_idx ON public.queue_deliveries(queue_item_id,status);
CREATE INDEX IF NOT EXISTS queue_deliveries_connection_idx ON public.queue_deliveries(connection_id,status,created_at);

CREATE TABLE IF NOT EXISTS public.whatsapp_dispatch_state(
  connection_id UUID PRIMARY KEY REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  next_send_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_sent_at TIMESTAMPTZ,processing_delivery_id UUID REFERENCES public.queue_deliveries(id) ON DELETE SET NULL,
  claimed_by TEXT,claimed_at TIMESTAMPTZ,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS whatsapp_dispatch_state_due_idx ON public.whatsapp_dispatch_state(next_send_at) WHERE processing_delivery_id IS NULL;

CREATE OR REPLACE FUNCTION public.prevent_queue_snapshot_mutation() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF OLD.content_snapshot IS DISTINCT FROM NEW.content_snapshot OR OLD.source_type IS DISTINCT FROM NEW.source_type OR OLD.source_reference_id IS DISTINCT FROM NEW.source_reference_id THEN RAISE EXCEPTION 'QUEUE_SNAPSHOT_IMMUTABLE';END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS prevent_queue_snapshot_mutation_trigger ON public.queue_items;
CREATE TRIGGER prevent_queue_snapshot_mutation_trigger BEFORE UPDATE ON public.queue_items FOR EACH ROW EXECUTE FUNCTION public.prevent_queue_snapshot_mutation();

CREATE OR REPLACE FUNCTION public.validate_queue_delivery_owner() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.queue_items q JOIN public.campaigns c ON c.id=q.campaign_id JOIN public.whatsapp_groups g ON g.id=NEW.whatsapp_group_id WHERE q.id=NEW.queue_item_id AND q.user_id=NEW.user_id AND c.id=NEW.campaign_id AND c.user_id=NEW.user_id AND c.connection_id=NEW.connection_id AND g.user_id=NEW.user_id AND g.connection_id=NEW.connection_id) THEN RAISE EXCEPTION 'QUEUE_DELIVERY_OWNERSHIP_INVALID';END IF;NEW.updated_at=NOW();RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_queue_delivery_owner_trigger ON public.queue_deliveries;
CREATE TRIGGER validate_queue_delivery_owner_trigger BEFORE INSERT OR UPDATE OF user_id,queue_item_id,campaign_id,connection_id,whatsapp_group_id ON public.queue_deliveries FOR EACH ROW EXECUTE FUNCTION public.validate_queue_delivery_owner();

CREATE OR REPLACE FUNCTION public.refresh_queue_item_status(p_item_id UUID) RETURNS VOID LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_total INT;v_sent INT;v_active INT;v_waiting INT;v_failed INT;v_status TEXT;v_current TEXT;
BEGIN
  SELECT status INTO v_current FROM public.queue_items WHERE id=p_item_id FOR UPDATE;IF v_current IN('paused','cancelled') THEN RETURN;END IF;
  SELECT COUNT(*),COUNT(*)FILTER(WHERE status='sent'),COUNT(*)FILTER(WHERE status IN('claimed','sending')),COUNT(*)FILTER(WHERE status IN('pending','scheduled','retry_wait')),COUNT(*)FILTER(WHERE status IN('failed','uncertain')) INTO v_total,v_sent,v_active,v_waiting,v_failed FROM public.queue_deliveries WHERE queue_item_id=p_item_id;
  v_status=CASE WHEN v_total>0 AND v_sent=v_total THEN 'completed' WHEN v_active>0 THEN 'sending' WHEN v_waiting>0 THEN CASE WHEN EXISTS(SELECT 1 FROM public.queue_items WHERE id=p_item_id AND scheduled_at>NOW()) THEN 'scheduled' ELSE 'queued' END WHEN v_failed>0 AND v_sent>0 THEN 'partially_failed' WHEN v_failed>0 THEN 'failed' ELSE 'queued' END;
  UPDATE public.queue_items SET status=v_status,updated_at=NOW() WHERE id=p_item_id;
END $$;
CREATE OR REPLACE FUNCTION public.queue_delivery_status_trigger() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN PERFORM public.refresh_queue_item_status(COALESCE(NEW.queue_item_id,OLD.queue_item_id));RETURN COALESCE(NEW,OLD);END $$;
DROP TRIGGER IF EXISTS queue_delivery_status_trigger ON public.queue_deliveries;
CREATE TRIGGER queue_delivery_status_trigger AFTER INSERT OR UPDATE OF status OR DELETE ON public.queue_deliveries FOR EACH ROW EXECUTE FUNCTION public.queue_delivery_status_trigger();

CREATE OR REPLACE FUNCTION public.create_dispatch_campaign(p_user_id UUID,p_name TEXT,p_connection_id UUID,p_group_ids UUID[],p_interval_seconds INTEGER,p_timezone TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id UUID;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_connections WHERE id=p_connection_id AND user_id=p_user_id) THEN RAISE EXCEPTION 'CAMPAIGN_CONNECTION_FORBIDDEN';END IF;
  IF COALESCE(array_length(p_group_ids,1),0)=0 OR EXISTS(SELECT 1 FROM unnest(p_group_ids) x(id) WHERE NOT EXISTS(SELECT 1 FROM public.whatsapp_groups g WHERE g.id=x.id AND g.user_id=p_user_id AND g.connection_id=p_connection_id AND g.sync_status='active')) THEN RAISE EXCEPTION 'CAMPAIGN_GROUP_FORBIDDEN';END IF;
  INSERT INTO public.campaigns(user_id,name,connection_id,status,default_interval_seconds,timezone,updated_at)VALUES(p_user_id,p_name,p_connection_id,'active',p_interval_seconds,p_timezone,NOW())RETURNING id INTO v_id;
  INSERT INTO public.campaign_destinations(user_id,campaign_id,whatsapp_group_id)SELECT p_user_id,v_id,id FROM(SELECT DISTINCT unnest(p_group_ids) id)s;
  INSERT INTO public.whatsapp_dispatch_state(connection_id,user_id)VALUES(p_connection_id,p_user_id)ON CONFLICT(connection_id)DO NOTHING;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_dispatch_item(p_user_id UUID,p_campaign_id UUID,p_source_type TEXT,p_source_reference_id UUID,p_snapshot JSONB,p_scheduled_at TIMESTAMPTZ,p_idempotency_key TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_id UUID;v_connection UUID;v_status TEXT;
BEGIN
  SELECT connection_id INTO v_connection FROM public.campaigns WHERE id=p_campaign_id AND user_id=p_user_id AND status NOT IN('cancelled','archived','completed') FOR UPDATE;IF v_connection IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_QUEUEABLE';END IF;
  SELECT id INTO v_id FROM public.queue_items WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;IF v_id IS NOT NULL THEN RETURN v_id;END IF;
  IF jsonb_typeof(p_snapshot)<>'object' OR (COALESCE(BTRIM(p_snapshot->>'text'),'')='' AND NULLIF(p_snapshot->>'primaryMediaAssetId','') IS NULL) THEN RAISE EXCEPTION 'QUEUE_CONTENT_EMPTY';END IF;
  v_status=CASE WHEN p_scheduled_at>NOW() THEN 'scheduled' ELSE 'queued' END;
  INSERT INTO public.queue_items(user_id,campaign_id,source_type,source_reference_id,content_snapshot,scheduled_at,status,idempotency_key,product_id,product_title,copy_text,affiliate_url,scheduled_for,updated_at)
  VALUES(p_user_id,p_campaign_id,p_source_type,p_source_reference_id,p_snapshot,p_scheduled_at,v_status,p_idempotency_key,NULLIF(p_snapshot->>'productId','')::UUID,p_snapshot->>'productTitle',COALESCE(p_snapshot->>'text',''),COALESCE(p_snapshot->>'affiliateUrl',''),p_scheduled_at,NOW())RETURNING id INTO v_id;
  INSERT INTO public.queue_deliveries(user_id,queue_item_id,campaign_id,connection_id,whatsapp_group_id,status,scheduled_at,next_attempt_at)
  SELECT p_user_id,v_id,p_campaign_id,v_connection,d.whatsapp_group_id,CASE WHEN p_scheduled_at>NOW() THEN 'scheduled' ELSE 'pending' END,p_scheduled_at,p_scheduled_at FROM public.campaign_destinations d WHERE d.campaign_id=p_campaign_id;
  IF NOT EXISTS(SELECT 1 FROM public.queue_deliveries WHERE queue_item_id=v_id) THEN RAISE EXCEPTION 'CAMPAIGN_DESTINATIONS_REQUIRED';END IF;RETURN v_id;
EXCEPTION WHEN unique_violation THEN SELECT id INTO v_id FROM public.queue_items WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key;RETURN v_id;END $$;

CREATE OR REPLACE FUNCTION public.recover_stale_dispatch(p_stale_before TIMESTAMPTZ) RETURNS TABLE(recovered INTEGER,uncertain INTEGER) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_recovered INT;v_uncertain INT;
BEGIN
  UPDATE public.queue_deliveries SET status='pending',claimed_at=NULL,claimed_by=NULL,updated_at=NOW() WHERE status='claimed' AND claimed_at<p_stale_before;GET DIAGNOSTICS v_recovered=ROW_COUNT;
  UPDATE public.queue_deliveries SET status='uncertain',last_error_code='DISPATCH_CRASH_AFTER_SEND_STARTED',last_error_at=NOW(),claimed_at=NULL,claimed_by=NULL,updated_at=NOW() WHERE status='sending' AND sending_started_at<p_stale_before;GET DIAGNOSTICS v_uncertain=ROW_COUNT;
  UPDATE public.whatsapp_dispatch_state s SET processing_delivery_id=NULL,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE processing_delivery_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.queue_deliveries d WHERE d.id=s.processing_delivery_id AND d.status IN('claimed','sending'));
  RETURN QUERY SELECT v_recovered,v_uncertain;
END $$;

CREATE OR REPLACE FUNCTION public.claim_next_queue_delivery(p_worker_id TEXT,p_stale_before TIMESTAMPTZ) RETURNS SETOF public.queue_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_state public.whatsapp_dispatch_state%ROWTYPE;v_delivery UUID;
BEGIN
  FOR v_state IN SELECT s.* FROM public.whatsapp_dispatch_state s WHERE s.processing_delivery_id IS NULL AND s.next_send_at<=NOW() ORDER BY s.next_send_at,s.connection_id FOR UPDATE SKIP LOCKED LOOP
    SELECT d.id INTO v_delivery FROM public.queue_deliveries d JOIN public.queue_items q ON q.id=d.queue_item_id JOIN public.campaigns c ON c.id=d.campaign_id
    WHERE d.connection_id=v_state.connection_id AND c.status='active' AND q.status NOT IN('paused','cancelled','completed') AND d.status IN('pending','scheduled','retry_wait') AND d.scheduled_at<=NOW() AND COALESCE(d.next_attempt_at,d.scheduled_at)<=NOW() AND d.attempt_count<3
    ORDER BY d.scheduled_at,d.created_at FOR UPDATE OF d SKIP LOCKED LIMIT 1;
    IF v_delivery IS NOT NULL THEN
      UPDATE public.whatsapp_dispatch_state SET processing_delivery_id=v_delivery,claimed_by=p_worker_id,claimed_at=NOW(),updated_at=NOW() WHERE connection_id=v_state.connection_id;
      RETURN QUERY UPDATE public.queue_deliveries SET status='claimed',attempt_count=attempt_count+1,claimed_at=NOW(),claimed_by=p_worker_id,updated_at=NOW() WHERE id=v_delivery RETURNING *;RETURN;
    END IF;
  END LOOP;RETURN;
END $$;

CREATE OR REPLACE FUNCTION public.mark_dispatch_sent(p_delivery_id UUID,p_worker_id TEXT,p_external_message_id TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_connection UUID;v_interval INT;v_item UUID;
BEGIN
  UPDATE public.queue_deliveries d SET status='sent',external_message_id=p_external_message_id,sent_at=NOW(),claimed_at=NULL,claimed_by=NULL,updated_at=NOW() FROM public.campaigns c WHERE d.id=p_delivery_id AND d.claimed_by=p_worker_id AND d.status='sending' AND c.id=d.campaign_id RETURNING d.connection_id,c.default_interval_seconds,d.queue_item_id INTO v_connection,v_interval,v_item;
  IF v_connection IS NULL THEN RAISE EXCEPTION 'DELIVERY_CLAIM_LOST';END IF;
  UPDATE public.whatsapp_dispatch_state SET last_sent_at=NOW(),next_send_at=NOW()+make_interval(secs=>v_interval),processing_delivery_id=NULL,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE connection_id=v_connection AND processing_delivery_id=p_delivery_id;PERFORM public.refresh_queue_item_status(v_item);
END $$;

CREATE OR REPLACE FUNCTION public.release_dispatch_delivery(p_delivery_id UUID,p_worker_id TEXT,p_status TEXT,p_error_code TEXT,p_next_attempt_at TIMESTAMPTZ DEFAULT NULL) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_connection UUID;v_item UUID;
BEGIN
  IF p_status NOT IN('retry_wait','failed','uncertain') THEN RAISE EXCEPTION 'DELIVERY_STATUS_INVALID';END IF;
  UPDATE public.queue_deliveries SET status=p_status,last_error_code=p_error_code,last_error_at=NOW(),next_attempt_at=CASE WHEN p_status='retry_wait' THEN p_next_attempt_at ELSE next_attempt_at END,claimed_at=NULL,claimed_by=NULL,updated_at=NOW() WHERE id=p_delivery_id AND claimed_by=p_worker_id AND status IN('claimed','sending') RETURNING connection_id,queue_item_id INTO v_connection,v_item;
  IF v_connection IS NULL THEN RETURN;END IF;UPDATE public.whatsapp_dispatch_state SET processing_delivery_id=NULL,claimed_by=NULL,claimed_at=NULL,updated_at=NOW() WHERE connection_id=v_connection AND processing_delivery_id=p_delivery_id;PERFORM public.refresh_queue_item_status(v_item);
END $$;

ALTER TABLE public.queue_deliveries ENABLE ROW LEVEL SECURITY;ALTER TABLE public.whatsapp_dispatch_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS queue_deliveries_owner ON public.queue_deliveries;CREATE POLICY queue_deliveries_owner ON public.queue_deliveries FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS whatsapp_dispatch_state_owner ON public.whatsapp_dispatch_state;CREATE POLICY whatsapp_dispatch_state_owner ON public.whatsapp_dispatch_state FOR SELECT USING(user_id=auth.uid());
DROP POLICY IF EXISTS campaign_destinations_owner ON public.campaign_destinations;CREATE POLICY campaign_destinations_owner ON public.campaign_destinations FOR ALL USING(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.campaigns c WHERE c.id=campaign_id AND c.user_id=auth.uid())) WITH CHECK(user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.campaigns c WHERE c.id=campaign_id AND c.user_id=auth.uid()));

REVOKE ALL ON FUNCTION public.create_dispatch_campaign(UUID,TEXT,UUID,UUID[],INTEGER,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_dispatch_item(UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.recover_stale_dispatch(TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_next_queue_delivery(TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.mark_dispatch_sent(UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_dispatch_delivery(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_dispatch_campaign(UUID,TEXT,UUID,UUID[],INTEGER,TEXT),public.enqueue_dispatch_item(UUID,UUID,TEXT,UUID,JSONB,TIMESTAMPTZ,TEXT),public.recover_stale_dispatch(TIMESTAMPTZ),public.claim_next_queue_delivery(TEXT,TIMESTAMPTZ),public.mark_dispatch_sent(UUID,TEXT,TEXT),public.release_dispatch_delivery(UUID,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;
