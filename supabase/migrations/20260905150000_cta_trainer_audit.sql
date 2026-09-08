-- Serialize memory mutations by profile before locking sources/items.
-- All changes below run in the same transaction as their version snapshot.
CREATE OR REPLACE FUNCTION public.apply_cta_training_memory(
  p_user_id UUID, p_profile_id UUID, p_source_id UUID,
  p_items JSONB, p_conflicts JSONB, p_summary JSONB
) RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item JSONB; conflict JSONB; next_version INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'CTA_TRAINING_OUTPUT_INVALID'; END IF;
  IF jsonb_array_length(p_items) > 2000 THEN RAISE EXCEPTION 'CTA_TRAINING_OUTPUT_TOO_LARGE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_profiles WHERE id=p_profile_id AND user_id=p_user_id FOR UPDATE) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_training_sources WHERE id=p_source_id AND user_id=p_user_id AND status='review' FOR UPDATE) THEN RAISE EXCEPTION 'CTA_TRAINING_REVIEW_NOT_FOUND'; END IF;

  FOR conflict IN SELECT value FROM jsonb_array_elements(COALESCE(p_conflicts,'[]'::jsonb)) LOOP
    -- Uma regra geral pode coexistir com uma exceção. Só arquive quando a
    -- revisão propõe a substituição e não preserva explicitamente a anterior.
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE lower(i->>'semanticText')=lower(conflict->>'replacement'))
       AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) i WHERE lower(i->>'semanticText')=lower(conflict->>'prior')) THEN
      UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW(),metadata=metadata||jsonb_build_object('conflict_resolution',conflict->>'resolution')
        WHERE user_id=p_user_id AND active AND lower(semantic_text)=lower(conflict->>'prior');
    END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF item->>'scope' = 'one_off' THEN CONTINUE; END IF;
    UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW()
      WHERE user_id=p_user_id AND active AND lower(semantic_text)=lower(item->>'semanticText')
        AND scope=item->>'scope' AND condition=COALESCE(item->'condition','{}'::jsonb);
    INSERT INTO public.cta_memory_items(user_id,profile_id,source_id,kind,scope,semantic_text,condition,polarity,priority,active,metadata)
    VALUES(p_user_id,p_profile_id,p_source_id,item->>'kind',item->>'scope',item->>'semanticText',COALESCE(item->'condition','{}'::jsonb),item->>'polarity',LEAST(100,GREATEST(1,COALESCE((item->>'priority')::INTEGER,50))),TRUE,'{}'::jsonb);
  END LOOP;
  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM public.cta_memory_versions WHERE profile_id=p_profile_id;
  INSERT INTO public.cta_memory_versions(user_id,profile_id,source_id,version,summary,memory_snapshot)
  SELECT p_user_id,p_profile_id,p_source_id,next_version,COALESCE(p_summary,'[]'::jsonb),COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.priority DESC,m.created_at),'[]'::jsonb)
    FROM public.cta_memory_items m WHERE m.user_id=p_user_id AND m.active;
  UPDATE public.cta_training_sources SET status='applied',updated_at=NOW() WHERE id=p_source_id AND user_id=p_user_id;
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW() WHERE id=p_profile_id AND user_id=p_user_id;
  RETURN next_version;
END $$;

CREATE OR REPLACE FUNCTION public.deactivate_cta_memory_item(p_user_id UUID,p_item_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_uuid UUID; next_version INTEGER; removed public.cta_memory_items%ROWTYPE;
BEGIN
  SELECT profile_id INTO profile_uuid FROM public.cta_memory_items WHERE id=p_item_id AND user_id=p_user_id AND active;
  IF profile_uuid IS NULL THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.cta_profiles WHERE id=profile_uuid AND user_id=p_user_id FOR UPDATE;
  UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW()
    WHERE id=p_item_id AND user_id=p_user_id AND active RETURNING * INTO removed;
  IF removed.id IS NULL THEN RETURN FALSE; END IF;
  -- A conversa também mantém regras determinísticas. Retire a cópia equivalente.
  UPDATE public.cta_rules SET active=FALSE,archived_at=NOW(),updated_at=NOW()
    WHERE user_id=p_user_id AND active AND lower(value)=lower(removed.semantic_text)
      AND scope=removed.scope AND condition=COALESCE(removed.condition->'conditions','[]'::jsonb);
  SELECT COALESCE(MAX(version),0)+1 INTO next_version FROM public.cta_memory_versions WHERE profile_id=profile_uuid;
  INSERT INTO public.cta_memory_versions(user_id,profile_id,version,summary,memory_snapshot)
  SELECT p_user_id,profile_uuid,next_version,jsonb_build_array('Memória removida pelo usuário.'),COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.priority DESC,m.created_at),'[]'::jsonb)
    FROM public.cta_memory_items m WHERE m.user_id=p_user_id AND m.active;
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW(),
    natural_language_preferences=CASE WHEN lower(natural_language_preferences)=lower(removed.semantic_text) THEN NULL ELSE natural_language_preferences END
    WHERE id=profile_uuid AND user_id=p_user_id;
  RETURN TRUE;
END $$;

CREATE OR REPLACE FUNCTION public.record_cta_conversation_memory(p_user_id UUID,p_profile_id UUID,p_items JSONB)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item JSONB; next_version INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'CTA_ASSISTANT_OUTPUT_INVALID'; END IF;
  IF jsonb_array_length(p_items)>100 THEN RAISE EXCEPTION 'CTA_ASSISTANT_OUTPUT_TOO_LARGE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cta_profiles WHERE id=p_profile_id AND user_id=p_user_id FOR UPDATE) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF item->>'scope'='one_off' THEN CONTINUE; END IF;
    UPDATE public.cta_memory_items SET active=FALSE,updated_at=NOW()
      WHERE user_id=p_user_id AND active AND lower(semantic_text)=lower(item->>'semanticText')
        AND scope=item->>'scope' AND condition=COALESCE(item->'condition','{}'::jsonb);
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

-- Feedback/manual rules participate in cache and saved-generation invalidation.
CREATE OR REPLACE FUNCTION public.invalidate_cta_learning_version()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.cta_profiles SET version=version+1,updated_at=NOW()
    WHERE user_id=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS invalidate_cta_examples_version ON public.cta_examples;
CREATE TRIGGER invalidate_cta_examples_version AFTER INSERT OR UPDATE OR DELETE ON public.cta_examples FOR EACH ROW EXECUTE FUNCTION public.invalidate_cta_learning_version();
DROP TRIGGER IF EXISTS invalidate_cta_rules_version ON public.cta_rules;
CREATE TRIGGER invalidate_cta_rules_version AFTER INSERT OR UPDATE OR DELETE ON public.cta_rules FOR EACH ROW EXECUTE FUNCTION public.invalidate_cta_learning_version();
REVOKE ALL ON FUNCTION public.invalidate_cta_learning_version() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.apply_cta_training_memory(UUID,UUID,UUID,JSONB,JSONB,JSONB),public.deactivate_cta_memory_item(UUID,UUID),public.record_cta_conversation_memory(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cta_training_memory(UUID,UUID,UUID,JSONB,JSONB,JSONB),public.deactivate_cta_memory_item(UUID,UUID),public.record_cta_conversation_memory(UUID,UUID,JSONB) TO service_role;
