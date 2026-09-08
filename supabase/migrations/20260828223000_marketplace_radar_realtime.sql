-- AfiliHub — Radar de marketplaces com atualização ao vivo no cliente.

ALTER TABLE public.marketplace_deals REPLICA IDENTITY FULL;
ALTER TABLE public.marketplace_discovery_runs REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_deals;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_discovery_runs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_discovery_runs;
  END IF;
END
$$;
