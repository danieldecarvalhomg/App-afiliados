-- AfiliHub — sessão não oficial do Portal de Afiliados Mercado Livre.

CREATE TABLE IF NOT EXISTS public.mercado_livre_affiliate_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_account_id UUID NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  encrypted_storage_state JSONB,
  connection_status TEXT NOT NULL DEFAULT 'CONNECTING' CHECK (connection_status IN (
    'CONNECTED','NEEDS_REAUTH','CAPTCHA_REQUIRED','TWO_FACTOR_REQUIRED','DEGRADED',
    'TEMPORARILY_UNAVAILABLE','PORTAL_CHANGED','ERROR','CONNECTING','DISCONNECTED'
  )),
  account_label TEXT,
  last_verified_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  adapter_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id),
  UNIQUE(affiliate_account_id)
);

CREATE TABLE IF NOT EXISTS public.mercado_livre_affiliate_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_account_id UUID NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  operation_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  affiliate_url TEXT,
  item_id TEXT,
  tracking_label TEXT,
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  error_code TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  adapter_version INTEGER NOT NULL DEFAULT 1,
  is_canary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ml_affiliate_operations_user_created_idx
  ON public.mercado_livre_affiliate_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ml_affiliate_operations_health_idx
  ON public.mercado_livre_affiliate_operations(created_at DESC, status, error_code);
CREATE UNIQUE INDEX IF NOT EXISTS ml_affiliate_operations_cache_key
  ON public.mercado_livre_affiliate_operations(user_id, operation_key)
  WHERE status='success' AND affiliate_url IS NOT NULL AND is_canary=FALSE;

CREATE TABLE IF NOT EXISTS public.mercado_livre_affiliate_health (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  health_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (health_status IN ('HEALTHY','DEGRADED','DOWN','UNKNOWN')),
  circuit_state TEXT NOT NULL DEFAULT 'CLOSED' CHECK (circuit_state IN ('CLOSED','OPEN','HALF_OPEN')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  circuit_opened_at TIMESTAMPTZ,
  last_check_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  adapter_version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO public.mercado_livre_affiliate_health(singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.mercado_livre_affiliate_locks (
  affiliate_account_id UUID PRIMARY KEY REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  locked_until TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.mercado_livre_affiliate_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_affiliate_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_affiliate_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_affiliate_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ml_affiliate_sessions_owner_read" ON public.mercado_livre_affiliate_sessions;
CREATE POLICY "ml_affiliate_sessions_owner_read" ON public.mercado_livre_affiliate_sessions FOR SELECT TO authenticated USING (user_id=auth.uid());
DROP POLICY IF EXISTS "ml_affiliate_operations_owner_read" ON public.mercado_livre_affiliate_operations;
CREATE POLICY "ml_affiliate_operations_owner_read" ON public.mercado_livre_affiliate_operations FOR SELECT TO authenticated USING (user_id=auth.uid());

REVOKE ALL ON public.mercado_livre_affiliate_sessions FROM anon, authenticated;
REVOKE ALL ON public.mercado_livre_affiliate_operations FROM anon, authenticated;
REVOKE ALL ON public.mercado_livre_affiliate_health FROM anon, authenticated;
REVOKE ALL ON public.mercado_livre_affiliate_locks FROM anon, authenticated;
GRANT SELECT (id,user_id,affiliate_account_id,connection_status,account_label,last_verified_at,last_success_at,last_error_code,last_error_at,adapter_version,created_at,updated_at)
  ON public.mercado_livre_affiliate_sessions TO authenticated;
GRANT SELECT (id,user_id,affiliate_account_id,status,error_code,latency_ms,adapter_version,is_canary,created_at)
  ON public.mercado_livre_affiliate_operations TO authenticated;

CREATE OR REPLACE FUNCTION public.acquire_ml_affiliate_lock(
  p_account_id UUID, p_owner_id TEXT, p_lock_seconds INTEGER DEFAULT 90
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.mercado_livre_affiliate_locks(affiliate_account_id,owner_id,locked_until)
  VALUES(p_account_id,p_owner_id,NOW()+make_interval(secs=>p_lock_seconds))
  ON CONFLICT(affiliate_account_id) DO UPDATE SET owner_id=EXCLUDED.owner_id,
    locked_until=EXCLUDED.locked_until,updated_at=NOW()
  WHERE public.mercado_livre_affiliate_locks.locked_until < NOW()
     OR public.mercado_livre_affiliate_locks.owner_id=p_owner_id;
  RETURN EXISTS(SELECT 1 FROM public.mercado_livre_affiliate_locks
    WHERE affiliate_account_id=p_account_id AND owner_id=p_owner_id AND locked_until>NOW());
END $$;

CREATE OR REPLACE FUNCTION public.release_ml_affiliate_lock(p_account_id UUID,p_owner_id TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  DELETE FROM public.mercado_livre_affiliate_locks WHERE affiliate_account_id=p_account_id AND owner_id=p_owner_id;
$$;
REVOKE ALL ON FUNCTION public.acquire_ml_affiliate_lock(UUID,TEXT,INTEGER) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.release_ml_affiliate_lock(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_ml_affiliate_lock(UUID,TEXT,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_ml_affiliate_lock(UUID,TEXT) TO service_role;
