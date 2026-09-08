-- AfiliHub — Bloco 3D.1: Radar público + gating de afiliado.

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS validation_status TEXT NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS validation_error_code TEXT;

UPDATE public.affiliate_accounts SET validation_status = CASE
  WHEN encrypted_credentials IS NULL THEN 'not_configured'
  WHEN status='error' THEN 'error'
  ELSE 'pending_validation' END
WHERE validation_status='not_configured';

ALTER TABLE public.affiliate_accounts
  DROP CONSTRAINT IF EXISTS affiliate_accounts_validation_status_check,
  ADD CONSTRAINT affiliate_accounts_validation_status_check
    CHECK (validation_status IN ('not_configured','pending_validation','valid','invalid','error'));

ALTER TABLE public.marketplace_deals
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS score_context TEXT NOT NULL DEFAULT 'affiliate_enriched';

ALTER TABLE public.marketplace_deals
  DROP CONSTRAINT IF EXISTS marketplace_deals_score_context_check,
  ADD CONSTRAINT marketplace_deals_score_context_check CHECK (score_context IN ('public','affiliate_enriched'));

ALTER TABLE public.marketplace_deals DROP CONSTRAINT IF EXISTS marketplace_deals_user_id_marketplace_external_product_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_deals_account_identity_key
  ON public.marketplace_deals(user_id, marketplace, external_product_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_deals_public_identity_key
  ON public.marketplace_deals(marketplace, external_product_id) WHERE user_id IS NULL;

DROP POLICY IF EXISTS "marketplace_deals_owner" ON public.marketplace_deals;
CREATE POLICY "marketplace_deals_visible_to_owner_or_public" ON public.marketplace_deals FOR SELECT
  USING (user_id=auth.uid() OR user_id IS NULL);
CREATE POLICY "marketplace_deals_owner_write" ON public.marketplace_deals FOR ALL
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.marketplace_deals FROM anon;
GRANT SELECT ON public.marketplace_deals TO authenticated;
