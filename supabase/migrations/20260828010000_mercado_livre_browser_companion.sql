-- AfiliHub Browser Companion — substitui a custódia server-side da sessão ML.

CREATE TABLE IF NOT EXISTS public.browser_companion_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  requested_name TEXT NOT NULL DEFAULT 'Chrome',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.browser_companion_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE','OFFLINE','OUTDATED','REVOKED','ERROR')),
  extension_version TEXT NOT NULL,
  adapter_version INTEGER NOT NULL CHECK (adapter_version >= 0),
  mercado_livre_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (mercado_livre_status IN (
    'READY','NEEDS_LOGIN','NEEDS_USER_ACTION','PORTAL_UNAVAILABLE','PORTAL_CHANGED','UNKNOWN'
  )),
  token_hash TEXT,
  token_expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS browser_companion_token_hash_unique
  ON public.browser_companion_instances(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS browser_companion_user_seen_idx
  ON public.browser_companion_instances(user_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.mercado_livre_companion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_account_id UUID NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  affiliate_conversion_id UUID REFERENCES public.affiliate_conversions(id) ON DELETE SET NULL,
  operation_key TEXT NOT NULL,
  source_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  tracking_label TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING','CLAIMED','PROCESSING','SUCCESS','FAILED','EXPIRED','NEEDS_USER_ACTION','CANCELLED'
  )),
  claimed_by UUID REFERENCES public.browser_companion_instances(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  result_url TEXT,
  item_id TEXT,
  error_code TEXT,
  step TEXT,
  page_type TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  adapter_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ml_companion_jobs_active_dedupe
  ON public.mercado_livre_companion_jobs(user_id,operation_key)
  WHERE status IN ('PENDING','CLAIMED','PROCESSING','SUCCESS');
CREATE INDEX IF NOT EXISTS ml_companion_jobs_claim_idx
  ON public.mercado_livre_companion_jobs(user_id,status,created_at)
  WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS ml_companion_jobs_metrics_idx
  ON public.mercado_livre_companion_jobs(created_at DESC,status,error_code);

-- Várias capturas equivalentes podem reutilizar o mesmo job/cache. Cada
-- conversão interessada é vinculada para que todas sejam liquidadas juntas.
CREATE TABLE IF NOT EXISTS public.mercado_livre_companion_job_conversions (
  job_id UUID NOT NULL REFERENCES public.mercado_livre_companion_jobs(id) ON DELETE CASCADE,
  conversion_id UUID NOT NULL REFERENCES public.affiliate_conversions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(job_id,conversion_id)
);
CREATE INDEX IF NOT EXISTS ml_companion_job_conversions_user_idx
  ON public.mercado_livre_companion_job_conversions(user_id,conversion_id);

CREATE TABLE IF NOT EXISTS public.mercado_livre_companion_health (
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
INSERT INTO public.mercado_livre_companion_health(singleton) VALUES (TRUE) ON CONFLICT DO NOTHING;

ALTER TABLE public.affiliate_conversions
  DROP CONSTRAINT IF EXISTS affiliate_conversions_status_check,
  ADD CONSTRAINT affiliate_conversions_status_check CHECK (status IN (
    'pending','resolving','resolved','converting','awaiting_companion','converted','invalid_url',
    'resolution_failed','conversion_failed','unsupported_platform','affiliate_account_not_configured'
  ));
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_affiliate_status_check,
  ADD CONSTRAINT products_affiliate_status_check CHECK (affiliate_status IN (
    'pending_url','pending','resolving','resolved','converting','awaiting_companion','converted','invalid_url',
    'resolution_failed','conversion_failed','unsupported_platform','affiliate_account_not_configured'
  ));

ALTER TABLE public.browser_companion_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.browser_companion_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_companion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_companion_job_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mercado_livre_companion_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.browser_companion_pairings FROM anon,authenticated;
REVOKE ALL ON public.browser_companion_instances FROM anon,authenticated;
REVOKE ALL ON public.mercado_livre_companion_jobs FROM anon,authenticated;
REVOKE ALL ON public.mercado_livre_companion_job_conversions FROM anon,authenticated;
REVOKE ALL ON public.mercado_livre_companion_health FROM anon,authenticated;

-- O claim é atômico, usa ownership derivado da instance e nunca aceita user_id do cliente.
CREATE OR REPLACE FUNCTION public.claim_ml_companion_job(
  p_instance_id UUID,
  p_lease_seconds INTEGER DEFAULT 90
) RETURNS SETOF public.mercado_livre_companion_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user_id UUID;
BEGIN
  SELECT user_id INTO v_user_id
  FROM public.browser_companion_instances
  WHERE id=p_instance_id
    AND status='ONLINE'
    AND revoked_at IS NULL
    AND token_expires_at>NOW()
    AND last_seen_at>NOW()-INTERVAL '60 seconds';
  IF v_user_id IS NULL THEN RETURN; END IF;

  UPDATE public.mercado_livre_companion_jobs
  SET status='PENDING',claimed_by=NULL,claimed_at=NULL,lease_expires_at=NULL,updated_at=NOW()
  WHERE user_id=v_user_id
    AND status IN ('CLAIMED','PROCESSING')
    AND lease_expires_at<NOW()
    AND expires_at>NOW();

  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.mercado_livre_companion_jobs
    WHERE user_id=v_user_id AND status='PENDING' AND expires_at>NOW()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.mercado_livre_companion_jobs jobs
  SET status='CLAIMED',claimed_by=p_instance_id,claimed_at=NOW(),
      lease_expires_at=NOW()+make_interval(secs=>GREATEST(30,LEAST(p_lease_seconds,180))),updated_at=NOW()
  FROM candidate
  WHERE jobs.id=candidate.id
  RETURNING jobs.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_ml_companion_job(UUID,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ml_companion_job(UUID,INTEGER) TO service_role;

-- Migração segura da tentativa anterior: elimina a custódia de cookies sem apagar
-- os registros históricos de operação que ainda servem para auditoria.
DO $$
BEGIN
  IF to_regclass('public.mercado_livre_affiliate_sessions') IS NOT NULL THEN
    UPDATE public.mercado_livre_affiliate_sessions
      SET encrypted_storage_state=NULL,connection_status='DISCONNECTED',
          last_error_code='MIGRATED_TO_BROWSER_COMPANION',last_error_at=NOW(),updated_at=NOW();
    COMMENT ON TABLE public.mercado_livre_affiliate_sessions IS
      'DEPRECATED: histórico da automação server-side. encrypted_storage_state foi limpo; não usar no caminho ativo.';
  END IF;
  IF to_regclass('public.mercado_livre_affiliate_locks') IS NOT NULL THEN
    DELETE FROM public.mercado_livre_affiliate_locks;
    COMMENT ON TABLE public.mercado_livre_affiliate_locks IS
      'DEPRECATED: locks da automação server-side; substituídos por claim_ml_companion_job.';
  END IF;
END $$;

-- A coluna que custodiava o storageState deixa de existir. O restante da tabela
-- permanece somente como histórico não sensível da migração anterior.
ALTER TABLE IF EXISTS public.mercado_livre_affiliate_sessions
  DROP COLUMN IF EXISTS encrypted_storage_state;

DROP FUNCTION IF EXISTS public.acquire_ml_affiliate_lock(UUID,TEXT,INTEGER);
DROP FUNCTION IF EXISTS public.release_ml_affiliate_lock(UUID,TEXT);
DROP TABLE IF EXISTS public.mercado_livre_affiliate_locks;
DROP TABLE IF EXISTS public.mercado_livre_affiliate_health;

UPDATE public.affiliate_accounts
SET provider='mercado_livre_browser_companion_v1',encrypted_credentials=NULL,
    validation_status='invalid',validation_error_code='COMPANION_NOT_PAIRED',updated_at=NOW()
WHERE platform='mercado_livre'
  AND provider IS DISTINCT FROM 'mercado_livre_browser_companion_v1';
