-- Radar de Ofertas: uma única coleta automática por dia, às 12h de São Paulo.
-- O campo persistente impede disparos duplicados por reinício ou múltiplas instâncias.

ALTER TABLE public.marketplace_discovery_runs
  ADD COLUMN IF NOT EXISTS last_scheduled_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.acquire_marketplace_discovery_run(
  p_user_id UUID, p_marketplace TEXT, p_trigger TEXT, p_cooldown_seconds INTEGER, p_interval_seconds INTEGER
) RETURNS TABLE(acquired BOOLEAN, error_code TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_run public.marketplace_discovery_runs%ROWTYPE;
BEGIN
  INSERT INTO public.marketplace_discovery_runs(user_id, marketplace, status, trigger, next_run_at)
  VALUES (p_user_id, p_marketplace, 'idle', p_trigger, NOW()) ON CONFLICT (user_id, marketplace) DO NOTHING;

  SELECT * INTO v_run FROM public.marketplace_discovery_runs
  WHERE user_id=p_user_id AND marketplace=p_marketplace FOR UPDATE;

  IF v_run.status='running' AND v_run.started_at > NOW() - INTERVAL '15 minutes' THEN
    RETURN QUERY SELECT false, 'RADAR_REFRESH_IN_PROGRESS'; RETURN;
  END IF;

  IF p_trigger='scheduler'
    AND v_run.last_scheduled_at IS NOT NULL
    AND (v_run.last_scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RETURN QUERY SELECT false, 'RADAR_REFRESH_ALREADY_SCHEDULED_TODAY'; RETURN;
  END IF;

  IF p_trigger='manual' AND v_run.completed_at IS NOT NULL
    AND v_run.completed_at > NOW() - make_interval(secs=>p_cooldown_seconds) THEN
    RETURN QUERY SELECT false, 'RADAR_REFRESH_COOLDOWN'; RETURN;
  END IF;

  UPDATE public.marketplace_discovery_runs SET
    status='running', trigger=p_trigger, started_at=NOW(), last_error_code=NULL,
    last_error_message=NULL, updated_at=NOW(), next_run_at=NOW()+make_interval(secs=>p_interval_seconds),
    last_scheduled_at=CASE WHEN p_trigger='scheduler' THEN NOW() ELSE last_scheduled_at END
  WHERE id=v_run.id;
  RETURN QUERY SELECT true, NULL::TEXT;
END $$;

REVOKE ALL ON FUNCTION public.acquire_marketplace_discovery_run(UUID,TEXT,TEXT,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_marketplace_discovery_run(UUID,TEXT,TEXT,INTEGER,INTEGER) TO service_role;
