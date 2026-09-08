-- =============================================================
-- MIGRATION 07: Realtime Publication & Helper Functions
-- Habilita Supabase Realtime para tabelas chave.
-- =============================================================

-- Adicionar tabelas à publicação do Realtime do Supabase
ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitored_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_conversions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_events;

-- Função para registrar estatísticas rápidas do dashboard
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(acc_id UUID)
RETURNS JSONB AS $$
DECLARE
  active_offers_count INT;
  active_campaigns_count INT;
  pending_posts_count INT;
  today_conversions_count INT;
BEGIN
  SELECT COUNT(*) INTO active_offers_count FROM public.offers WHERE account_id = acc_id AND status = 'active';
  SELECT COUNT(*) INTO active_campaigns_count FROM public.campaigns WHERE account_id = acc_id AND status = 'active';
  SELECT COUNT(*) INTO pending_posts_count FROM public.scheduled_posts WHERE account_id = acc_id AND status = 'pending';
  SELECT COUNT(*) INTO today_conversions_count FROM public.ai_conversions WHERE account_id = acc_id AND created_at >= NOW() - INTERVAL '24 hours';

  RETURN jsonb_build_object(
    'active_offers', active_offers_count,
    'active_campaigns', active_campaigns_count,
    'pending_posts', pending_posts_count,
    'today_conversions', today_conversions_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;;
