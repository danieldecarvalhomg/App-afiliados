-- Analytics financeiro real: fatos normalizados recebidos de relatórios oficiais.

CREATE TABLE IF NOT EXISTS public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee','amazon','mercado_livre')),
  external_order_id TEXT NOT NULL,
  external_conversion_id TEXT,
  affiliate_conversion_id UUID REFERENCES public.affiliate_conversions(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  prepared_message_id UUID REFERENCES public.automation_prepared_snapshots(id) ON DELETE SET NULL,
  queue_item_id UUID REFERENCES public.queue_items(id) ON DELETE SET NULL,
  delivery_id UUID REFERENCES public.queue_deliveries(id) ON DELETE SET NULL,
  group_id UUID REFERENCES public.whatsapp_groups(id) ON DELETE SET NULL,
  automation_id UUID REFERENCES public.automation_rules(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.cta_templates(id) ON DELETE SET NULL,
  template_version INTEGER,
  cta_generation_id UUID REFERENCES public.cta_history(id) ON DELETE SET NULL,
  purchased_at TIMESTAMPTZ NOT NULL,
  attributed_click_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','REFUNDED')),
  external_status TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BRL',
  sales_value NUMERIC(14,2) NOT NULL CHECK (sales_value >= 0),
  estimated_commission NUMERIC(14,2) CHECK (estimated_commission IS NULL OR estimated_commission >= 0),
  confirmed_commission NUMERIC(14,2) CHECK (confirmed_commission IS NULL OR confirmed_commission >= 0),
  tracking_sub_id TEXT,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, marketplace, external_order_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.marketplace_orders(id) ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee','amazon','mercado_livre')),
  external_item_id TEXT NOT NULL,
  name TEXT,
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  estimated_commission NUMERIC(14,2) CHECK (estimated_commission IS NULL OR estimated_commission >= 0),
  attribution_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_id, external_item_id)
);

CREATE TABLE IF NOT EXISTS public.marketplace_analytics_sync_states (
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  marketplace TEXT NOT NULL CHECK (marketplace IN ('shopee','amazon','mercado_livre')),
  status TEXT NOT NULL CHECK (status IN ('SYNCED','SYNCING','DEGRADED','FAILED')),
  last_sync_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id, marketplace)
);

CREATE INDEX IF NOT EXISTS marketplace_orders_user_purchase_idx
  ON public.marketplace_orders(user_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_user_marketplace_purchase_idx
  ON public.marketplace_orders(user_id, marketplace, purchased_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_orders_user_product_purchase_idx
  ON public.marketplace_orders(user_id, product_id, purchased_at DESC)
  WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS marketplace_order_items_order_idx
  ON public.marketplace_order_items(order_id);

CREATE OR REPLACE FUNCTION public.validate_marketplace_order_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.affiliate_conversion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_conversions c
    WHERE c.id = NEW.affiliate_conversion_id AND c.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_CONVERSION_OWNER_MISMATCH'; END IF;
  IF NEW.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = NEW.product_id AND p.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_PRODUCT_OWNER_MISMATCH'; END IF;
  IF NEW.prepared_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.automation_prepared_snapshots s
    WHERE s.id = NEW.prepared_message_id AND s.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_PREPARED_OWNER_MISMATCH'; END IF;
  IF NEW.queue_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.queue_items q WHERE q.id = NEW.queue_item_id AND q.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_QUEUE_OWNER_MISMATCH'; END IF;
  IF NEW.delivery_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.queue_deliveries d WHERE d.id = NEW.delivery_id AND d.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_DELIVERY_OWNER_MISMATCH'; END IF;
  IF NEW.group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_groups g WHERE g.id = NEW.group_id AND g.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_GROUP_OWNER_MISMATCH'; END IF;
  IF NEW.automation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.automation_rules a WHERE a.id = NEW.automation_id AND a.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_AUTOMATION_OWNER_MISMATCH'; END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cta_templates t WHERE t.id = NEW.template_id AND t.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_TEMPLATE_OWNER_MISMATCH'; END IF;
  IF NEW.cta_generation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cta_history c WHERE c.id = NEW.cta_generation_id AND c.user_id = NEW.user_id
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_CTA_OWNER_MISMATCH'; END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_marketplace_order_item_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_orders o
    WHERE o.id = NEW.order_id AND o.user_id = NEW.user_id
      AND o.marketplace = NEW.marketplace
  ) THEN RAISE EXCEPTION 'MARKETPLACE_ORDER_ITEM_OWNER_MISMATCH'; END IF;
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_marketplace_order_owner_trigger
  ON public.marketplace_orders;
CREATE TRIGGER validate_marketplace_order_owner_trigger
  BEFORE INSERT OR UPDATE ON public.marketplace_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_marketplace_order_owner();

DROP TRIGGER IF EXISTS validate_marketplace_order_item_owner_trigger
  ON public.marketplace_order_items;
CREATE TRIGGER validate_marketplace_order_item_owner_trigger
  BEFORE INSERT OR UPDATE ON public.marketplace_order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_marketplace_order_item_owner();

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_analytics_sync_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_orders_owner ON public.marketplace_orders;
CREATE POLICY marketplace_orders_owner ON public.marketplace_orders
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS marketplace_order_items_owner ON public.marketplace_order_items;
CREATE POLICY marketplace_order_items_owner ON public.marketplace_order_items
  FOR SELECT USING (user_id = auth.uid());
DROP POLICY IF EXISTS marketplace_analytics_sync_states_owner
  ON public.marketplace_analytics_sync_states;
CREATE POLICY marketplace_analytics_sync_states_owner
  ON public.marketplace_analytics_sync_states FOR SELECT
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.marketplace_orders,
  public.marketplace_order_items, public.marketplace_analytics_sync_states
  FROM anon, authenticated;
