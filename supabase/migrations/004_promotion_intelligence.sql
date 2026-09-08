-- AfiliHub — Bloco 3B: detecção e extração estruturada de promoções
-- Aplicar após 003_monitoring_capture.sql.

ALTER TABLE public.captured_messages
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_worker_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS last_error_code TEXT,
  ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE public.captured_messages
  DROP CONSTRAINT IF EXISTS captured_messages_processing_status_check,
  ADD CONSTRAINT captured_messages_processing_status_check
    CHECK (processing_status IN ('raw','processing','promotion_detected','ignored','failed','needs_review')),
  DROP CONSTRAINT IF EXISTS captured_messages_attempt_count_check,
  ADD CONSTRAINT captured_messages_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3);

CREATE INDEX IF NOT EXISTS captured_messages_processing_queue_idx
  ON public.captured_messages (processing_status, next_attempt_at, received_at)
  WHERE processing_status IN ('raw','processing');

CREATE TABLE IF NOT EXISTS public.promotion_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  captured_message_id UUID NOT NULL REFERENCES public.captured_messages(id) ON DELETE CASCADE,
  is_promotion        BOOLEAN,
  confidence          NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  product_name        TEXT,
  price               NUMERIC(14,2) CHECK (price IS NULL OR price >= 0),
  original_price      NUMERIC(14,2) CHECK (original_price IS NULL OR original_price >= 0),
  discount_percent    NUMERIC(7,2) CHECK (discount_percent IS NULL OR discount_percent BETWEEN 0 AND 100),
  currency            TEXT CHECK (currency IS NULL OR currency IN ('BRL')),
  coupon_code         TEXT,
  coupon_description  TEXT,
  free_shipping       BOOLEAN,
  marketplace         TEXT NOT NULL DEFAULT 'unknown'
    CHECK (marketplace IN ('shopee','amazon','mercado_livre','magalu','aliexpress','other','unknown')),
  source_links        JSONB NOT NULL DEFAULT '[]'::JSONB CHECK (jsonb_typeof(source_links) = 'array'),
  analysis_version    TEXT NOT NULL DEFAULT 'promotion-v1',
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  normalized_result   JSONB NOT NULL DEFAULT '{}'::JSONB,
  input_tokens        INTEGER,
  output_tokens       INTEGER,
  processing_ms       INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotion_analyses_capture_key UNIQUE (captured_message_id)
);

CREATE INDEX IF NOT EXISTS promotion_analyses_user_created_idx
  ON public.promotion_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS promotion_analyses_classification_idx
  ON public.promotion_analyses (user_id, is_promotion, confidence DESC);

ALTER TABLE public.promotion_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "promotion_analyses_owner" ON public.promotion_analyses;
CREATE POLICY "promotion_analyses_owner" ON public.promotion_analyses
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.validate_promotion_analysis_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.captured_messages capture
    WHERE capture.id = NEW.captured_message_id AND capture.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'PROMOTION_ANALYSIS_CAPTURE_OWNER_MISMATCH'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_promotion_analysis_owner_trigger ON public.promotion_analyses;
CREATE TRIGGER validate_promotion_analysis_owner_trigger
  BEFORE INSERT OR UPDATE OF user_id, captured_message_id ON public.promotion_analyses
  FOR EACH ROW EXECUTE FUNCTION public.validate_promotion_analysis_owner();

-- Claim global do worker: SKIP LOCKED impede duas instâncias de processarem a
-- mesma captura. Processamentos abandonados voltam a ser elegíveis após timeout.
CREATE OR REPLACE FUNCTION public.claim_next_promotion_capture(
  p_worker_id TEXT,
  p_stale_before TIMESTAMPTZ
)
RETURNS SETOF public.captured_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capture_id UUID;
BEGIN
  UPDATE public.captured_messages
  SET processing_status = 'failed',
      processing_started_at = NULL,
      processing_worker_id = NULL,
      last_error_code = 'PROCESSING_TIMEOUT',
      last_error_at = NOW()
  WHERE processing_status = 'processing'
    AND processing_started_at < p_stale_before
    AND attempt_count >= 3;

  SELECT capture.id INTO v_capture_id
  FROM public.captured_messages capture
  WHERE capture.attempt_count < 3
    AND (
      (capture.processing_status = 'raw' AND capture.next_attempt_at <= NOW())
      OR
      (capture.processing_status = 'processing' AND capture.processing_started_at < p_stale_before)
    )
  ORDER BY
    CASE WHEN capture.processing_status = 'processing' THEN 0 ELSE 1 END,
    capture.next_attempt_at,
    capture.received_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_capture_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  UPDATE public.captured_messages capture
  SET processing_status = 'processing',
      processing_started_at = NOW(),
      processing_worker_id = p_worker_id,
      attempt_count = capture.attempt_count + 1,
      last_error_code = NULL
  WHERE capture.id = v_capture_id
  RETURNING capture.*;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_promotion_processing(UUID,UUID,TEXT,JSONB,TEXT,TEXT,INTEGER,INTEGER,INTEGER);
CREATE OR REPLACE FUNCTION public.complete_promotion_processing(
  p_user_id UUID,
  p_capture_id UUID,
  p_worker_id TEXT,
  p_status TEXT,
  p_analysis JSONB,
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_processing_ms INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('promotion_detected','ignored','needs_review') THEN
    RAISE EXCEPTION 'INVALID_PROMOTION_STATUS';
  END IF;
  PERFORM 1 FROM public.captured_messages
  WHERE id = p_capture_id AND user_id = p_user_id
    AND processing_status = 'processing' AND processing_worker_id = p_worker_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  INSERT INTO public.promotion_analyses (
    user_id, captured_message_id, is_promotion, confidence, product_name,
    price, original_price, discount_percent, currency, coupon_code,
    coupon_description, free_shipping, marketplace, source_links,
    analysis_version, provider, model, normalized_result,
    input_tokens, output_tokens, processing_ms, updated_at
  ) VALUES (
    p_user_id, p_capture_id, (p_analysis->>'isPromotion')::BOOLEAN,
    COALESCE((p_analysis->>'confidence')::NUMERIC, 0), NULLIF(p_analysis->>'productName',''),
    (p_analysis->>'price')::NUMERIC, (p_analysis->>'originalPrice')::NUMERIC,
    (p_analysis->>'discountPercent')::NUMERIC, NULLIF(p_analysis->>'currency',''),
    NULLIF(p_analysis->'coupon'->>'code',''), NULLIF(p_analysis->'coupon'->>'description',''),
    (p_analysis->>'freeShipping')::BOOLEAN, COALESCE(NULLIF(p_analysis->>'marketplace',''),'unknown'),
    COALESCE(p_analysis->'links','[]'::JSONB), 'promotion-v1', p_provider, p_model,
    p_analysis, p_input_tokens, p_output_tokens, p_processing_ms, NOW()
  ) ON CONFLICT ON CONSTRAINT promotion_analyses_capture_key DO UPDATE SET
    is_promotion = EXCLUDED.is_promotion, confidence = EXCLUDED.confidence,
    product_name = EXCLUDED.product_name, price = EXCLUDED.price,
    original_price = EXCLUDED.original_price, discount_percent = EXCLUDED.discount_percent,
    currency = EXCLUDED.currency, coupon_code = EXCLUDED.coupon_code,
    coupon_description = EXCLUDED.coupon_description, free_shipping = EXCLUDED.free_shipping,
    marketplace = EXCLUDED.marketplace, source_links = EXCLUDED.source_links,
    analysis_version = EXCLUDED.analysis_version, provider = EXCLUDED.provider,
    model = EXCLUDED.model, normalized_result = EXCLUDED.normalized_result,
    input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
    processing_ms = EXCLUDED.processing_ms, updated_at = NOW();

  UPDATE public.captured_messages
  SET processing_status = p_status,
      processing_started_at = NULL,
      processing_worker_id = NULL,
      next_attempt_at = NOW(),
      last_error_code = NULL,
      last_error_at = NULL
  WHERE id = p_capture_id AND user_id = p_user_id
    AND processing_status = 'processing' AND processing_worker_id = p_worker_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_capture_for_reprocess(
  p_user_id UUID,
  p_capture_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.captured_messages
    WHERE id = p_capture_id AND user_id = p_user_id
      AND processing_status IN ('failed','needs_review')
    FOR UPDATE
  ) THEN RETURN FALSE; END IF;
  DELETE FROM public.promotion_analyses
  WHERE captured_message_id = p_capture_id AND user_id = p_user_id;
  UPDATE public.captured_messages
  SET processing_status = 'raw', attempt_count = 0,
      processing_started_at = NULL, processing_worker_id = NULL,
      next_attempt_at = TO_TIMESTAMP(0), last_error_code = NULL, last_error_at = NULL
  WHERE id = p_capture_id AND user_id = p_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_promotion_capture(TEXT,TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_promotion_processing(UUID,UUID,TEXT,TEXT,JSONB,TEXT,TEXT,INTEGER,INTEGER,INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_capture_for_reprocess(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_promotion_capture(TEXT,TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_promotion_processing(UUID,UUID,TEXT,TEXT,JSONB,TEXT,TEXT,INTEGER,INTEGER,INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_capture_for_reprocess(UUID,UUID) TO service_role;
