-- Restaura a chave de idempotência usada pela atualização do Radar.
-- Necessária para ON CONFLICT (user_id, marketplace, external_product_id).

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_deals_user_marketplace_external_unique
  ON public.marketplace_deals(user_id, marketplace, external_product_id);
