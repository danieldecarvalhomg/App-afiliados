-- =============================================================
-- MIGRATION 02: Offers & Scheduled Posts
-- Propósito: Feed de Ofertas (suporte a criação manual e via IA)
-- e Fila de Agendamentos de publicações.
-- =============================================================

-- -------------------------------------------------------------
-- 4. OFFERS — Promosções/Ofertas
-- origin: 'ia_monitor' = capturada pelo Monitor de Grupos
--         'manual'     = criada pelo próprio usuário
-- monitored_message_id: referência opcional à mensagem de origem (IA)
-- created_by: usuário que criou (manual) ou null (IA automática)
-- -------------------------------------------------------------
CREATE TABLE public.offers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  description           TEXT,
  price                 NUMERIC(12,2),
  original_price        NUMERIC(12,2),
  discount_percentage   NUMERIC(5,2),
  coupon_code           TEXT,
  affiliate_url         TEXT,
  image_url             TEXT,
  source_name           TEXT,
  origin                TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('ia_monitor', 'manual')),
  -- referência à mensagem monitorada de onde a IA extraiu a oferta
  monitored_message_id  UUID, -- FK adicionada em migration 03 (tabela ainda não existe)
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'draft')),
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.offers IS 'Ofertas/promoções. origin indica se foi criada pelo usuário (manual) ou pela IA de monitoramento (ia_monitor).';
COMMENT ON COLUMN public.offers.origin IS 'Fonte da oferta: manual (usuário) ou ia_monitor (Monitor de Grupos com IA).';
COMMENT ON COLUMN public.offers.monitored_message_id IS 'FK para monitored_messages. Preenchido apenas quando origin = ia_monitor.';
COMMENT ON COLUMN public.offers.created_by IS 'Usuário que criou a oferta manualmente. NULL quando criada pela IA.';

CREATE INDEX idx_offers_account_id ON public.offers(account_id);
CREATE INDEX idx_offers_status ON public.offers(account_id, status);
CREATE INDEX idx_offers_origin ON public.offers(account_id, origin);
CREATE INDEX idx_offers_created_at ON public.offers(account_id, created_at DESC);

CREATE TRIGGER set_offers_updated_at BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da conta gerenciam ofertas" ON public.offers
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 5. SCHEDULED_POSTS — Fila de publicações
-- Vincula oferta + canal + template + campanha
-- Funciona igualmente para ofertas manuais e via IA
-- -------------------------------------------------------------
CREATE TABLE public.scheduled_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  offer_id        UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  campaign_id     UUID, -- FK adicionada em migration 03
  channel_id      UUID, -- FK adicionada em migration 04
  template_id     UUID, -- FK adicionada em migration 03
  content         TEXT,
  image_url       TEXT,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message   TEXT,
  sent_at         TIMESTAMPTZ,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.scheduled_posts IS 'Fila de postagens agendadas. Funciona para qualquer origem de oferta (manual ou IA).';

CREATE INDEX idx_scheduled_posts_account_id ON public.scheduled_posts(account_id);
CREATE INDEX idx_scheduled_posts_status ON public.scheduled_posts(account_id, status);
CREATE INDEX idx_scheduled_posts_scheduled_for ON public.scheduled_posts(account_id, scheduled_for);
CREATE INDEX idx_scheduled_posts_offer_id ON public.scheduled_posts(offer_id);

CREATE TRIGGER set_scheduled_posts_updated_at BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.scheduled_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da conta gerenciam fila" ON public.scheduled_posts
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));;
