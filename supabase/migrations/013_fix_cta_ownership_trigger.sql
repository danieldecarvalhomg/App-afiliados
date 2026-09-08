-- AfiliHub 3E hotfix — cada ramo acessa apenas campos existentes na tabela do trigger.
CREATE OR REPLACE FUNCTION public.validate_cta_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'cta_blueprints' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cta_profiles profile
      WHERE profile.id = NEW.profile_id
        AND profile.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'cta_blueprint_versions' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.cta_blueprints blueprint
      WHERE blueprint.id = NEW.blueprint_id
        AND blueprint.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'CTA_BLUEPRINT_OWNER_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'cta_feedback' THEN
    IF NEW.generation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.cta_history generation
      WHERE generation.id = NEW.generation_id
        AND generation.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'CTA_GENERATION_OWNER_MISMATCH';
    END IF;
  ELSIF TG_TABLE_NAME = 'cta_history' THEN
    IF NEW.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.products product
      WHERE product.id = NEW.product_id
        AND product.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'CTA_PRODUCT_OWNER_MISMATCH';
    END IF;

    IF NEW.cta_profile_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.cta_profiles profile
      WHERE profile.id = NEW.cta_profile_id
        AND profile.user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'CTA_PROFILE_OWNER_MISMATCH';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

