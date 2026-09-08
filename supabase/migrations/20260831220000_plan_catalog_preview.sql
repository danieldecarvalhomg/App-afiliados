-- Catálogo comercial em modo pré-lançamento. Não cria checkout nem efetua cobranças.

CREATE TABLE IF NOT EXISTS public.plan_catalog (
  code TEXT PRIMARY KEY CHECK (code IN ('free','essential','advanced','pro','scale','personal')),
  name TEXT NOT NULL,
  price_monthly NUMERIC(10,2),
  ideal_for TEXT NOT NULL,
  account_user_limit INTEGER,
  channel_limit INTEGER,
  ai_generation_limit INTEGER,
  affiliate_conversion_limit INTEGER,
  monitored_group_limit INTEGER,
  landing_page_limit INTEGER,
  dispatch_limit INTEGER NOT NULL,
  radar_refresh_limit INTEGER NOT NULL,
  feature_levels JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_priority TEXT NOT NULL CHECK (processing_priority IN ('standard','high','maximum')),
  support_level TEXT NOT NULL,
  highlighted BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.plan_catalog(code,name,price_monthly,ideal_for,account_user_limit,channel_limit,ai_generation_limit,affiliate_conversion_limit,monitored_group_limit,landing_page_limit,dispatch_limit,radar_refresh_limit,feature_levels,processing_priority,support_level,highlighted,sort_order)
VALUES
('free','Grátis',0,'Testar o AfiliHub',1,1,0,0,0,0,100,3,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"none","radar":"limited","group_monitor":"none","ai_cta":"none","ai_trainer":"none","custom_templates":"basic","scheduling":"limited","queues":"limited","monitor_automation":"none","landing_pages":"none","analytics":"basic","history_reports":"limited"}','standard','help_center',FALSE,1),
('essential','Essencial',69,'Operação pequena',1,2,0,300,2,1,10000,3000,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"complete","radar":"complete","group_monitor":"complete","ai_cta":"none","ai_trainer":"none","custom_templates":"complete","scheduling":"complete","queues":"complete","monitor_automation":"basic","landing_pages":"complete","analytics":"basic","history_reports":"complete"}','standard','email',FALSE,2),
('advanced','Avançado',129,'Afiliado ativo',2,3,300,1000,10,2,30000,3000,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"complete","radar":"complete","group_monitor":"complete","ai_cta":"complete","ai_trainer":"complete","custom_templates":"complete","scheduling":"complete","queues":"complete","monitor_automation":"complete","landing_pages":"complete","analytics":"complete","history_reports":"complete"}','standard','whatsapp',TRUE,3),
('pro','Pro',219,'Operação profissional',5,5,900,2500,25,5,100000,3000,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"complete","radar":"complete","group_monitor":"complete","ai_cta":"complete","ai_trainer":"complete","custom_templates":"complete","scheduling":"complete","queues":"complete","monitor_automation":"complete","landing_pages":"complete","analytics":"advanced","history_reports":"complete"}','high','priority',FALSE,4),
('scale','Escala',329,'Alto volume',10,8,2000,5000,50,10,250000,3000,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"complete","radar":"complete","group_monitor":"complete","ai_cta":"complete","ai_trainer":"complete","custom_templates":"complete","scheduling":"complete","queues":"complete","monitor_automation":"complete","landing_pages":"complete","analytics":"advanced","history_reports":"complete"}','high','priority',FALSE,5),
('personal','Personal',NULL,'Operação sob medida',NULL,NULL,NULL,NULL,NULL,NULL,2147483647,2147483647,
 '{"amazon":"complete","shopee":"complete","mercado_livre":"complete","radar":"complete","group_monitor":"complete","ai_cta":"complete","ai_trainer":"complete","custom_templates":"custom","scheduling":"custom","queues":"custom","monitor_automation":"custom","landing_pages":"custom","analytics":"custom","history_reports":"custom"}','maximum','dedicated',FALSE,6)
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name,price_monthly=EXCLUDED.price_monthly,ideal_for=EXCLUDED.ideal_for,
  account_user_limit=EXCLUDED.account_user_limit,channel_limit=EXCLUDED.channel_limit,
  ai_generation_limit=EXCLUDED.ai_generation_limit,affiliate_conversion_limit=EXCLUDED.affiliate_conversion_limit,
  monitored_group_limit=EXCLUDED.monitored_group_limit,landing_page_limit=EXCLUDED.landing_page_limit,
  dispatch_limit=EXCLUDED.dispatch_limit,radar_refresh_limit=EXCLUDED.radar_refresh_limit,
  feature_levels=EXCLUDED.feature_levels,processing_priority=EXCLUDED.processing_priority,
  support_level=EXCLUDED.support_level,highlighted=EXCLUDED.highlighted,sort_order=EXCLUDED.sort_order,
  active=TRUE,updated_at=NOW();

ALTER TABLE public.plan_catalog ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.plan_catalog FROM anon;
GRANT SELECT ON public.plan_catalog TO authenticated,service_role;
DROP POLICY IF EXISTS plan_catalog_authenticated_read ON public.plan_catalog;
CREATE POLICY plan_catalog_authenticated_read ON public.plan_catalog FOR SELECT TO authenticated USING (active);

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS plan_code TEXT REFERENCES public.plan_catalog(code),
  ADD COLUMN IF NOT EXISTS account_user_limit INTEGER,
  ADD COLUMN IF NOT EXISTS landing_page_limit INTEGER,
  ADD COLUMN IF NOT EXISTS billing_mode TEXT NOT NULL DEFAULT 'preview' CHECK (billing_mode IN ('preview','live'));

-- Contas beta atuais recebem o plano Pro de pré-lançamento, sem cobrança.
UPDATE public.subscriptions s SET
  plan_code='pro',plan_name=p.name,price_monthly=p.price_monthly,
  dispatch_limit=p.dispatch_limit,channel_limit=p.channel_limit,
  ai_generation_limit=p.ai_generation_limit,affiliate_conversion_limit=p.affiliate_conversion_limit,
  monitored_group_limit=p.monitored_group_limit,radar_refresh_limit=p.radar_refresh_limit,
  account_user_limit=p.account_user_limit,landing_page_limit=p.landing_page_limit,
  billing_mode='preview',updated_at=NOW()
FROM public.plan_catalog p
WHERE p.code='pro' AND (s.plan_code IS NULL OR lower(s.plan_name)='beta');

CREATE OR REPLACE FUNCTION public.apply_subscription_plan(p_user_id UUID,p_plan_code TEXT,p_billing_mode TEXT DEFAULT 'preview')
RETURNS public.subscriptions LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p public.plan_catalog%ROWTYPE; result public.subscriptions%ROWTYPE;
BEGIN
  SELECT * INTO p FROM public.plan_catalog WHERE code=p_plan_code AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  IF p_billing_mode NOT IN ('preview','live') THEN RAISE EXCEPTION 'BILLING_MODE_INVALID'; END IF;
  INSERT INTO public.subscriptions(user_id,plan_code,plan_name,price_monthly,status,renewal_date,dispatch_limit,channel_limit,ai_generation_limit,affiliate_conversion_limit,monitored_group_limit,radar_refresh_limit,account_user_limit,landing_page_limit,billing_mode)
  VALUES(p_user_id,p.code,p.name,COALESCE(p.price_monthly,0),'ativo',NOW()+INTERVAL '1 month',p.dispatch_limit,COALESCE(p.channel_limit,2147483647),COALESCE(p.ai_generation_limit,2147483647),COALESCE(p.affiliate_conversion_limit,2147483647),COALESCE(p.monitored_group_limit,2147483647),p.radar_refresh_limit,p.account_user_limit,p.landing_page_limit,p_billing_mode)
  ON CONFLICT(user_id) DO UPDATE SET plan_code=EXCLUDED.plan_code,plan_name=EXCLUDED.plan_name,
    price_monthly=EXCLUDED.price_monthly,status='ativo',renewal_date=EXCLUDED.renewal_date,
    dispatch_limit=EXCLUDED.dispatch_limit,channel_limit=EXCLUDED.channel_limit,
    ai_generation_limit=EXCLUDED.ai_generation_limit,affiliate_conversion_limit=EXCLUDED.affiliate_conversion_limit,
    monitored_group_limit=EXCLUDED.monitored_group_limit,radar_refresh_limit=EXCLUDED.radar_refresh_limit,
    account_user_limit=EXCLUDED.account_user_limit,landing_page_limit=EXCLUDED.landing_page_limit,
    billing_mode=EXCLUDED.billing_mode,updated_at=NOW()
  RETURNING * INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_subscription_plan(UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_subscription_plan(UUID,TEXT,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.subscription_has_feature(p_user_id UUID,p_feature TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((p.feature_levels->>p_feature) NOT IN ('none',''),FALSE)
  FROM public.subscriptions s JOIN public.plan_catalog p ON p.code=s.plan_code
  WHERE s.user_id=p_user_id AND s.status='ativo';
$$;
REVOKE ALL ON FUNCTION public.subscription_has_feature(UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_has_feature(UUID,TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_default_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.apply_subscription_plan(NEW.id,'free','preview');
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.consume_subscription_usage(p_user_id UUID,p_metric TEXT,p_amount INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v public.subscriptions%ROWTYPE;v_limit INTEGER;v_used INTEGER;v_amount INTEGER:=GREATEST(1,COALESCE(p_amount,1));
BEGIN
  SELECT * INTO v FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN PERFORM public.apply_subscription_plan(p_user_id,'free','preview');SELECT * INTO v FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;END IF;
  IF v.usage_period_start<date_trunc('month',CURRENT_DATE)::date THEN
    UPDATE public.subscriptions SET dispatch_used=0,ai_generation_used=0,affiliate_conversion_used=0,radar_refresh_used=0,usage_period_start=date_trunc('month',CURRENT_DATE)::date,updated_at=NOW() WHERE user_id=p_user_id;
    SELECT * INTO v FROM public.subscriptions WHERE user_id=p_user_id;
  END IF;
  IF v.status<>'ativo' THEN RETURN jsonb_build_object('allowed',false,'reason','SUBSCRIPTION_INACTIVE');END IF;
  CASE p_metric WHEN 'dispatch' THEN v_limit:=v.dispatch_limit;v_used:=v.dispatch_used;
    WHEN 'channel' THEN v_limit:=v.channel_limit;v_used:=v.channel_used;
    WHEN 'ai_generation' THEN v_limit:=v.ai_generation_limit;v_used:=v.ai_generation_used;
    WHEN 'affiliate_conversion' THEN v_limit:=v.affiliate_conversion_limit;v_used:=v.affiliate_conversion_used;
    WHEN 'monitored_group' THEN v_limit:=v.monitored_group_limit;v_used:=v.monitored_group_used;
    WHEN 'radar_refresh' THEN v_limit:=v.radar_refresh_limit;v_used:=v.radar_refresh_used;
    ELSE RAISE EXCEPTION 'USAGE_METRIC_INVALID';END CASE;
  IF v_used+v_amount>v_limit THEN RETURN jsonb_build_object('allowed',false,'metric',p_metric,'used',v_used,'limit',v_limit);END IF;
  CASE p_metric WHEN 'dispatch' THEN UPDATE public.subscriptions SET dispatch_used=dispatch_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'channel' THEN UPDATE public.subscriptions SET channel_used=channel_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'ai_generation' THEN UPDATE public.subscriptions SET ai_generation_used=ai_generation_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'affiliate_conversion' THEN UPDATE public.subscriptions SET affiliate_conversion_used=affiliate_conversion_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'monitored_group' THEN UPDATE public.subscriptions SET monitored_group_used=monitored_group_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'radar_refresh' THEN UPDATE public.subscriptions SET radar_refresh_used=radar_refresh_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;END CASE;
  RETURN jsonb_build_object('allowed',true,'metric',p_metric,'used',v_used+v_amount,'limit',v_limit);
END $$;
REVOKE ALL ON FUNCTION public.consume_subscription_usage(UUID,TEXT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_subscription_usage(UUID,TEXT,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_subscription_resource_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit INTEGER;v_count INTEGER;v_table TEXT:=TG_TABLE_NAME;
BEGIN
  IF v_table='whatsapp_connections' THEN
    SELECT channel_limit INTO v_limit FROM public.subscriptions WHERE user_id=NEW.user_id;
  ELSIF v_table='landing_pages' THEN
    SELECT landing_page_limit INTO v_limit FROM public.subscriptions WHERE user_id=NEW.user_id;
  ELSE RAISE EXCEPTION 'SUBSCRIPTION_RESOURCE_INVALID'; END IF;
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',v_table) INTO v_count USING NEW.user_id;
  IF v_count>=v_limit THEN
    IF v_table='whatsapp_connections' THEN RAISE EXCEPTION 'USAGE_LIMIT_CHANNEL';
    ELSE RAISE EXCEPTION 'USAGE_LIMIT_LANDING_PAGE'; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS enforce_subscription_channel_limit ON public.whatsapp_connections;
CREATE TRIGGER enforce_subscription_channel_limit BEFORE INSERT ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_resource_limit();
DROP TRIGGER IF EXISTS enforce_subscription_landing_page_limit ON public.landing_pages;
CREATE TRIGGER enforce_subscription_landing_page_limit BEFORE INSERT ON public.landing_pages
FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_resource_limit();
