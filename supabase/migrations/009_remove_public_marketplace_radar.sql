-- AfiliHub — Ajuste 3D.2: remove o Radar público e restaura ownership individual.

-- Dados globais não são atribuídos arbitrariamente a nenhum usuário.
DELETE FROM public.marketplace_deal_snapshots WHERE user_id IS NULL;
DELETE FROM public.marketplace_deals WHERE user_id IS NULL;

DROP FUNCTION IF EXISTS public.acquire_public_marketplace_discovery_run(TEXT,INTEGER);
DROP TABLE IF EXISTS public.public_marketplace_discovery_runs;

DROP POLICY IF EXISTS "marketplace_deals_visible_to_owner_or_public" ON public.marketplace_deals;
DROP POLICY IF EXISTS "marketplace_deals_owner_write" ON public.marketplace_deals;
DROP POLICY IF EXISTS "marketplace_deals_owner" ON public.marketplace_deals;
CREATE POLICY "marketplace_deals_owner" ON public.marketplace_deals FOR ALL
  USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

DROP INDEX IF EXISTS public.marketplace_deals_public_identity_key;

ALTER TABLE public.marketplace_deals
  ALTER COLUMN user_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS marketplace_deals_score_context_check,
  DROP COLUMN IF EXISTS score_context;

ALTER TABLE public.marketplace_deal_snapshots
  ALTER COLUMN user_id SET NOT NULL;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.marketplace_deals FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.marketplace_deal_snapshots FROM anon;

