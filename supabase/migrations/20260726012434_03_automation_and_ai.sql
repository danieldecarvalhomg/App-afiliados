-- =============================================================
-- MIGRATION 03: Automation & AI
-- Campanhas, Automações, Templates de IA, Monitor de Grupos,
-- Mensagens Capturadas, Conversões da IA, Landing Pages.
-- =============================================================

-- -------------------------------------------------------------
-- 6. CAMPAIGNS — Campanhas de marketing
-- -------------------------------------------------------------
CREATE TABLE public.campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  objective       TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'completed', 'draft')),
  start_date      TIMESTAMPTZ,
  end_date        TIMESTAMPTZ,
  target_channels JSONB NOT NULL DEFAULT '[]',
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.campaigns IS 'Campanhas de divulgação. Agrupa automações, templates e posts agendados.';

CREATE INDEX idx_campaigns_account_id ON public.campaigns(account_id);
CREATE INDEX idx_campaigns_status ON public.campaigns(account_id, status);

CREATE TRIGGER set_campaigns_updated_at BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam campanhas" ON public.campaigns
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 7. AUTOMATIONS — Regras Gatilho -> Condição -> Ação
-- trigger_config e action_config são JSONB para máxima flexibilidade
-- -------------------------------------------------------------
CREATE TABLE public.automations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id      UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT false,
  trigger_type     TEXT NOT NULL,
  trigger_config   JSONB NOT NULL DEFAULT '{}',
  condition_config JSONB NOT NULL DEFAULT '{}',
  action_type      TEXT NOT NULL,
  action_config    JSONB NOT NULL DEFAULT '{}',
  runs_count       INT NOT NULL DEFAULT 0,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.automations IS 'Regras de automação (Gatilho->Condição->Ação). Configuradas em JSONB para serem extensíveis.';

CREATE INDEX idx_automations_account_id ON public.automations(account_id);
CREATE INDEX idx_automations_active ON public.automations(account_id, is_active);

CREATE TRIGGER set_automations_updated_at BEFORE UPDATE ON public.automations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam automações" ON public.automations
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 8. AI_TEMPLATES — Templates com variáveis dinâmicas
-- content_template suporta {preco}, {link}, {titulo}, etc.
-- variables_schema documenta as variáveis esperadas
-- -------------------------------------------------------------
CREATE TABLE public.ai_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  content_template  TEXT NOT NULL,
  category          TEXT,
  variables_schema  JSONB NOT NULL DEFAULT '[]',
  is_default        BOOLEAN NOT NULL DEFAULT false,
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_templates IS 'Templates de mensagem com variáveis {preco}, {link}, {titulo} e lógica condicional. Recurso PRO.';

CREATE INDEX idx_ai_templates_account_id ON public.ai_templates(account_id);

CREATE TRIGGER set_ai_templates_updated_at BEFORE UPDATE ON public.ai_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam templates" ON public.ai_templates
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 9. MONITORED_GROUPS — Grupos externos monitorados
-- platform: whatsapp | telegram
-- auto_convert: se true, IA converte mensagens automaticamente
-- -------------------------------------------------------------
CREATE TABLE public.monitored_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  external_id         TEXT NOT NULL,
  group_name          TEXT NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  auto_convert        BOOLEAN NOT NULL DEFAULT false,
  default_template_id UUID REFERENCES public.ai_templates(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, platform, external_id)
);

COMMENT ON TABLE public.monitored_groups IS 'Grupos externos (WhatsApp/Telegram) monitorados pelo sistema. Recurso PRO/NOVO.';

CREATE INDEX idx_monitored_groups_account_id ON public.monitored_groups(account_id);
CREATE INDEX idx_monitored_groups_active ON public.monitored_groups(account_id, is_active);

CREATE TRIGGER set_monitored_groups_updated_at BEFORE UPDATE ON public.monitored_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.monitored_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam grupos monitorados" ON public.monitored_groups
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 10. MONITORED_MESSAGES — Mensagens brutas capturadas
-- status: raw (novo) | processed (convertido pela IA) | ignored
-- -------------------------------------------------------------
CREATE TABLE public.monitored_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  group_id         UUID NOT NULL REFERENCES public.monitored_groups(id) ON DELETE CASCADE,
  external_msg_id  TEXT,
  original_text    TEXT NOT NULL,
  raw_data         JSONB NOT NULL DEFAULT '{}',
  status           TEXT NOT NULL DEFAULT 'raw' CHECK (status IN ('raw', 'processed', 'ignored')),
  captured_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.monitored_messages IS 'Mensagens brutas capturadas dos grupos monitorados. Alimentam o fluxo ia_monitor de ofertas.';

CREATE INDEX idx_monitored_messages_account_id ON public.monitored_messages(account_id);
CREATE INDEX idx_monitored_messages_group_id ON public.monitored_messages(group_id);
CREATE INDEX idx_monitored_messages_status ON public.monitored_messages(account_id, status);
CREATE INDEX idx_monitored_messages_captured_at ON public.monitored_messages(account_id, captured_at DESC);

ALTER TABLE public.monitored_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem mensagens monitoradas" ON public.monitored_messages
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- Agora que monitored_messages existe, adicionar FK em offers
ALTER TABLE public.offers
  ADD CONSTRAINT offers_monitored_message_id_fkey
  FOREIGN KEY (monitored_message_id)
  REFERENCES public.monitored_messages(id) ON DELETE SET NULL;

-- -------------------------------------------------------------
-- 11. AI_CONVERSIONS — Histórico de conversões IA
-- Mensagem original -> Mensagem reescrita com template
-- -------------------------------------------------------------
CREATE TABLE public.ai_conversions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  monitored_message_id  UUID NOT NULL REFERENCES public.monitored_messages(id) ON DELETE CASCADE,
  template_id           UUID REFERENCES public.ai_templates(id) ON DELETE SET NULL,
  offer_id              UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  original_text         TEXT NOT NULL,
  converted_text        TEXT NOT NULL,
  ai_model_used         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_conversions IS 'Log de conversões da IA: mensagem capturada -> texto reescrito usando template.';

CREATE INDEX idx_ai_conversions_account_id ON public.ai_conversions(account_id);
CREATE INDEX idx_ai_conversions_message_id ON public.ai_conversions(monitored_message_id);

ALTER TABLE public.ai_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem conversões IA" ON public.ai_conversions
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- Agora que campaigns e ai_templates existem, adicionar FKs em scheduled_posts
ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.ai_templates(id) ON DELETE SET NULL;

-- -------------------------------------------------------------
-- 12. LANDING_PAGES — Landing pages de ofertas
-- slug deve ser único por conta
-- content: JSONB para blocos de conteúdo flexíveis
-- -------------------------------------------------------------
CREATE TABLE public.landing_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  offer_id    UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  views_count INT NOT NULL DEFAULT 0,
  clicks_count INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, slug)
);

COMMENT ON TABLE public.landing_pages IS 'Landing pages criadas pelo usuário para divulgar ofertas, com slug, conteúdo e métricas.';

CREATE INDEX idx_landing_pages_account_id ON public.landing_pages(account_id);
CREATE INDEX idx_landing_pages_status ON public.landing_pages(account_id, status);

CREATE TRIGGER set_landing_pages_updated_at BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam landing pages" ON public.landing_pages
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));;
