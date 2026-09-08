-- AfiliHub: CTA inicial único, template canônico e memória semântica rica.
-- Migration incremental; migrations já aplicadas permanecem imutáveis.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coupon_url TEXT;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_coupon_url_http_check;
ALTER TABLE public.products ADD CONSTRAINT products_coupon_url_http_check
  CHECK (coupon_url IS NULL OR coupon_url ~* '^https?://');

ALTER TABLE public.cta_history
  ADD COLUMN IF NOT EXISTS generated_cta TEXT,
  ADD COLUMN IF NOT EXISTS memory_epoch INTEGER NOT NULL DEFAULT 1 CHECK (memory_epoch > 0);
CREATE INDEX IF NOT EXISTS cta_history_memory_epoch_idx
  ON public.cta_history(user_id, memory_epoch, created_at DESC);

ALTER TABLE public.cta_rules DROP CONSTRAINT IF EXISTS cta_rules_scope_check;
ALTER TABLE public.cta_rules ADD CONSTRAINT cta_rules_scope_check
  CHECK (scope IN ('persistent','conditional','exception','one_off'));

ALTER TABLE public.cta_templates
  ADD COLUMN IF NOT EXISTS canonical_template JSONB,
  ADD COLUMN IF NOT EXISTS template_dsl TEXT,
  ADD COLUMN IF NOT EXISTS editor_mode TEXT NOT NULL DEFAULT 'blocks',
  ADD COLUMN IF NOT EXISTS legacy_final_cta JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS legacy_unconverted_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cta_templates DROP CONSTRAINT IF EXISTS cta_templates_editor_mode_check;
ALTER TABLE public.cta_templates ADD CONSTRAINT cta_templates_editor_mode_check
  CHECK (editor_mode IN ('blocks','manual'));
ALTER TABLE public.cta_templates DROP CONSTRAINT IF EXISTS cta_templates_canonical_check;
ALTER TABLE public.cta_templates ADD CONSTRAINT cta_templates_canonical_check
  CHECK (
    canonical_template IS NULL OR
    (canonical_template->>'version' = '1' AND jsonb_typeof(canonical_template->'nodes') = 'array')
  );

CREATE OR REPLACE FUNCTION public.promofy_legacy_blocks_to_canonical(p_blocks JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  b JSONB;
  c JSONB;
  node JSONB;
  content JSONB;
  nodes JSONB := '[]'::jsonb;
  key_name TEXT;
  variable_name TEXT;
  marker_open TEXT;
  marker_close TEXT;
  condition_field TEXT;
  condition_operator TEXT;
  condition_value JSONB;
  position_counter INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_blocks, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('version', 1, 'nodes', '[]'::jsonb);
  END IF;
  FOR b IN
    SELECT value FROM jsonb_array_elements(p_blocks)
    ORDER BY COALESCE((value->>'position')::INTEGER, 0)
  LOOP
    IF COALESCE((b->>'enabled')::BOOLEAN, TRUE) = FALSE OR COALESCE(b->>'frequency','always') = 'never' THEN CONTINUE; END IF;
    key_name := COALESCE(b->>'key','');
    IF key_name = 'cta' THEN CONTINUE; END IF; -- preservado em legacy_final_cta
    variable_name := CASE key_name
      WHEN 'product' THEN 'produto' WHEN 'price' THEN 'preco'
      WHEN 'original_price' THEN 'preco_original' WHEN 'discount' THEN 'desconto'
      WHEN 'coupon' THEN 'cupom' WHEN 'coupon_link' THEN 'coupon_link'
      WHEN 'affiliate_link' THEN 'affiliate_link' WHEN 'marketplace' THEN 'marketplace'
      WHEN 'free_shipping' THEN 'frete_gratis' ELSE NULL END;
    IF key_name = 'opening' THEN
      node := jsonb_build_object('id', 'legacy_cta_' || position_counter, 'type', 'cta');
    ELSIF variable_name IS NOT NULL THEN
      node := jsonb_build_object('id', 'legacy_var_' || position_counter, 'type', 'variable', 'key', variable_name);
    ELSIF b->>'copyMode' = 'EXACT_TEXT' AND NULLIF(b->>'fixedText','') IS NOT NULL THEN
      node := jsonb_build_object('id', 'legacy_text_' || position_counter, 'type', 'text', 'text', b->>'fixedText');
    ELSE
      CONTINUE;
    END IF;

    marker_open := CASE COALESCE(b->>'whatsappFormat','normal')
      WHEN 'bold' THEN '*' WHEN 'italic' THEN '_' WHEN 'strikethrough' THEN '~'
      WHEN 'monospace' THEN '```' WHEN 'quote' THEN '> ' WHEN 'bullet_list' THEN '- '
      WHEN 'numbered_list' THEN '1. ' ELSE '' END;
    marker_close := CASE COALESCE(b->>'whatsappFormat','normal')
      WHEN 'bold' THEN '*' WHEN 'italic' THEN '_' WHEN 'strikethrough' THEN '~'
      WHEN 'monospace' THEN '```' ELSE '' END;
    content := '[]'::jsonb;
    IF position_counter > 0 THEN content := content || jsonb_build_array(jsonb_build_object('id','legacy_sep_'||position_counter,'type','text','text',E'\n\n')); END IF;
    IF marker_open <> '' THEN content := content || jsonb_build_array(jsonb_build_object('id','legacy_open_'||position_counter,'type','text','text',marker_open)); END IF;
    content := content || jsonb_build_array(node);
    IF marker_close <> '' THEN content := content || jsonb_build_array(jsonb_build_object('id','legacy_close_'||position_counter,'type','text','text',marker_close)); END IF;

    FOR c IN SELECT value FROM jsonb_array_elements(COALESCE(b->'conditions','[]'::jsonb)) WITH ORDINALITY ORDER BY ordinality DESC
    LOOP
      condition_field := CASE c->>'field'
        WHEN 'price' THEN 'preco' WHEN 'original_price' THEN 'preco_original'
        WHEN 'discount' THEN 'desconto' WHEN 'coupon' THEN 'cupom' WHEN 'coupon_link' THEN 'coupon_link'
        WHEN 'free_shipping' THEN 'frete_gratis' ELSE 'marketplace' END;
      condition_operator := COALESCE(c->>'operator','exists');
      condition_value := c->'value';
      content := jsonb_build_array(jsonb_build_object(
        'id','legacy_if_'||position_counter||'_'||condition_field,
        'type','conditional',
        'condition', jsonb_strip_nulls(jsonb_build_object('field',condition_field,'operator',condition_operator,'value',condition_value)),
        'then',content,'else','[]'::jsonb
      ));
    END LOOP;
    nodes := nodes || content;
    position_counter := position_counter + 1;
  END LOOP;
  RETURN jsonb_build_object('version', 1, 'nodes', nodes);
END $$;

UPDATE public.cta_templates
SET
  legacy_final_cta = COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(COALESCE(blocks,'[]'::jsonb)) WHERE value->>'key' = 'cta'), '[]'::jsonb),
  legacy_unconverted_blocks = COALESCE((SELECT jsonb_agg(value) FROM jsonb_array_elements(COALESCE(blocks,'[]'::jsonb)) WHERE COALESCE(value->>'key','') NOT IN ('opening','product','price','original_price','discount','coupon','coupon_link','affiliate_link','marketplace','free_shipping','cta')), '[]'::jsonb),
  canonical_template = COALESCE(canonical_template, public.promofy_legacy_blocks_to_canonical(blocks)),
  editor_mode = COALESCE(editor_mode, 'blocks')
WHERE canonical_template IS NULL OR legacy_final_cta = '[]'::jsonb;

-- O único template oficial é promovido para o exemplo completo com else e links independentes.
UPDATE public.cta_templates SET
  canonical_template = $json${
    "version":1,
    "nodes":[
      {"id":"demo_cta","type":"cta"},{"id":"demo_1","type":"text","text":"\n\n*"},{"id":"demo_product","type":"variable","key":"produto"},{"id":"demo_2","type":"text","text":"*\n\n"},
      {"id":"demo_price_if","type":"conditional","condition":{"field":"preco_original","operator":"exists"},"then":[{"id":"demo_3","type":"text","text":"~DE "},{"id":"demo_old_price","type":"variable","key":"preco_original"},{"id":"demo_4","type":"text","text":"~\n*POR "},{"id":"demo_price","type":"variable","key":"preco"},{"id":"demo_5","type":"text","text":"*"}],"else":[{"id":"demo_6","type":"text","text":"*POR "},{"id":"demo_price_else","type":"variable","key":"preco"},{"id":"demo_7","type":"text","text":"*"}]},
      {"id":"demo_8","type":"text","text":"\n\n"},{"id":"demo_coupon_if","type":"conditional","condition":{"field":"cupom","operator":"exists"},"then":[{"id":"demo_9","type":"text","text":"🎟️ Cupom: *"},{"id":"demo_coupon","type":"variable","key":"cupom"},{"id":"demo_10","type":"text","text":"*"}],"else":[]},
      {"id":"demo_11","type":"text","text":"\n\n"},{"id":"demo_coupon_link_if","type":"conditional","condition":{"field":"coupon_link","operator":"exists"},"then":[{"id":"demo_12","type":"text","text":"👉 Pegue o cupom:\n"},{"id":"demo_coupon_link","type":"variable","key":"coupon_link"}],"else":[]},
      {"id":"demo_13","type":"text","text":"\n\n👉 Produto:\n"},{"id":"demo_affiliate","type":"variable","key":"affiliate_link"}
    ]
  }$json$::jsonb,
  template_dsl = E'{cta_ia}\n\n*{produto}*\n\n{if preco_original}~DE {preco_original}~\n*POR {preco}*{else}*POR {preco}*{/if}\n\n{if cupom}🎟️ Cupom: *{cupom}*{/if}\n\n{if coupon_link}👉 Pegue o cupom:\n{coupon_link}{/if}\n\n👉 Produto:\n{affiliate_link}',
  editor_mode = 'blocks'
WHERE official_key = 'promofy_demo';

-- Mantém o ponteiro denormalizado do perfil alinhado ao template padrão.
-- O fallback do runtime continua funcionando mesmo em dados legados sem ponteiro.
UPDATE public.cta_profiles AS p
SET default_template_id = chosen.id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (user_id) user_id, id
  FROM public.cta_templates
  WHERE active = TRUE
  ORDER BY user_id, is_default DESC, created_at ASC
) AS chosen
WHERE p.user_id = chosen.user_id
  AND p.default_template_id IS DISTINCT FROM chosen.id;

ALTER TABLE public.cta_templates ALTER COLUMN canonical_template SET NOT NULL;
ALTER TABLE public.cta_templates ALTER COLUMN template_dsl SET DEFAULT '';
UPDATE public.cta_templates SET template_dsl = '' WHERE template_dsl IS NULL;
ALTER TABLE public.cta_templates ALTER COLUMN template_dsl SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.cta_training_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_content TEXT NOT NULL,
  char_count INTEGER NOT NULL CHECK (char_count BETWEEN 1 AND 1000000),
  chunk_count INTEGER NOT NULL CHECK (chunk_count > 0),
  status TEXT NOT NULL CHECK (status IN ('analyzing','review','applied','failed','reset')),
  interpretation JSONB,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cta_training_sources_user_created_idx
  ON public.cta_training_sources(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cta_memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.cta_profiles(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.cta_training_sources(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('instruction','positive_example','negative_example','reference','feedback','comparison','correction','meta_feedback')),
  scope TEXT NOT NULL CHECK (scope IN ('persistent','conditional','exception','one_off')),
  semantic_text TEXT NOT NULL CHECK (length(semantic_text) BETWEEN 1 AND 5000),
  condition JSONB NOT NULL DEFAULT '{}'::jsonb,
  polarity TEXT NOT NULL CHECK (polarity IN ('positive','negative','neutral')),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  supersedes_item_id UUID REFERENCES public.cta_memory_items(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cta_memory_items_retrieval_idx
  ON public.cta_memory_items(user_id, active, priority DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cta_memory_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.cta_profiles(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.cta_training_sources(id) ON DELETE SET NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  memory_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, version)
);
CREATE INDEX IF NOT EXISTS cta_memory_versions_user_version_idx
  ON public.cta_memory_versions(user_id, version DESC);

ALTER TABLE public.cta_training_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_memory_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cta_training_sources_owner ON public.cta_training_sources;
CREATE POLICY cta_training_sources_owner ON public.cta_training_sources FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS cta_memory_items_owner ON public.cta_memory_items;
CREATE POLICY cta_memory_items_owner ON public.cta_memory_items FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS cta_memory_versions_owner ON public.cta_memory_versions;
CREATE POLICY cta_memory_versions_owner ON public.cta_memory_versions FOR SELECT USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_cta_semantic_memory_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cta_profiles p WHERE p.id = NEW.profile_id AND p.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH';
  END IF;
  IF NEW.source_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cta_training_sources s WHERE s.id = NEW.source_id AND s.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'CTA_TRAINING_SOURCE_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_cta_memory_items_owner ON public.cta_memory_items;
CREATE TRIGGER validate_cta_memory_items_owner BEFORE INSERT OR UPDATE ON public.cta_memory_items FOR EACH ROW EXECUTE FUNCTION public.validate_cta_semantic_memory_owner();
DROP TRIGGER IF EXISTS validate_cta_memory_versions_owner ON public.cta_memory_versions;
CREATE TRIGGER validate_cta_memory_versions_owner BEFORE INSERT OR UPDATE ON public.cta_memory_versions FOR EACH ROW EXECUTE FUNCTION public.validate_cta_semantic_memory_owner();

CREATE OR REPLACE FUNCTION public.apply_cta_training_memory(
  p_user_id UUID,
  p_profile_id UUID,
  p_source_id UUID,
  p_items JSONB,
  p_conflicts JSONB,
  p_summary JSONB
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item JSONB;
  conflict JSONB;
  next_version INTEGER;
  inserted_id UUID;
  prior_id UUID;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 2000 THEN RAISE EXCEPTION 'CTA_TRAINING_OUTPUT_TOO_LARGE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_profiles WHERE id = p_profile_id AND user_id = p_user_id) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_training_sources WHERE id = p_source_id AND user_id = p_user_id AND status = 'review' FOR UPDATE) THEN RAISE EXCEPTION 'CTA_TRAINING_REVIEW_NOT_FOUND'; END IF;

  FOR conflict IN SELECT value FROM jsonb_array_elements(COALESCE(p_conflicts,'[]'::jsonb)) LOOP
    SELECT id INTO prior_id FROM public.cta_memory_items
      WHERE user_id = p_user_id AND active AND lower(semantic_text) = lower(conflict->>'prior')
      ORDER BY priority DESC, created_at DESC LIMIT 1;
    IF prior_id IS NOT NULL THEN
      UPDATE public.cta_memory_items SET active = FALSE, updated_at = NOW(), metadata = metadata || jsonb_build_object('conflict_resolution', conflict->>'resolution') WHERE id = prior_id;
    END IF;
    prior_id := NULL;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.cta_memory_items(user_id,profile_id,source_id,kind,scope,semantic_text,condition,polarity,priority,active,metadata)
    VALUES(p_user_id,p_profile_id,p_source_id,item->>'kind',item->>'scope',item->>'semanticText',COALESCE(item->'condition','{}'::jsonb),item->>'polarity',LEAST(100,GREATEST(1,COALESCE((item->>'priority')::INTEGER,50))),TRUE,'{}'::jsonb)
    RETURNING id INTO inserted_id;
  END LOOP;

  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM public.cta_memory_versions WHERE profile_id = p_profile_id;
  INSERT INTO public.cta_memory_versions(user_id,profile_id,source_id,version,summary,memory_snapshot)
  SELECT p_user_id,p_profile_id,p_source_id,next_version,COALESCE(p_summary,'[]'::jsonb),COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.priority DESC,m.created_at), '[]'::jsonb)
  FROM public.cta_memory_items m WHERE m.user_id = p_user_id AND m.active;
  UPDATE public.cta_training_sources SET status='applied',updated_at=NOW() WHERE id=p_source_id AND user_id=p_user_id;
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW() WHERE id=p_profile_id AND user_id=p_user_id;
  RETURN next_version;
END $$;

CREATE OR REPLACE FUNCTION public.deactivate_cta_memory_item(p_user_id UUID, p_item_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_uuid UUID; next_version INTEGER;
BEGIN
  UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW()
    WHERE id=p_item_id AND user_id=p_user_id AND active RETURNING profile_id INTO profile_uuid;
  IF profile_uuid IS NULL THEN RETURN FALSE; END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM public.cta_memory_versions WHERE profile_id=profile_uuid;
  INSERT INTO public.cta_memory_versions(user_id,profile_id,version,summary,memory_snapshot)
  SELECT p_user_id,profile_uuid,next_version,jsonb_build_array('Memória removida pelo usuário.'),COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.priority DESC,m.created_at),'[]'::jsonb)
  FROM public.cta_memory_items m WHERE m.user_id=p_user_id AND m.active;
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW() WHERE id=profile_uuid AND user_id=p_user_id;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.record_cta_conversation_memory(p_user_id UUID, p_profile_id UUID, p_items JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item JSONB; next_version INTEGER;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'CTA_ASSISTANT_OUTPUT_TOO_LARGE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_profiles WHERE id=p_profile_id AND user_id=p_user_id FOR UPDATE) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW()
      WHERE user_id=p_user_id AND active AND lower(semantic_text)=lower(item->>'semanticText');
    INSERT INTO public.cta_memory_items(user_id,profile_id,kind,scope,semantic_text,condition,polarity,priority,active,metadata)
    VALUES(p_user_id,p_profile_id,item->>'kind',item->>'scope',item->>'semanticText',COALESCE(item->'condition','{}'::jsonb),item->>'polarity',LEAST(100,GREATEST(1,COALESCE((item->>'priority')::INTEGER,90))),TRUE,jsonb_build_object('source','conversation'));
  END LOOP;
  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM public.cta_memory_versions WHERE profile_id=p_profile_id;
  INSERT INTO public.cta_memory_versions(user_id,profile_id,version,summary,memory_snapshot)
  SELECT p_user_id,p_profile_id,next_version,'[]'::jsonb,COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.priority DESC,m.created_at),'[]'::jsonb)
  FROM public.cta_memory_items m WHERE m.user_id=p_user_id AND m.active;
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW() WHERE id=p_profile_id AND user_id=p_user_id;
  RETURN next_version;
END $$;

CREATE OR REPLACE FUNCTION public.reset_cta_memory(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_record public.cta_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_record FROM public.cta_profiles WHERE user_id=p_user_id FOR UPDATE;
  IF profile_record.id IS NULL THEN RETURN; END IF;
  DELETE FROM public.cta_feedback WHERE user_id=p_user_id;
  DELETE FROM public.cta_examples WHERE user_id=p_user_id;
  DELETE FROM public.cta_inferred_preferences WHERE user_id=p_user_id;
  DELETE FROM public.cta_rules WHERE user_id=p_user_id;
  DELETE FROM public.cta_conversations WHERE user_id=p_user_id;
  DELETE FROM public.cta_profile_versions WHERE user_id=p_user_id;
  DELETE FROM public.cta_memory_versions WHERE user_id=p_user_id;
  DELETE FROM public.cta_memory_items WHERE user_id=p_user_id;
  UPDATE public.cta_training_sources SET status='reset',interpretation=NULL,updated_at=NOW() WHERE user_id=p_user_id;
  UPDATE public.cta_profiles SET tone='natural',length='medium',emoji_level='moderate',repetition_mode='balanced',structured_preferences='{}'::jsonb,natural_language_preferences=NULL,memory_epoch=memory_epoch+1,version=version+1,updated_at=NOW() WHERE id=profile_record.id;
END $$;

REVOKE ALL ON FUNCTION public.apply_cta_training_memory(UUID,UUID,UUID,JSONB,JSONB,JSONB), public.deactivate_cta_memory_item(UUID,UUID), public.record_cta_conversation_memory(UUID,UUID,JSONB), public.reset_cta_memory(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cta_training_memory(UUID,UUID,UUID,JSONB,JSONB,JSONB), public.deactivate_cta_memory_item(UUID,UUID), public.record_cta_conversation_memory(UUID,UUID,JSONB), public.reset_cta_memory(UUID) TO service_role;

DROP FUNCTION IF EXISTS public.promofy_legacy_blocks_to_canonical(JSONB);
