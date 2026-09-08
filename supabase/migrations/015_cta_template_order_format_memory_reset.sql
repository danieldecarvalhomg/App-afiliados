-- AfiliHub 3E adjustment: empty templates, one official demo and atomic CTA memory reset.
ALTER TABLE public.cta_templates DROP CONSTRAINT IF EXISTS cta_templates_blocks_check;
ALTER TABLE public.cta_templates ADD CONSTRAINT cta_templates_blocks_check
  CHECK (jsonb_typeof(blocks) = 'array' AND jsonb_array_length(blocks) BETWEEN 0 AND 30);

ALTER TABLE public.cta_profiles ADD COLUMN IF NOT EXISTS memory_epoch INTEGER NOT NULL DEFAULT 1 CHECK (memory_epoch > 0);

-- Remove only obsolete AfiliHub seeds. User-created templates have official_key IS NULL and are preserved.
DELETE FROM public.cta_templates
WHERE official_key IN ('conversational','direct','compact','discount_focus','coupon_focus');

CREATE OR REPLACE FUNCTION public.reset_cta_memory(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE profile_record public.cta_profiles%ROWTYPE;
BEGIN
  SELECT * INTO profile_record FROM public.cta_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF profile_record.id IS NULL THEN RETURN; END IF;

  DELETE FROM public.cta_feedback WHERE user_id = p_user_id;
  DELETE FROM public.cta_examples WHERE user_id = p_user_id;
  DELETE FROM public.cta_inferred_preferences WHERE user_id = p_user_id;
  DELETE FROM public.cta_rules WHERE user_id = p_user_id;
  DELETE FROM public.cta_conversations WHERE user_id = p_user_id;
  DELETE FROM public.cta_profile_versions WHERE user_id = p_user_id;

  UPDATE public.cta_profiles SET
    tone = 'natural',
    length = 'medium',
    emoji_level = 'moderate',
    repetition_mode = 'balanced',
    structured_preferences = '{}'::jsonb,
    natural_language_preferences = NULL,
    memory_epoch = memory_epoch + 1,
    version = version + 1,
    updated_at = NOW()
  WHERE id = profile_record.id;

  -- History remains available for audit, but retrieval is cut off by removing
  -- all preference sources and advancing the profile memory epoch.
END $$;

REVOKE ALL ON FUNCTION public.reset_cta_memory(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_cta_memory(UUID) TO service_role;
