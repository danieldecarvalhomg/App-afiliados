-- Reconcile o modelo multi-tenant com o schema ativo do projeto.
-- O baseline antigo recriou public.profiles sem current_account_id e
-- substituiu o trigger por uma versão que não criava account/membership.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_account_id UUID
  REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_current_account
  ON public.profiles(current_account_id);

-- Backfill idempotente para usuários já existentes.
DO $$
DECLARE
  u RECORD;
  account_uuid UUID;
BEGIN
  FOR u IN
    SELECT au.id,
           COALESCE(
             NULLIF(au.raw_user_meta_data->>'full_name', ''),
             NULLIF(split_part(COALESCE(au.email, ''), '@', 1), ''),
             'AfiliHub'
           ) AS display_name
    FROM auth.users au
  LOOP
    SELECT am.account_id INTO account_uuid
    FROM public.account_members am
    WHERE am.user_id = u.id
    ORDER BY am.created_at
    LIMIT 1;

    IF account_uuid IS NULL THEN
      INSERT INTO public.accounts(name)
      VALUES (u.display_name || '''s workspace')
      RETURNING id INTO account_uuid;

      INSERT INTO public.account_members(account_id, user_id, role)
      VALUES (account_uuid, u.id, 'owner')
      ON CONFLICT (account_id, user_id) DO NOTHING;
    END IF;

    UPDATE public.profiles
    SET current_account_id = account_uuid,
        updated_at = NOW()
    WHERE id = u.id
      AND current_account_id IS DISTINCT FROM account_uuid;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_account_id UUID;
  display_name TEXT;
BEGIN
  display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'AfiliHub'
  );

  INSERT INTO public.accounts(name)
  VALUES (display_name || '''s workspace')
  RETURNING id INTO new_account_id;

  INSERT INTO public.profiles(id, current_account_id, full_name)
  VALUES (NEW.id, new_account_id, display_name)
  ON CONFLICT (id) DO UPDATE
  SET current_account_id = COALESCE(public.profiles.current_account_id, EXCLUDED.current_account_id),
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      updated_at = NOW();

  INSERT INTO public.account_members(account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner')
  ON CONFLICT (account_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
