-- Reprocessa links curtos do Monitor classificados antes de o fluxo meli.la
-- recuperar o produto MLB/MLBU no backend.
UPDATE public.affiliate_conversions
SET status = 'pending',
    resolved_url = NULL,
    detected_platform = NULL,
    converted_url = NULL,
    error_code = NULL,
    processing_started_at = NULL,
    processing_worker_id = NULL,
    attempt_count = 0,
    next_attempt_at = to_timestamp(0),
    resolved_at = NULL,
    converted_at = NULL,
    updated_at = now()
WHERE source_type = 'whatsapp'
  AND (
    status = 'unsupported_platform'
    OR (status = 'conversion_failed' AND error_code IN ('CIRCUIT_OPEN', 'GENERATION_FAILED'))
  )
  AND original_url ILIKE 'https://meli.la/%';

UPDATE public.products p
SET affiliate_status = 'pending',
    affiliate_url = NULL,
    updated_at = now()
WHERE p.affiliate_conversion_id IN (
  SELECT id
  FROM public.affiliate_conversions
  WHERE source_type = 'whatsapp'
    AND original_url ILIKE 'https://meli.la/%'
    AND status = 'pending'
);
