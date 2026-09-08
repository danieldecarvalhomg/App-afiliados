-- Security hardening for legacy helpers and the internal automation worker.
-- Keep account helper functions callable by signed-in users because RLS policies
-- depend on them. Backend/worker functions remain service-role only.

BEGIN;

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.user_belongs_to_account(UUID) SET search_path = public;
ALTER FUNCTION public.current_user_account_id() SET search_path = public;
ALTER FUNCTION public.get_dashboard_stats(UUID) SET search_path = public;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.user_belongs_to_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_account(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_user_account_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_account_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_internal_automation(UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_internal_automation(TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_internal_automation(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_internal_automation(UUID, TEXT, TEXT, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_internal_automation(UUID, TEXT, TEXT, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_internal_automation(TEXT, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_internal_automation(UUID, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_internal_automation(UUID, TEXT, TEXT, TIMESTAMPTZ)
  TO service_role;

COMMIT;
