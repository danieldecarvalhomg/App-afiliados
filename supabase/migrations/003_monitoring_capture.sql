-- AfiliHub — Bloco 3A: monitoramento real e captura de mensagens
-- Migration incremental; aplicar após 002_whatsapp_qr_multi_connection.sql.

ALTER TABLE public.group_monitors
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.group_monitors
SET enabled = COALESCE(enabled, status = 'active', TRUE)
WHERE enabled IS NULL;

ALTER TABLE public.group_monitors
  ALTER COLUMN enabled SET DEFAULT TRUE,
  ALTER COLUMN enabled SET NOT NULL;

-- Registros legados sem grupo real não podem participar do pipeline real.
DELETE FROM public.group_monitors WHERE group_id IS NULL;

-- Consolida eventuais duplicatas legadas antes de criar a restrição. Capturas
-- antigas passam a apontar para o monitor mais antigo do mesmo grupo.
WITH ranked AS (
  SELECT id,
         FIRST_VALUE(id) OVER (PARTITION BY user_id, group_id ORDER BY created_at, id) AS keeper_id,
         ROW_NUMBER() OVER (PARTITION BY user_id, group_id ORDER BY created_at, id) AS position
  FROM public.group_monitors
)
UPDATE public.captured_messages captured
SET monitor_id = ranked.keeper_id
FROM ranked
WHERE captured.monitor_id = ranked.id AND ranked.position > 1;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, group_id ORDER BY created_at, id) AS position
  FROM public.group_monitors
)
DELETE FROM public.group_monitors monitor
USING ranked
WHERE monitor.id = ranked.id AND ranked.position > 1;

ALTER TABLE public.group_monitors
  ALTER COLUMN group_id SET NOT NULL;

ALTER TABLE public.group_monitors
  DROP CONSTRAINT IF EXISTS group_monitors_user_id_group_id_key;
ALTER TABLE public.group_monitors
  ADD CONSTRAINT group_monitors_user_id_group_id_key UNIQUE (user_id, group_id);

ALTER TABLE public.captured_messages
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS external_group_id TEXT,
  ADD COLUMN IF NOT EXISTS sender_external_id TEXT,
  ADD COLUMN IF NOT EXISTS message_type TEXT,
  ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS media_metadata JSONB,
  ADD COLUMN IF NOT EXISTS message_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_status TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.captured_messages
  DROP CONSTRAINT IF EXISTS captured_messages_message_type_check,
  ADD CONSTRAINT captured_messages_message_type_check
    CHECK (message_type IS NULL OR message_type IN ('text','image','video','document','audio','sticker','unknown')),
  DROP CONSTRAINT IF EXISTS captured_messages_processing_status_check,
  ADD CONSTRAINT captured_messages_processing_status_check CHECK (processing_status = 'raw');

CREATE UNIQUE INDEX IF NOT EXISTS captured_messages_external_id_uidx
  ON public.captured_messages (user_id, external_group_id, external_message_id)
  WHERE external_message_id IS NOT NULL AND external_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS captured_messages_fingerprint_idx
  ON public.captured_messages (user_id, message_fingerprint);
CREATE INDEX IF NOT EXISTS captured_messages_user_received_idx
  ON public.captured_messages (user_id, received_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS group_monitors_active_idx
  ON public.group_monitors (user_id, group_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS public.captured_message_sources (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  captured_message_id UUID NOT NULL REFERENCES public.captured_messages(id) ON DELETE CASCADE,
  connection_id       UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  group_id            UUID NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  monitor_id          UUID NOT NULL REFERENCES public.group_monitors(id) ON DELETE CASCADE,
  observed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT captured_message_sources_origin_key
    UNIQUE (captured_message_id, connection_id, group_id, monitor_id)
);

CREATE INDEX IF NOT EXISTS captured_message_sources_message_idx
  ON public.captured_message_sources (captured_message_id);
CREATE INDEX IF NOT EXISTS captured_message_sources_origin_idx
  ON public.captured_message_sources (user_id, connection_id, group_id, monitor_id);

ALTER TABLE public.captured_message_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "captured_message_sources_owner" ON public.captured_message_sources;
CREATE POLICY "captured_message_sources_owner" ON public.captured_message_sources
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Mesmo usando service_role no backend, estas validações impedem FKs cruzadas entre usuários.
CREATE OR REPLACE FUNCTION public.validate_monitoring_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'group_monitors' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.whatsapp_groups g
      WHERE g.id = NEW.group_id AND g.user_id = NEW.user_id
    ) THEN RAISE EXCEPTION 'MONITOR_GROUP_OWNER_MISMATCH'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.captured_messages m WHERE m.id = NEW.captured_message_id AND m.user_id = NEW.user_id)
      OR NOT EXISTS (SELECT 1 FROM public.whatsapp_connections c WHERE c.id = NEW.connection_id AND c.user_id = NEW.user_id)
      OR NOT EXISTS (SELECT 1 FROM public.whatsapp_groups g WHERE g.id = NEW.group_id AND g.user_id = NEW.user_id AND g.connection_id = NEW.connection_id)
      OR NOT EXISTS (SELECT 1 FROM public.group_monitors gm WHERE gm.id = NEW.monitor_id AND gm.user_id = NEW.user_id AND gm.group_id = NEW.group_id)
    THEN RAISE EXCEPTION 'CAPTURE_SOURCE_OWNER_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_group_monitor_ownership ON public.group_monitors;
CREATE TRIGGER validate_group_monitor_ownership
  BEFORE INSERT OR UPDATE OF user_id, group_id ON public.group_monitors
  FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_ownership();
DROP TRIGGER IF EXISTS validate_capture_source_ownership ON public.captured_message_sources;
CREATE TRIGGER validate_capture_source_ownership
  BEFORE INSERT OR UPDATE ON public.captured_message_sources
  FOR EACH ROW EXECUTE FUNCTION public.validate_monitoring_ownership();

-- Cria/reutiliza a mensagem canônica e registra a origem na mesma transação.
CREATE OR REPLACE FUNCTION public.capture_whatsapp_message(
  p_user_id UUID,
  p_external_message_id TEXT,
  p_external_group_id TEXT,
  p_sender_external_id TEXT,
  p_message_type TEXT,
  p_raw_content TEXT,
  p_links JSONB,
  p_media_metadata JSONB,
  p_message_fingerprint TEXT,
  p_sent_at TIMESTAMPTZ,
  p_received_at TIMESTAMPTZ,
  p_connection_id UUID,
  p_group_id UUID,
  p_monitor_id UUID
)
RETURNS TABLE(captured_message_id UUID, duplicate BOOLEAN, source_created BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
  v_source_id UUID;
  v_duplicate BOOLEAN := FALSE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(
    p_user_id::TEXT || ':' || p_external_group_id || ':' || COALESCE(NULLIF(p_external_message_id, ''), p_message_fingerprint), 0
  ));

  IF NULLIF(p_external_message_id, '') IS NOT NULL THEN
    SELECT id INTO v_message_id FROM public.captured_messages
    WHERE user_id = p_user_id
      AND external_group_id = p_external_group_id
      AND external_message_id = p_external_message_id
    LIMIT 1;
  END IF;

  IF v_message_id IS NULL THEN
    SELECT id INTO v_message_id FROM public.captured_messages
    WHERE user_id = p_user_id AND message_fingerprint = p_message_fingerprint
    LIMIT 1;
  END IF;

  IF v_message_id IS NULL THEN
    INSERT INTO public.captured_messages (
      user_id, external_message_id, external_group_id, sender_external_id,
      message_type, raw_content, links, media_metadata, message_fingerprint,
      sent_at, received_at, processing_status
    ) VALUES (
      p_user_id, NULLIF(p_external_message_id, ''), p_external_group_id, p_sender_external_id,
      p_message_type, COALESCE(p_raw_content, ''), COALESCE(p_links, '[]'::JSONB),
      p_media_metadata, p_message_fingerprint, p_sent_at, p_received_at, 'raw'
    ) RETURNING id INTO v_message_id;
  ELSE
    v_duplicate := TRUE;
  END IF;

  INSERT INTO public.captured_message_sources (
    user_id, captured_message_id, connection_id, group_id, monitor_id, observed_at
  ) VALUES (
    p_user_id, v_message_id, p_connection_id, p_group_id, p_monitor_id, p_received_at
  ) ON CONFLICT ON CONSTRAINT captured_message_sources_origin_key DO NOTHING
  RETURNING id INTO v_source_id;

  UPDATE public.group_monitors
  SET last_activity_at = p_received_at, updated_at = p_received_at
  WHERE id = p_monitor_id AND user_id = p_user_id;

  RETURN QUERY SELECT v_message_id, v_duplicate, v_source_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_whatsapp_message(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID,UUID,UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_whatsapp_message(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,TEXT,TIMESTAMPTZ,TIMESTAMPTZ,UUID,UUID,UUID)
  TO service_role;
