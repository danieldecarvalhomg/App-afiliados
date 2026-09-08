-- Separa campanhas editoriais (grupos de grupos) das filas operacionais.
-- As filas continuam usando public.campaigns por compatibilidade com o motor.

CREATE TABLE IF NOT EXISTS public.campaign_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  connection_id UUID NOT NULL REFERENCES public.whatsapp_connections(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaign_collection_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.campaign_collections(id) ON DELETE CASCADE,
  whatsapp_group_id UUID NOT NULL REFERENCES public.whatsapp_groups(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, whatsapp_group_id)
);

CREATE INDEX IF NOT EXISTS campaign_collections_user_idx
  ON public.campaign_collections(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campaign_collection_destinations_collection_idx
  ON public.campaign_collection_destinations(collection_id, created_at);

CREATE OR REPLACE FUNCTION public.validate_campaign_collection_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.whatsapp_connections
    WHERE id=NEW.connection_id AND user_id=NEW.user_id
  ) THEN RAISE EXCEPTION 'CAMPAIGN_CONNECTION_FORBIDDEN'; END IF;
  NEW.name=btrim(NEW.name);
  NEW.updated_at=NOW();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_campaign_collection_owner_trigger ON public.campaign_collections;
CREATE TRIGGER validate_campaign_collection_owner_trigger
BEFORE INSERT OR UPDATE ON public.campaign_collections
FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_collection_owner();

CREATE OR REPLACE FUNCTION public.validate_campaign_collection_destination()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_connection_id UUID;
BEGIN
  SELECT connection_id INTO v_connection_id
  FROM public.campaign_collections
  WHERE id=NEW.collection_id AND user_id=NEW.user_id;
  IF v_connection_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.whatsapp_groups
    WHERE id=NEW.whatsapp_group_id
      AND user_id=NEW.user_id
      AND connection_id=v_connection_id
      AND sync_status='active'
  ) THEN RAISE EXCEPTION 'CAMPAIGN_GROUP_FORBIDDEN'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_campaign_collection_destination_trigger ON public.campaign_collection_destinations;
CREATE TRIGGER validate_campaign_collection_destination_trigger
BEFORE INSERT OR UPDATE ON public.campaign_collection_destinations
FOR EACH ROW EXECUTE FUNCTION public.validate_campaign_collection_destination();

CREATE OR REPLACE FUNCTION public.create_campaign_collection(
  p_user_id UUID,
  p_name TEXT,
  p_connection_id UUID,
  p_group_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF btrim(coalesce(p_name,''))='' OR char_length(btrim(p_name))>100 THEN
    RAISE EXCEPTION 'CAMPAIGN_NAME_INVALID';
  END IF;
  IF coalesce(cardinality(p_group_ids),0)=0 THEN
    RAISE EXCEPTION 'CAMPAIGN_DESTINATIONS_REQUIRED';
  END IF;
  INSERT INTO public.campaign_collections(user_id,name,connection_id)
  VALUES(p_user_id,btrim(p_name),p_connection_id) RETURNING id INTO v_id;
  INSERT INTO public.campaign_collection_destinations(user_id,collection_id,whatsapp_group_id)
  SELECT p_user_id,v_id,id FROM (SELECT DISTINCT unnest(p_group_ids) id) selected_groups;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.update_campaign_collection(
  p_user_id UUID,
  p_collection_id UUID,
  p_name TEXT,
  p_connection_id UUID,
  p_group_ids UUID[]
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  IF btrim(coalesce(p_name,''))='' OR char_length(btrim(p_name))>100 THEN
    RAISE EXCEPTION 'CAMPAIGN_NAME_INVALID';
  END IF;
  IF coalesce(cardinality(p_group_ids),0)=0 THEN
    RAISE EXCEPTION 'CAMPAIGN_DESTINATIONS_REQUIRED';
  END IF;
  UPDATE public.campaign_collections
  SET name=btrim(p_name),connection_id=p_connection_id,updated_at=NOW()
  WHERE id=p_collection_id AND user_id=p_user_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN NULL; END IF;
  DELETE FROM public.campaign_collection_destinations WHERE collection_id=v_id;
  INSERT INTO public.campaign_collection_destinations(user_id,collection_id,whatsapp_group_id)
  SELECT p_user_id,v_id,id FROM (SELECT DISTINCT unnest(p_group_ids) id) selected_groups;
  RETURN v_id;
END $$;

-- Converte as filas existentes em campanhas reutilizáveis uma única vez, sem
-- alterar nem interromper os registros operacionais atuais.
INSERT INTO public.campaign_collections(id,user_id,name,connection_id,created_at,updated_at)
SELECT id,user_id,name,connection_id,created_at,updated_at
FROM public.campaigns
WHERE connection_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.campaign_collection_destinations(user_id,collection_id,whatsapp_group_id,created_at)
SELECT d.user_id,d.campaign_id,d.whatsapp_group_id,d.created_at
FROM public.campaign_destinations d
JOIN public.campaign_collections c ON c.id=d.campaign_id
WHERE d.whatsapp_group_id IS NOT NULL
ON CONFLICT (collection_id,whatsapp_group_id) DO NOTHING;

ALTER TABLE public.campaign_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_collection_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_collections_owner ON public.campaign_collections;
CREATE POLICY campaign_collections_owner ON public.campaign_collections
FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
DROP POLICY IF EXISTS campaign_collection_destinations_owner ON public.campaign_collection_destinations;
CREATE POLICY campaign_collection_destinations_owner ON public.campaign_collection_destinations
FOR ALL USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

REVOKE ALL ON FUNCTION public.create_campaign_collection(UUID,TEXT,UUID,UUID[]) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.update_campaign_collection(UUID,UUID,TEXT,UUID,UUID[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_campaign_collection(UUID,TEXT,UUID,UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_campaign_collection(UUID,UUID,TEXT,UUID,UUID[]) TO service_role;
