BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS locale TEXT NOT NULL DEFAULT 'pt-BR';

CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'LOGIN_SUCCESS','LOGIN_FAILED','PASSWORD_CHANGED','PASSWORD_RESET',
    'EMAIL_CHANGED','MFA_ENABLED','MFA_DISABLED','SESSION_REVOKED',
    'ACCOUNT_DELETION_REQUESTED','ACCOUNT_DELETED'
  )),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS security_events_user_created_idx
  ON public.security_events(user_id, created_at DESC);
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS security_events_owner_read ON public.security_events;
CREATE POLICY security_events_owner_read ON public.security_events
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS security_events_owner_insert ON public.security_events;
CREATE POLICY security_events_owner_insert ON public.security_events
  FOR INSERT WITH CHECK (user_id = auth.uid());
REVOKE UPDATE, DELETE ON public.security_events FROM authenticated;

COMMIT;
