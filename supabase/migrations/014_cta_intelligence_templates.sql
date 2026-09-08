-- AfiliHub 3E definitivo — Templates & Copy como fonte estrutural.
CREATE TABLE IF NOT EXISTS public.cta_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  blocks JSONB NOT NULL CHECK (jsonb_typeof(blocks) = 'array' AND jsonb_array_length(blocks) BETWEEN 1 AND 30),
  official_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, official_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS cta_templates_default_uidx ON public.cta_templates(user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS cta_templates_user_active_idx ON public.cta_templates(user_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.cta_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.cta_templates(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  template_snapshot JSONB NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('system','manual','assistant','undo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (template_id, version)
);
CREATE INDEX IF NOT EXISTS cta_template_versions_lookup_idx ON public.cta_template_versions(user_id, template_id, version DESC);

CREATE TABLE IF NOT EXISTS public.cta_copy_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  copy_type TEXT NOT NULL CHECK (copy_type IN ('opening','cta','transition','coupon','discount','closing','notice','custom')),
  mode TEXT NOT NULL CHECK (mode IN ('AI_GENERATED','EXACT_TEXT')),
  objective TEXT,
  instruction TEXT,
  exact_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((mode = 'AI_GENERATED' AND objective IS NOT NULL AND length(objective) > 0) OR (mode = 'EXACT_TEXT' AND exact_text IS NOT NULL AND length(exact_text) > 0))
);
CREATE INDEX IF NOT EXISTS cta_copy_library_user_type_idx ON public.cta_copy_library(user_id, copy_type, updated_at DESC);

ALTER TABLE public.cta_profiles ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES public.cta_templates(id) ON DELETE SET NULL;
ALTER TABLE public.cta_history ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.cta_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cta_history_template_idx ON public.cta_history(user_id, template_id, created_at DESC);

ALTER TABLE public.cta_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_copy_library ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cta_templates_owner ON public.cta_templates;
CREATE POLICY cta_templates_owner ON public.cta_templates FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS cta_template_versions_owner ON public.cta_template_versions;
CREATE POLICY cta_template_versions_owner ON public.cta_template_versions FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS cta_copy_library_owner ON public.cta_copy_library;
CREATE POLICY cta_copy_library_owner ON public.cta_copy_library FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_cta_template_version_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cta_templates template WHERE template.id = NEW.template_id AND template.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'CTA_TEMPLATE_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_cta_template_version_owner_trigger ON public.cta_template_versions;
CREATE TRIGGER validate_cta_template_version_owner_trigger BEFORE INSERT OR UPDATE ON public.cta_template_versions FOR EACH ROW EXECUTE FUNCTION public.validate_cta_template_version_owner();

CREATE OR REPLACE FUNCTION public.validate_cta_ownership()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'cta_blueprints' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cta_profiles profile WHERE profile.id = NEW.profile_id AND profile.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'cta_blueprint_versions' THEN
    IF NOT EXISTS (SELECT 1 FROM public.cta_blueprints blueprint WHERE blueprint.id = NEW.blueprint_id AND blueprint.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_BLUEPRINT_OWNER_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'cta_feedback' THEN
    IF NEW.generation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cta_history generation WHERE generation.id = NEW.generation_id AND generation.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_GENERATION_OWNER_MISMATCH'; END IF;
  ELSIF TG_TABLE_NAME = 'cta_history' THEN
    IF NEW.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products product WHERE product.id = NEW.product_id AND product.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_PRODUCT_OWNER_MISMATCH'; END IF;
    IF NEW.cta_profile_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cta_profiles profile WHERE profile.id = NEW.cta_profile_id AND profile.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH'; END IF;
    IF NEW.template_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cta_templates template WHERE template.id = NEW.template_id AND template.user_id = NEW.user_id) THEN RAISE EXCEPTION 'CTA_TEMPLATE_OWNER_MISMATCH'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_default_cta_template(p_user_id UUID, p_template_id UUID)
RETURNS SETOF public.cta_templates LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cta_templates WHERE id = p_template_id AND user_id = p_user_id) THEN RAISE EXCEPTION 'CTA_TEMPLATE_NOT_FOUND'; END IF;
  UPDATE public.cta_templates SET is_default = FALSE, updated_at = NOW() WHERE user_id = p_user_id AND is_default;
  UPDATE public.cta_templates SET is_default = TRUE, active = TRUE, updated_at = NOW() WHERE id = p_template_id AND user_id = p_user_id;
  UPDATE public.cta_profiles SET default_template_id = p_template_id, updated_at = NOW() WHERE user_id = p_user_id;
  RETURN QUERY SELECT * FROM public.cta_templates WHERE id = p_template_id AND user_id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.undo_cta_profile(p_user_id UUID)
RETURNS SETOF public.cta_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_profile public.cta_profiles%ROWTYPE; previous_snapshot JSONB;
BEGIN
  SELECT * INTO current_profile FROM public.cta_profiles WHERE user_id = p_user_id FOR UPDATE;
  IF current_profile.id IS NULL THEN RETURN; END IF;
  SELECT profile_snapshot INTO previous_snapshot FROM public.cta_profile_versions WHERE profile_id = current_profile.id AND version < current_profile.version ORDER BY version DESC LIMIT 1;
  IF previous_snapshot IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.cta_profiles SET
    tone = COALESCE(previous_snapshot->>'tone', tone),
    length = COALESCE(previous_snapshot->>'length', length),
    emoji_level = COALESCE(previous_snapshot->>'emojiLevel', emoji_level),
    repetition_mode = COALESCE(previous_snapshot->>'repetitionMode', repetition_mode),
    structured_preferences = COALESCE(previous_snapshot->'structuredPreferences', structured_preferences),
    natural_language_preferences = previous_snapshot->>'naturalLanguagePreferences',
    version = current_profile.version + 1,
    updated_at = NOW()
  WHERE id = current_profile.id RETURNING *;
END $$;

REVOKE ALL ON FUNCTION public.set_default_cta_template(UUID,UUID), public.undo_cta_profile(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_default_cta_template(UUID,UUID), public.undo_cta_profile(UUID) TO service_role;

