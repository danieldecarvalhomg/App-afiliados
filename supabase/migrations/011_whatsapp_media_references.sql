-- AfiliHub 3D.3.1 — referências duráveis e mínimas para download seletivo de mídia.
CREATE TABLE IF NOT EXISTS public.whatsapp_media_references(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  captured_message_id UUID NOT NULL REFERENCES public.captured_messages(id) ON DELETE CASCADE,
  external_group_id TEXT NOT NULL,
  external_message_id TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK(media_type='image'),
  mime_type TEXT,
  retrieval_payload_encrypted TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','claimed','downloaded','expired','unavailable','failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  downloaded_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processing_worker_id TEXT,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_media_reference_payload_size CHECK(retrieval_payload_encrypted IS NULL OR length(retrieval_payload_encrypted)<=10000),
  CONSTRAINT whatsapp_media_reference_expiry CHECK(expires_at>created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_media_reference_identity_idx ON public.whatsapp_media_references(user_id,connection_id,external_group_id,external_message_id,media_type);
CREATE INDEX IF NOT EXISTS whatsapp_media_reference_capture_idx ON public.whatsapp_media_references(user_id,captured_message_id,status,next_attempt_at);
CREATE INDEX IF NOT EXISTS whatsapp_media_reference_queue_idx ON public.whatsapp_media_references(status,next_attempt_at,expires_at,created_at) WHERE status IN('pending','claimed');
CREATE INDEX IF NOT EXISTS whatsapp_media_reference_cleanup_idx ON public.whatsapp_media_references(status,updated_at) WHERE status IN('downloaded','expired','unavailable','failed');

ALTER TABLE public.whatsapp_media_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "whatsapp_media_references_owner" ON public.whatsapp_media_references;
CREATE POLICY "whatsapp_media_references_owner" ON public.whatsapp_media_references FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
REVOKE ALL ON public.whatsapp_media_references FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.validate_whatsapp_media_reference_ownership()RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.whatsapp_connections c WHERE c.id=NEW.connection_id AND c.user_id=NEW.user_id)
    OR NOT EXISTS(SELECT 1 FROM public.captured_messages m WHERE m.id=NEW.captured_message_id AND m.user_id=NEW.user_id AND m.external_group_id=NEW.external_group_id AND m.external_message_id=NEW.external_message_id)
    OR NOT EXISTS(SELECT 1 FROM public.captured_message_sources s WHERE s.user_id=NEW.user_id AND s.captured_message_id=NEW.captured_message_id AND s.connection_id=NEW.connection_id)
  THEN RAISE EXCEPTION 'WHATSAPP_MEDIA_REFERENCE_OWNER_MISMATCH';END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_whatsapp_media_reference_ownership ON public.whatsapp_media_references;
CREATE TRIGGER validate_whatsapp_media_reference_ownership BEFORE INSERT OR UPDATE OF user_id,connection_id,captured_message_id,external_group_id,external_message_id ON public.whatsapp_media_references FOR EACH ROW EXECUTE FUNCTION public.validate_whatsapp_media_reference_ownership();

CREATE OR REPLACE FUNCTION public.upsert_whatsapp_media_reference(p_user_id UUID,p_connection_id UUID,p_captured_message_id UUID,p_external_group_id TEXT,p_external_message_id TEXT,p_media_type TEXT,p_mime_type TEXT,p_retrieval_payload_encrypted TEXT,p_expires_at TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_media_references(user_id,connection_id,captured_message_id,external_group_id,external_message_id,media_type,mime_type,retrieval_payload_encrypted,status,expires_at)
  VALUES(p_user_id,p_connection_id,p_captured_message_id,p_external_group_id,p_external_message_id,p_media_type,p_mime_type,p_retrieval_payload_encrypted,'pending',p_expires_at)
  ON CONFLICT(user_id,connection_id,external_group_id,external_message_id,media_type) DO UPDATE SET
    captured_message_id=EXCLUDED.captured_message_id,mime_type=EXCLUDED.mime_type,
    retrieval_payload_encrypted=CASE WHEN whatsapp_media_references.status='downloaded' THEN NULL ELSE EXCLUDED.retrieval_payload_encrypted END,
    status=CASE WHEN whatsapp_media_references.status='downloaded' THEN 'downloaded' ELSE 'pending' END,
    expires_at=GREATEST(whatsapp_media_references.expires_at,EXCLUDED.expires_at),
    attempt_count=CASE WHEN whatsapp_media_references.status IN('expired','unavailable','failed') THEN 0 ELSE whatsapp_media_references.attempt_count END,
    next_attempt_at=CASE WHEN whatsapp_media_references.status='downloaded' THEN whatsapp_media_references.next_attempt_at ELSE NOW() END,
    processing_started_at=NULL,processing_worker_id=NULL,last_error_code=NULL,updated_at=NOW()
  RETURNING id INTO v_id;RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_media_reference(p_user_id UUID,p_captured_message_id UUID,p_worker_id TEXT,p_stale_before TIMESTAMPTZ)
RETURNS SETOF public.whatsapp_media_references LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  -- Serializa claims de fontes irmãs da mesma mídia/captura. A trava dura apenas
  -- a transação da RPC; o estado claimed persistido impede o segundo worker.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_captured_message_id::TEXT,0));
  UPDATE public.whatsapp_media_references SET status='expired',retrieval_payload_encrypted=NULL,processing_started_at=NULL,processing_worker_id=NULL,last_error_code='WHATSAPP_MEDIA_REFERENCE_EXPIRED',updated_at=NOW() WHERE status IN('pending','claimed') AND expires_at<=NOW();
  UPDATE public.whatsapp_media_references SET status='failed',retrieval_payload_encrypted=NULL,processing_started_at=NULL,processing_worker_id=NULL,last_error_code='WHATSAPP_MEDIA_PROCESSING_TIMEOUT',updated_at=NOW() WHERE status='claimed' AND processing_started_at<p_stale_before AND attempt_count>=3;
  IF EXISTS(SELECT 1 FROM public.whatsapp_media_references WHERE user_id=p_user_id AND captured_message_id=p_captured_message_id AND status='claimed' AND processing_started_at>=p_stale_before)THEN RETURN;END IF;
  SELECT id INTO v_id FROM public.whatsapp_media_references WHERE user_id=p_user_id AND captured_message_id=p_captured_message_id AND retrieval_payload_encrypted IS NOT NULL AND expires_at>NOW() AND attempt_count<3 AND ((status='pending' AND next_attempt_at<=NOW()) OR(status='claimed' AND processing_started_at<p_stale_before)) ORDER BY CASE WHEN status='claimed' THEN 0 ELSE 1 END,attempt_count,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN;END IF;
  RETURN QUERY UPDATE public.whatsapp_media_references r SET status='claimed',processing_started_at=NOW(),processing_worker_id=p_worker_id,last_attempt_at=NOW(),attempt_count=r.attempt_count+1,last_error_code=NULL,updated_at=NOW() WHERE r.id=v_id RETURNING r.*;
END $$;

CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_media_references()RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.whatsapp_media_references SET status='expired',retrieval_payload_encrypted=NULL,processing_started_at=NULL,processing_worker_id=NULL,last_error_code=COALESCE(last_error_code,'WHATSAPP_MEDIA_REFERENCE_EXPIRED'),updated_at=NOW() WHERE status IN('pending','claimed') AND expires_at<=NOW();
  DELETE FROM public.whatsapp_media_references WHERE(status='downloaded' AND updated_at<NOW()-INTERVAL '24 hours')OR(status IN('expired','unavailable','failed')AND updated_at<NOW()-INTERVAL '7 days');GET DIAGNOSTICS v_count=ROW_COUNT;RETURN v_count;
END $$;

REVOKE ALL ON FUNCTION public.upsert_whatsapp_media_reference(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_whatsapp_media_reference(UUID,UUID,TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cleanup_whatsapp_media_references() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_whatsapp_media_reference(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_media_reference(UUID,UUID,TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_whatsapp_media_references() TO service_role;
