-- AfiliHub — Coletor oficial global para alimentar o cache público do Radar.

ALTER TABLE public.marketplace_deal_snapshots
  ALTER COLUMN user_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_marketplace_discovery_runs (
  marketplace TEXT PRIMARY KEY CHECK (marketplace='shopee'),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','running','completed','failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_code TEXT,
  last_error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_marketplace_discovery_runs_due_idx
  ON public.public_marketplace_discovery_runs(next_run_at) WHERE status <> 'running';

ALTER TABLE public.public_marketplace_discovery_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_marketplace_discovery_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.acquire_public_marketplace_discovery_run(
  p_marketplace TEXT, p_interval_seconds INTEGER
) RETURNS TABLE(acquired BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run public.public_marketplace_discovery_runs%ROWTYPE;
BEGIN
  INSERT INTO public.public_marketplace_discovery_runs(marketplace, status, next_run_at)
  VALUES (p_marketplace, 'idle', NOW()) ON CONFLICT (marketplace) DO NOTHING;
  SELECT * INTO v_run FROM public.public_marketplace_discovery_runs WHERE marketplace=p_marketplace FOR UPDATE;
  IF v_run.status='running' AND v_run.started_at > NOW() - INTERVAL '15 minutes' THEN
    RETURN QUERY SELECT false, 'PUBLIC_RADAR_REFRESH_IN_PROGRESS'; RETURN;
  END IF;
  IF v_run.next_run_at > NOW() THEN
    RETURN QUERY SELECT false, 'PUBLIC_RADAR_REFRESH_NOT_DUE'; RETURN;
  END IF;
  UPDATE public.public_marketplace_discovery_runs SET status='running', started_at=NOW(), completed_at=NULL,
    last_error_code=NULL, last_error_message=NULL, updated_at=NOW(),
    next_run_at=NOW()+make_interval(secs=>p_interval_seconds)
  WHERE marketplace=p_marketplace;
  RETURN QUERY SELECT true, NULL::TEXT;
END $$;

REVOKE ALL ON FUNCTION public.acquire_public_marketplace_discovery_run(TEXT,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_public_marketplace_discovery_run(TEXT,INTEGER) TO service_role;

