-- Limites mensais de IA por produto, consumidos junto da franquia global.

ALTER TABLE public.plan_catalog
  ADD COLUMN IF NOT EXISTS ai_generation_per_product_limit INTEGER
  CHECK (ai_generation_per_product_limit IS NULL OR ai_generation_per_product_limit >= 0);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ai_generation_per_product_limit INTEGER NOT NULL DEFAULT 0
  CHECK (ai_generation_per_product_limit >= 0);

UPDATE public.plan_catalog
SET ai_generation_per_product_limit = CASE code
  WHEN 'free' THEN 0
  WHEN 'essential' THEN 0
  WHEN 'advanced' THEN 30
  WHEN 'pro' THEN 60
  WHEN 'scale' THEN 120
  WHEN 'personal' THEN NULL
END;

UPDATE public.subscriptions AS subscription
SET ai_generation_per_product_limit = COALESCE(catalog.ai_generation_per_product_limit, 2147483647)
FROM public.plan_catalog AS catalog
WHERE catalog.code = subscription.plan_code;

CREATE OR REPLACE FUNCTION public.apply_subscription_plan(
  p_user_id UUID,
  p_plan_code TEXT,
  p_billing_mode TEXT DEFAULT 'preview'
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p public.plan_catalog%ROWTYPE;
  result public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.plan_catalog WHERE code = p_plan_code AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p_billing_mode NOT IN ('preview', 'live') THEN RAISE EXCEPTION 'BILLING_MODE_INVALID'; END IF;

  INSERT INTO public.subscriptions(
    user_id, plan_code, plan_name, price_monthly, status, renewal_date,
    dispatch_limit, channel_limit, ai_generation_limit, ai_generation_per_product_limit,
    affiliate_conversion_limit, monitored_group_limit, radar_refresh_limit,
    account_user_limit, landing_page_limit, billing_mode
  ) VALUES (
    p_user_id, p.code, p.name, COALESCE(p.price_monthly, 0), 'ativo', NOW() + INTERVAL '1 month',
    p.dispatch_limit, COALESCE(p.channel_limit, 2147483647), COALESCE(p.ai_generation_limit, 2147483647),
    COALESCE(p.ai_generation_per_product_limit, 2147483647),
    COALESCE(p.affiliate_conversion_limit, 2147483647), COALESCE(p.monitored_group_limit, 2147483647),
    p.radar_refresh_limit, p.account_user_limit, p.landing_page_limit, p_billing_mode
  )
  ON CONFLICT(user_id) DO UPDATE SET
    plan_code = EXCLUDED.plan_code,
    plan_name = EXCLUDED.plan_name,
    price_monthly = EXCLUDED.price_monthly,
    status = 'ativo',
    renewal_date = EXCLUDED.renewal_date,
    dispatch_limit = EXCLUDED.dispatch_limit,
    channel_limit = EXCLUDED.channel_limit,
    ai_generation_limit = EXCLUDED.ai_generation_limit,
    ai_generation_per_product_limit = EXCLUDED.ai_generation_per_product_limit,
    affiliate_conversion_limit = EXCLUDED.affiliate_conversion_limit,
    monitored_group_limit = EXCLUDED.monitored_group_limit,
    radar_refresh_limit = EXCLUDED.radar_refresh_limit,
    account_user_limit = EXCLUDED.account_user_limit,
    landing_page_limit = EXCLUDED.landing_page_limit,
    billing_mode = EXCLUDED.billing_mode,
    updated_at = NOW()
  RETURNING * INTO result;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_subscription_plan(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_plan(UUID, TEXT, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.product_ai_generation_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  usage_period_start DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date,
  ai_generation_used INTEGER NOT NULL DEFAULT 0 CHECK (ai_generation_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

ALTER TABLE public.product_ai_generation_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_ai_generation_usage FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_subscription_ai_generation_for_product(
  p_user_id UUID,
  p_product_id UUID,
  p_amount INTEGER DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_product_usage public.product_ai_generation_usage%ROWTYPE;
  v_amount INTEGER := GREATEST(1, COALESCE(p_amount, 1));
  v_period_start DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM public.apply_subscription_plan(p_user_id, 'free', 'preview');
    SELECT * INTO v_subscription
    FROM public.subscriptions
    WHERE user_id = p_user_id
    FOR UPDATE;
  END IF;

  IF v_subscription.usage_period_start < v_period_start THEN
    UPDATE public.subscriptions
    SET ai_generation_used = 0,
        dispatch_used = 0,
        affiliate_conversion_used = 0,
        radar_refresh_used = 0,
        usage_period_start = v_period_start,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    SELECT * INTO v_subscription FROM public.subscriptions WHERE user_id = p_user_id;
  END IF;

  IF v_subscription.status <> 'ativo' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'SUBSCRIPTION_INACTIVE');
  END IF;

  SELECT * INTO v_product_usage
  FROM public.product_ai_generation_usage
  WHERE user_id = p_user_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.product_ai_generation_usage(user_id, product_id, usage_period_start)
    VALUES (p_user_id, p_product_id, v_period_start)
    RETURNING * INTO v_product_usage;
  ELSIF v_product_usage.usage_period_start < v_period_start THEN
    UPDATE public.product_ai_generation_usage
    SET ai_generation_used = 0,
        usage_period_start = v_period_start,
        updated_at = NOW()
    WHERE user_id = p_user_id AND product_id = p_product_id
    RETURNING * INTO v_product_usage;
  END IF;

  IF v_subscription.ai_generation_used + v_amount > v_subscription.ai_generation_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'SUBSCRIPTION_LIMIT',
      'used', v_subscription.ai_generation_used,
      'limit', v_subscription.ai_generation_limit,
      'productUsed', v_product_usage.ai_generation_used,
      'productLimit', v_subscription.ai_generation_per_product_limit,
      'usagePeriodStart', v_product_usage.usage_period_start
    );
  END IF;

  IF v_product_usage.ai_generation_used + v_amount > v_subscription.ai_generation_per_product_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'PRODUCT_LIMIT',
      'used', v_subscription.ai_generation_used,
      'limit', v_subscription.ai_generation_limit,
      'productUsed', v_product_usage.ai_generation_used,
      'productLimit', v_subscription.ai_generation_per_product_limit,
      'usagePeriodStart', v_product_usage.usage_period_start
    );
  END IF;

  UPDATE public.subscriptions
  SET ai_generation_used = ai_generation_used + v_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  UPDATE public.product_ai_generation_usage
  SET ai_generation_used = ai_generation_used + v_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id AND product_id = p_product_id
  RETURNING * INTO v_product_usage;

  RETURN jsonb_build_object(
    'allowed', true,
    'used', v_subscription.ai_generation_used + v_amount,
    'limit', v_subscription.ai_generation_limit,
    'productUsed', v_product_usage.ai_generation_used,
    'productLimit', v_subscription.ai_generation_per_product_limit,
    'usagePeriodStart', v_product_usage.usage_period_start
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_ai_generation_product_usage(
  p_user_id UUID,
  p_product_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_product_usage public.product_ai_generation_usage%ROWTYPE;
  v_period_start DATE := date_trunc('month', CURRENT_DATE)::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND';
  END IF;

  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id;
  SELECT * INTO v_product_usage
  FROM public.product_ai_generation_usage
  WHERE user_id = p_user_id AND product_id = p_product_id;

  RETURN jsonb_build_object(
    'productUsed', CASE
      WHEN v_product_usage.usage_period_start IS NULL OR v_product_usage.usage_period_start < v_period_start THEN 0
      ELSE v_product_usage.ai_generation_used
    END,
    'productLimit', CASE
      WHEN v_subscription.ai_generation_per_product_limit >= 2147483647 THEN NULL
      ELSE COALESCE(v_subscription.ai_generation_per_product_limit, 0)
    END,
    'usagePeriodStart', v_period_start
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_subscription_ai_generation_for_product(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_subscription_ai_generation_product_usage(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_subscription_ai_generation_for_product(UUID, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_subscription_ai_generation_product_usage(UUID, UUID) TO service_role;
