-- AfiliHub — Bloco 3C: afiliados, conversões e produtos multiorigem.
-- Aplicar após 004_promotion_intelligence.sql. Não altera migrations anteriores.

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS encrypted_credentials JSONB,
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'shopee_open_api',
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE public.affiliate_accounts DROP CONSTRAINT IF EXISTS affiliate_accounts_platform_check;
UPDATE public.affiliate_accounts SET platform = CASE lower(platform)
  WHEN 'mercadolivre' THEN 'mercado_livre' WHEN 'mercado livre' THEN 'mercado_livre'
  ELSE lower(platform) END;
UPDATE public.affiliate_accounts SET
  status='not_configured',
  provider=CASE WHEN platform='shopee' THEN 'shopee_open_api' ELSE 'not_implemented' END
WHERE encrypted_credentials IS NULL;
ALTER TABLE public.affiliate_accounts
  ADD CONSTRAINT affiliate_accounts_platform_check
    CHECK (platform IN ('shopee','amazon','mercado_livre')),
  DROP CONSTRAINT IF EXISTS affiliate_accounts_credentials_check,
  ADD CONSTRAINT affiliate_accounts_credentials_check
    CHECK (encrypted_credentials IS NULL OR jsonb_typeof(encrypted_credentials) = 'object');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='affiliate_conversions' AND column_name='account_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='affiliate_conversions' AND column_name='affiliate_account_id') THEN
    ALTER TABLE public.affiliate_conversions RENAME COLUMN account_id TO affiliate_account_id;
  END IF;
END $$;

ALTER TABLE public.affiliate_conversions
  DROP CONSTRAINT IF EXISTS affiliate_conversions_status_check;

UPDATE public.affiliate_conversions SET status = CASE status
  WHEN 'success' THEN 'converted'
  WHEN 'platform_not_supported' THEN 'unsupported_platform'
  WHEN 'not_configured' THEN 'affiliate_account_not_configured'
  ELSE status END
WHERE status IN ('success','platform_not_supported','not_configured');

ALTER TABLE public.affiliate_conversions
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_reference_id UUID,
  ADD COLUMN IF NOT EXISTS resolved_url TEXT,
  ADD COLUMN IF NOT EXISTS detected_platform TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS conversion_version TEXT NOT NULL DEFAULT 'affiliate-v1',
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_worker_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.affiliate_conversions SET detected_platform = CASE lower(platform)
  WHEN 'mercadolivre' THEN 'mercado_livre' WHEN 'mercado livre' THEN 'mercado_livre'
  WHEN 'shopee' THEN 'shopee' WHEN 'amazon' THEN 'amazon' WHEN 'magalu' THEN 'magalu'
  WHEN 'aliexpress' THEN 'aliexpress' ELSE 'other' END
WHERE detected_platform IS NULL AND platform IS NOT NULL;

ALTER TABLE public.affiliate_conversions
  DROP CONSTRAINT IF EXISTS affiliate_conversions_status_check,
  ADD CONSTRAINT affiliate_conversions_status_check CHECK (status IN (
    'pending','resolving','resolved','converting','converted','invalid_url',
    'resolution_failed','conversion_failed','unsupported_platform',
    'affiliate_account_not_configured'
  )),
  DROP CONSTRAINT IF EXISTS affiliate_conversions_source_type_check,
  ADD CONSTRAINT affiliate_conversions_source_type_check
    CHECK (source_type IN ('whatsapp','marketplace_radar','manual')),
  DROP CONSTRAINT IF EXISTS affiliate_conversions_platform_check,
  ADD CONSTRAINT affiliate_conversions_platform_check CHECK (
    detected_platform IS NULL OR detected_platform IN
      ('shopee','amazon','mercado_livre','magalu','aliexpress','other','unsupported')
  ),
  DROP CONSTRAINT IF EXISTS affiliate_conversions_attempt_count_check,
  ADD CONSTRAINT affiliate_conversions_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_conversions_source_url_key
  ON public.affiliate_conversions(user_id, source_type, source_reference_id, original_url)
  WHERE source_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS affiliate_conversions_queue_idx
  ON public.affiliate_conversions(status, next_attempt_at, created_at)
  WHERE status IN ('pending','resolving','resolved','converting');

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_reference_id UUID,
  ADD COLUMN IF NOT EXISTS coupon_description TEXT,
  ADD COLUMN IF NOT EXISTS free_shipping BOOLEAN,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS affiliate_status TEXT NOT NULL DEFAULT 'pending_url',
  ADD COLUMN IF NOT EXISTS affiliate_conversion_id UUID REFERENCES public.affiliate_conversions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS observations TEXT;

UPDATE public.products SET source_url = raw_url WHERE source_url IS NULL AND raw_url IS NOT NULL;
UPDATE public.products SET marketplace = CASE lower(marketplace)
  WHEN 'amazon' THEN 'amazon' WHEN 'shopee' THEN 'shopee'
  WHEN 'mercado livre' THEN 'mercado_livre' WHEN 'mercadolivre' THEN 'mercado_livre'
  WHEN 'aliexpress' THEN 'aliexpress' WHEN 'magalu' THEN 'magalu'
  ELSE 'other' END;

ALTER TABLE public.products
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN price DROP DEFAULT,
  ALTER COLUMN original_price DROP DEFAULT,
  ALTER COLUMN discount_percent TYPE NUMERIC(7,2) USING discount_percent::NUMERIC,
  DROP CONSTRAINT IF EXISTS products_source_type_check,
  ADD CONSTRAINT products_source_type_check CHECK (source_type IN ('whatsapp','marketplace_radar','manual')),
  DROP CONSTRAINT IF EXISTS products_affiliate_status_check,
  ADD CONSTRAINT products_affiliate_status_check CHECK (affiliate_status IN (
    'pending_url','pending','resolving','resolved','converting','converted','invalid_url',
    'resolution_failed','conversion_failed','unsupported_platform','affiliate_account_not_configured'
  )),
  DROP CONSTRAINT IF EXISTS products_marketplace_check,
  ADD CONSTRAINT products_marketplace_check CHECK (marketplace IN (
    'shopee','amazon','mercado_livre','magalu','aliexpress','other','unsupported','unknown'
  )),
  DROP CONSTRAINT IF EXISTS products_currency_check,
  ADD CONSTRAINT products_currency_check CHECK (currency IS NULL OR currency = 'BRL');

CREATE UNIQUE INDEX IF NOT EXISTS products_source_reference_key
  ON public.products(user_id, source_type, source_reference_id)
  WHERE source_reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_user_source_idx
  ON public.products(user_id, source_type, created_at DESC);

-- O frontend recebe somente metadados de configuração. Credenciais cifradas
-- ficam acessíveis exclusivamente ao backend service_role.
REVOKE ALL ON public.affiliate_accounts FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.affiliate_accounts FROM authenticated;
GRANT SELECT (id,user_id,platform,status,provider,last_error_code,created_at,updated_at)
  ON public.affiliate_accounts TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_next_affiliate_conversion(
  p_worker_id TEXT,
  p_stale_before TIMESTAMPTZ
)
RETURNS SETOF public.affiliate_conversions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE public.affiliate_conversions SET
    status='conversion_failed', processing_started_at=NULL, processing_worker_id=NULL,
    error_code='PROCESSING_TIMEOUT', updated_at=NOW()
  WHERE status IN ('resolving','resolved','converting') AND processing_started_at < p_stale_before AND attempt_count >= 3;

  SELECT id INTO v_id FROM public.affiliate_conversions
  WHERE attempt_count < 3 AND (
    (status = 'pending' AND next_attempt_at <= NOW()) OR
    (status IN ('resolving','resolved','converting') AND processing_started_at < p_stale_before)
  )
  ORDER BY CASE WHEN status IN ('resolving','resolved','converting') THEN 0 ELSE 1 END, next_attempt_at, created_at
  FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;

  RETURN QUERY UPDATE public.affiliate_conversions c SET
    status='resolving', processing_started_at=NOW(), processing_worker_id=p_worker_id,
    attempt_count=c.attempt_count+1, error_code=NULL, updated_at=NOW()
  WHERE c.id=v_id RETURNING c.*;
END $$;

CREATE OR REPLACE FUNCTION public.reset_affiliate_conversion(
  p_user_id UUID,
  p_conversion_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_reset BOOLEAN;
BEGIN
  UPDATE public.affiliate_conversions SET
    status='pending', resolved_url=NULL, detected_platform=NULL, converted_url=NULL,
    error_code=NULL, processing_started_at=NULL, processing_worker_id=NULL,
    attempt_count=0, next_attempt_at=TO_TIMESTAMP(0), resolved_at=NULL, converted_at=NULL,
    updated_at=NOW()
  WHERE id=p_conversion_id AND user_id=p_user_id
    AND status IN ('resolution_failed','conversion_failed','affiliate_account_not_configured');
  v_reset := FOUND;
  IF v_reset THEN
    UPDATE public.products SET
      affiliate_status='pending', affiliate_url=NULL, updated_at=NOW()
    WHERE user_id=p_user_id AND affiliate_conversion_id=p_conversion_id;
  END IF;
  RETURN v_reset;
END $$;

REVOKE ALL ON FUNCTION public.claim_next_affiliate_conversion(TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_affiliate_conversion(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_affiliate_conversion(TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_affiliate_conversion(UUID,UUID) TO service_role;
