BEGIN;

CREATE TABLE IF NOT EXISTS public.consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_event_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('TERMS_AND_PRIVACY', 'COOKIE_PREFERENCES')),
  document_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS consent_events_user_created_idx
  ON public.consent_events(user_id, created_at DESC);
ALTER TABLE public.consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_events_owner_read ON public.consent_events;
CREATE POLICY consent_events_owner_read ON public.consent_events
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS consent_events_owner_insert ON public.consent_events;
CREATE POLICY consent_events_owner_insert ON public.consent_events
  FOR INSERT WITH CHECK (user_id = auth.uid());
REVOKE UPDATE, DELETE ON public.consent_events FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_signup_legal_consent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE((NEW.raw_user_meta_data->>'accepted_terms')::BOOLEAN, FALSE) THEN
    INSERT INTO public.consent_events(user_id, event_type, document_versions, preferences)
    VALUES (
      NEW.id,
      'TERMS_AND_PRIVACY',
      jsonb_build_object(
        'terms', COALESCE(NEW.raw_user_meta_data->>'terms_version', 'unknown'),
        'privacy', COALESCE(NEW.raw_user_meta_data->>'privacy_version', 'unknown')
      ),
      '{"accepted": true}'::jsonb
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_legal_consent ON auth.users;
CREATE TRIGGER on_auth_user_legal_consent
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.record_signup_legal_consent();

REVOKE ALL ON FUNCTION public.record_signup_legal_consent() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_signup_legal_consent() TO service_role;

COMMIT;
