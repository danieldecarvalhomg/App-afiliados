ALTER TABLE public.automation_prepared_snapshots
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN public.automation_prepared_snapshots.source_url IS
  'Original marketplace/store URL used only to resolve a missing outbound preview image.';
