-- AfiliHub — Bloco 2: WhatsApp QR Multi-Conexão
-- Aplicar após o schema do Bloco 1.

ALTER TABLE public.whatsapp_connections
  ADD COLUMN IF NOT EXISTS label TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

UPDATE public.whatsapp_connections
SET label = COALESCE(NULLIF(label, ''), 'WhatsApp')
WHERE label IS NULL OR label = '';

ALTER TABLE public.whatsapp_connections
  ALTER COLUMN label SET NOT NULL;

ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_user_id_external_group_id_key;

ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'active'
    CHECK (sync_status IN ('active', 'unavailable')),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_connection_id_external_group_id_key;

ALTER TABLE public.whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_connection_id_external_group_id_key
  UNIQUE (connection_id, external_group_id);

CREATE INDEX IF NOT EXISTS whatsapp_connections_user_id_idx
  ON public.whatsapp_connections (user_id);

CREATE INDEX IF NOT EXISTS whatsapp_groups_connection_id_idx
  ON public.whatsapp_groups (connection_id);

-- Tabela deliberadamente inacessível ao usuário autenticado. Somente o backend
-- com service role lê/escreve o estado criptografado.
CREATE TABLE IF NOT EXISTS public.whatsapp_auth_sessions (
  connection_id  UUID PRIMARY KEY REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  encrypted_state TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.whatsapp_auth_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_auth_sessions FROM anon, authenticated;

-- Garante que um grupo nunca aponte para uma conexão de outro usuário.
CREATE OR REPLACE FUNCTION public.validate_whatsapp_group_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.whatsapp_connections connection
    WHERE connection.id = NEW.connection_id
      AND connection.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'WHATSAPP_GROUP_CONNECTION_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_whatsapp_group_owner_trigger ON public.whatsapp_groups;
CREATE TRIGGER validate_whatsapp_group_owner_trigger
  BEFORE INSERT OR UPDATE OF user_id, connection_id ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.validate_whatsapp_group_owner();

-- O advisory lock serializa criações do mesmo usuário e impede race condition
-- entre duas requisições simultâneas tentando criar a sexta conexão.
CREATE OR REPLACE FUNCTION public.create_whatsapp_connection(
  p_user_id UUID,
  p_label TEXT
)
RETURNS SETOF public.whatsapp_connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT, 0));

  IF (SELECT COUNT(*) FROM public.whatsapp_connections WHERE user_id = p_user_id) >= 5 THEN
    RAISE EXCEPTION 'WHATSAPP_CONNECTION_LIMIT_REACHED';
  END IF;

  RETURN QUERY
  INSERT INTO public.whatsapp_connections (user_id, label, status)
  VALUES (p_user_id, BTRIM(p_label), 'disconnected')
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.create_whatsapp_connection(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_whatsapp_connection(UUID, TEXT) TO service_role;
