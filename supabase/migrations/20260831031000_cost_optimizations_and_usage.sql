-- Economia operacional: limites mensais reais, atualizações ao vivo e operações do Radar em lote.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS affiliate_conversion_limit INTEGER NOT NULL DEFAULT 2000 CHECK (affiliate_conversion_limit >= 0),
  ADD COLUMN IF NOT EXISTS affiliate_conversion_used INTEGER NOT NULL DEFAULT 0 CHECK (affiliate_conversion_used >= 0),
  ADD COLUMN IF NOT EXISTS monitored_group_limit INTEGER NOT NULL DEFAULT 20 CHECK (monitored_group_limit >= 0),
  ADD COLUMN IF NOT EXISTS monitored_group_used INTEGER NOT NULL DEFAULT 0 CHECK (monitored_group_used >= 0),
  ADD COLUMN IF NOT EXISTS radar_refresh_limit INTEGER NOT NULL DEFAULT 3000 CHECK (radar_refresh_limit >= 0),
  ADD COLUMN IF NOT EXISTS radar_refresh_used INTEGER NOT NULL DEFAULT 0 CHECK (radar_refresh_used >= 0),
  ADD COLUMN IF NOT EXISTS usage_period_start DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::date;

INSERT INTO public.subscriptions(
  user_id,plan_name,price_monthly,status,renewal_date,
  dispatch_limit,channel_limit,ai_generation_limit,
  affiliate_conversion_limit,monitored_group_limit,radar_refresh_limit
)
SELECT id,'Beta',0,'ativo',NOW()+INTERVAL '1 month',5000,5,10000,2000,20,3000
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_default_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.subscriptions(
    user_id,plan_name,price_monthly,status,renewal_date,
    dispatch_limit,channel_limit,ai_generation_limit,
    affiliate_conversion_limit,monitored_group_limit,radar_refresh_limit
  ) VALUES (NEW.id,'Beta',0,'ativo',NOW()+INTERVAL '1 month',5000,5,10000,2000,20,3000)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS create_default_subscription ON auth.users;
CREATE TRIGGER create_default_subscription AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.ensure_default_subscription();

CREATE OR REPLACE FUNCTION public.consume_subscription_usage(
  p_user_id UUID, p_metric TEXT, p_amount INTEGER DEFAULT 1
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v public.subscriptions%ROWTYPE;
  v_limit INTEGER;
  v_used INTEGER;
  v_amount INTEGER := GREATEST(1,COALESCE(p_amount,1));
BEGIN
  INSERT INTO public.subscriptions(user_id,plan_name,price_monthly,status,renewal_date,dispatch_limit,channel_limit,ai_generation_limit,affiliate_conversion_limit,monitored_group_limit,radar_refresh_limit)
  VALUES(p_user_id,'Beta',0,'ativo',NOW()+INTERVAL '1 month',5000,5,10000,2000,20,3000)
  ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v FROM public.subscriptions WHERE user_id=p_user_id FOR UPDATE;
  IF v.usage_period_start < date_trunc('month',CURRENT_DATE)::date THEN
    UPDATE public.subscriptions SET dispatch_used=0,ai_generation_used=0,affiliate_conversion_used=0,radar_refresh_used=0,
      usage_period_start=date_trunc('month',CURRENT_DATE)::date,updated_at=NOW() WHERE user_id=p_user_id;
    SELECT * INTO v FROM public.subscriptions WHERE user_id=p_user_id;
  END IF;
  IF v.status <> 'ativo' THEN RETURN jsonb_build_object('allowed',false,'reason','SUBSCRIPTION_INACTIVE'); END IF;
  CASE p_metric
    WHEN 'dispatch' THEN v_limit:=v.dispatch_limit;v_used:=v.dispatch_used;
    WHEN 'channel' THEN v_limit:=v.channel_limit;v_used:=v.channel_used;
    WHEN 'ai_generation' THEN v_limit:=v.ai_generation_limit;v_used:=v.ai_generation_used;
    WHEN 'affiliate_conversion' THEN v_limit:=v.affiliate_conversion_limit;v_used:=v.affiliate_conversion_used;
    WHEN 'monitored_group' THEN v_limit:=v.monitored_group_limit;v_used:=v.monitored_group_used;
    WHEN 'radar_refresh' THEN v_limit:=v.radar_refresh_limit;v_used:=v.radar_refresh_used;
    ELSE RAISE EXCEPTION 'USAGE_METRIC_INVALID';
  END CASE;
  IF v_used+v_amount>v_limit THEN RETURN jsonb_build_object('allowed',false,'metric',p_metric,'used',v_used,'limit',v_limit); END IF;
  CASE p_metric
    WHEN 'dispatch' THEN UPDATE public.subscriptions SET dispatch_used=dispatch_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'channel' THEN UPDATE public.subscriptions SET channel_used=channel_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'ai_generation' THEN UPDATE public.subscriptions SET ai_generation_used=ai_generation_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'affiliate_conversion' THEN UPDATE public.subscriptions SET affiliate_conversion_used=affiliate_conversion_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'monitored_group' THEN UPDATE public.subscriptions SET monitored_group_used=monitored_group_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
    WHEN 'radar_refresh' THEN UPDATE public.subscriptions SET radar_refresh_used=radar_refresh_used+v_amount,updated_at=NOW() WHERE user_id=p_user_id;
  END CASE;
  RETURN jsonb_build_object('allowed',true,'metric',p_metric,'used',v_used+v_amount,'limit',v_limit);
END $$;

REVOKE ALL ON FUNCTION public.consume_subscription_usage(UUID,TEXT,INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_subscription_usage(UUID,TEXT,INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_missing_marketplace_deals(p_user_id UUID,p_marketplace TEXT,p_seen TEXT[])
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE public.marketplace_deals
  SET missing_cycles=missing_cycles+1,status=CASE WHEN missing_cycles+1>=3 THEN 'unavailable' ELSE 'stale' END,updated_at=NOW()
  WHERE user_id=p_user_id AND marketplace=p_marketplace AND status='active'
    AND NOT(external_product_id=ANY(COALESCE(p_seen,ARRAY[]::TEXT[])));
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.mark_missing_marketplace_deals(UUID,TEXT,TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mark_missing_marketplace_deals(UUID,TEXT,TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_monitored_group_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit INTEGER;v_count INTEGER;
BEGIN
  SELECT monitored_group_limit INTO v_limit FROM public.subscriptions WHERE user_id=NEW.user_id;
  SELECT COUNT(*) INTO v_count FROM public.group_monitors WHERE user_id=NEW.user_id;
  IF v_limit IS NOT NULL AND v_count>=v_limit THEN RAISE EXCEPTION 'USAGE_LIMIT_MONITORED_GROUP'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_monitored_group_limit_trigger ON public.group_monitors;
CREATE TRIGGER enforce_monitored_group_limit_trigger BEFORE INSERT ON public.group_monitors
FOR EACH ROW EXECUTE FUNCTION public.enforce_monitored_group_limit();

CREATE OR REPLACE FUNCTION public.sync_subscription_resource_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user UUID:=COALESCE(NEW.user_id,OLD.user_id);
BEGIN
  UPDATE public.subscriptions SET
    monitored_group_used=(SELECT COUNT(*) FROM public.group_monitors WHERE user_id=v_user),
    channel_used=(SELECT COUNT(*) FROM public.whatsapp_connections WHERE user_id=v_user),
    updated_at=NOW()
  WHERE user_id=v_user;
  RETURN COALESCE(NEW,OLD);
END $$;
DROP TRIGGER IF EXISTS sync_subscription_monitor_count ON public.group_monitors;
CREATE TRIGGER sync_subscription_monitor_count AFTER INSERT OR DELETE ON public.group_monitors
FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_resource_counts();
DROP TRIGGER IF EXISTS sync_subscription_channel_count ON public.whatsapp_connections;
CREATE TRIGGER sync_subscription_channel_count AFTER INSERT OR DELETE ON public.whatsapp_connections
FOR EACH ROW EXECUTE FUNCTION public.sync_subscription_resource_counts();

UPDATE public.subscriptions s SET
  monitored_group_used=(SELECT COUNT(*) FROM public.group_monitors g WHERE g.user_id=s.user_id),
  channel_used=(SELECT COUNT(*) FROM public.whatsapp_connections w WHERE w.user_id=s.user_id);

CREATE TABLE IF NOT EXISTS public.product_media_cleanup_queue(
  storage_path TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
REVOKE ALL ON public.product_media_cleanup_queue FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.product_media_cleanup_queue TO service_role;
CREATE OR REPLACE FUNCTION public.queue_deleted_product_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF OLD.storage_path IS NOT NULL THEN INSERT INTO public.product_media_cleanup_queue(storage_path) VALUES(OLD.storage_path) ON CONFLICT DO NOTHING; END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS queue_deleted_product_media_trigger ON public.product_media_assets;
CREATE TRIGGER queue_deleted_product_media_trigger BEFORE DELETE ON public.product_media_assets
FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_product_media();

ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.captured_messages REPLICA IDENTITY FULL;
ALTER TABLE public.marketplace_deals REPLICA IDENTITY FULL;
ALTER TABLE public.marketplace_discovery_runs REPLICA IDENTITY FULL;
ALTER TABLE public.subscriptions REPLICA IDENTITY FULL;

DO $$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['products','captured_messages','marketplace_deals','marketplace_discovery_runs','subscriptions'] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
    END IF;
  END LOOP;
END $$;
