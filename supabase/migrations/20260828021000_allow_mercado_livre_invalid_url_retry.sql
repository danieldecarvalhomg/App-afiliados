-- Permite revalidar conversões do Mercado Livre que foram classificadas como
-- invalid_url antes da recuperação automática de páginas /social.
-- A autorização por produto continua sendo feita pelo AffiliateConversionService.

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
    AND status IN ('resolution_failed','conversion_failed','affiliate_account_not_configured','invalid_url');
  v_reset := FOUND;
  IF v_reset THEN
    UPDATE public.products SET
      affiliate_status='pending', affiliate_url=NULL, updated_at=NOW()
    WHERE user_id=p_user_id AND affiliate_conversion_id=p_conversion_id;
  END IF;
  RETURN v_reset;
END $$;
