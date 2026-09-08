-- AfiliHub — Bloco 3D: Marketplace Radar. Aplicar após 005_affiliate_products.sql.

CREATE TABLE IF NOT EXISTS public.marketplace_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_account_id UUID REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee','amazon','mercado_livre','magalu','aliexpress','other','unsupported')),
  external_product_id TEXT NOT NULL,
  external_shop_id TEXT,
  title TEXT NOT NULL,
  image_url TEXT,
  product_url TEXT NOT NULL,
  price NUMERIC(12,2),
  original_price NUMERIC(12,2),
  estimated_original_price NUMERIC(12,2),
  discount_percent NUMERIC(7,2),
  currency TEXT DEFAULT 'BRL' CHECK (currency IS NULL OR currency='BRL'),
  commission_rate NUMERIC(8,4),
  commission_amount NUMERIC(12,2),
  sales_count BIGINT,
  rating NUMERIC(3,2),
  reviews_count BIGINT,
  coupon TEXT,
  free_shipping BOOLEAN,
  category TEXT,
  deal_score INTEGER NOT NULL DEFAULT 0 CHECK (deal_score BETWEEN 0 AND 100),
  deal_score_version TEXT NOT NULL DEFAULT 'v1',
  score_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  missing_cycles INTEGER NOT NULL DEFAULT 0 CHECK (missing_cycles >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','stale','unavailable')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, marketplace, external_product_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_deal_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES public.marketplace_deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price NUMERIC(12,2),
  original_price NUMERIC(12,2),
  discount_percent NUMERIC(7,2),
  commission_rate NUMERIC(8,4),
  commission_amount NUMERIC(12,2),
  status TEXT NOT NULL CHECK (status IN ('active','stale','unavailable')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace='shopee'),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','completed','failed')),
  trigger TEXT NOT NULL DEFAULT 'scheduler' CHECK (trigger IN ('scheduler','manual')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_code TEXT,
  last_error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, marketplace)
);

CREATE INDEX IF NOT EXISTS marketplace_deals_user_score_idx ON public.marketplace_deals(user_id, deal_score DESC, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_deals_filter_idx ON public.marketplace_deals(user_id, marketplace, category, status);
CREATE INDEX IF NOT EXISTS marketplace_deal_snapshots_deal_idx ON public.marketplace_deal_snapshots(deal_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_discovery_runs_due_idx ON public.marketplace_discovery_runs(next_run_at) WHERE status <> 'running';

ALTER TABLE public.marketplace_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_deal_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_discovery_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketplace_deals_owner" ON public.marketplace_deals FOR ALL USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "marketplace_deal_snapshots_owner" ON public.marketplace_deal_snapshots FOR ALL USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
CREATE POLICY "marketplace_discovery_runs_owner" ON public.marketplace_discovery_runs FOR ALL USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.acquire_marketplace_discovery_run(
  p_user_id UUID, p_marketplace TEXT, p_trigger TEXT, p_cooldown_seconds INTEGER, p_interval_seconds INTEGER
) RETURNS TABLE(acquired BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run public.marketplace_discovery_runs%ROWTYPE;
BEGIN
  INSERT INTO public.marketplace_discovery_runs(user_id, marketplace, status, trigger, next_run_at)
  VALUES (p_user_id, p_marketplace, 'idle', p_trigger, NOW()) ON CONFLICT (user_id, marketplace) DO NOTHING;
  SELECT * INTO v_run FROM public.marketplace_discovery_runs WHERE user_id=p_user_id AND marketplace=p_marketplace FOR UPDATE;
  IF v_run.status='running' AND v_run.started_at > NOW() - INTERVAL '15 minutes' THEN
    RETURN QUERY SELECT false, 'RADAR_REFRESH_IN_PROGRESS'; RETURN;
  END IF;
  IF p_trigger='manual' AND v_run.completed_at IS NOT NULL AND v_run.completed_at > NOW() - make_interval(secs=>p_cooldown_seconds) THEN
    RETURN QUERY SELECT false, 'RADAR_REFRESH_COOLDOWN'; RETURN;
  END IF;
  UPDATE public.marketplace_discovery_runs SET status='running', trigger=p_trigger, started_at=NOW(), last_error_code=NULL,
    last_error_message=NULL, updated_at=NOW(), next_run_at=NOW()+make_interval(secs=>p_interval_seconds)
  WHERE id=v_run.id;
  RETURN QUERY SELECT true, NULL::TEXT;
END $$;

REVOKE ALL ON FUNCTION public.acquire_marketplace_discovery_run(UUID,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_marketplace_discovery_run(UUID,TEXT,TEXT,INTEGER,INTEGER) TO service_role;
