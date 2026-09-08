-- Analytics operacional: índices das fontes de verdade já existentes.
-- Nenhuma tabela de fatos/rollup é criada; o volume atual não justifica duplicação.

CREATE INDEX IF NOT EXISTS queue_deliveries_user_sent_idx
  ON public.queue_deliveries(user_id, sent_at DESC, connection_id, whatsapp_group_id)
  WHERE status = 'sent' AND sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_deliveries_user_failure_idx
  ON public.queue_deliveries(user_id, last_error_at DESC, connection_id, whatsapp_group_id)
  WHERE status IN ('failed', 'uncertain') AND last_error_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS queue_items_user_created_product_idx
  ON public.queue_items(user_id, created_at DESC, product_id);

CREATE INDEX IF NOT EXISTS automation_snapshots_user_prepared_idx
  ON public.automation_prepared_snapshots(user_id, prepared_at DESC, product_id);

CREATE INDEX IF NOT EXISTS affiliate_conversions_user_converted_idx
  ON public.affiliate_conversions(user_id, converted_at DESC, detected_platform)
  WHERE status = 'converted' AND converted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS capture_sources_user_observed_dimensions_idx
  ON public.captured_message_sources(user_id, observed_at DESC, connection_id, group_id);

CREATE INDEX IF NOT EXISTS products_user_marketplace_created_idx
  ON public.products(user_id, marketplace, created_at DESC);

CREATE INDEX IF NOT EXISTS automation_executions_user_created_idx
  ON public.automation_executions(user_id, created_at DESC, automation_id);

CREATE INDEX IF NOT EXISTS marketplace_discovery_runs_user_sync_idx
  ON public.marketplace_discovery_runs(user_id, marketplace, updated_at DESC);

COMMENT ON INDEX public.queue_deliveries_user_sent_idx IS
  'Suporta Analytics de envios reais por owner, período, conexão e grupo.';
COMMENT ON INDEX public.affiliate_conversions_user_converted_idx IS
  'Suporta contagem de links afiliados gerados; não representa clique, pedido ou venda.';
