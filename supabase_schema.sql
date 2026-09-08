-- ============================================================
-- PROMOFY — MIGRAÇÃO LIMPA (Bloco 1: Clean Base)
-- ============================================================
-- Execute este script inteiro no SQL Editor do Supabase.
--
-- ⚠️  ATENÇÃO: Este script APAGA e RECRIA todas as tabelas.
--    Só execute se não houver dados de produção para preservar.
--    O objetivo é partir de uma base limpa com o novo schema.
-- ============================================================


-- ============================================================
-- 0. EXTENSÕES
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- 1. DROPAR TABELAS ANTIGAS (remove conflito de schema/políticas)
-- ============================================================
-- Usar CASCADE para remover políticas e dependências automaticamente
-- Proteção obrigatória contra execução acidental. Para um reset intencional,
-- execute antes, na mesma sessão: SET promofy.allow_destructive_reset = 'yes';

DO $$
BEGIN
  IF current_setting('promofy.allow_destructive_reset', true) IS DISTINCT FROM 'yes' THEN
    RAISE EXCEPTION 'RESET_DESTRUTIVO_BLOQUEADO: defina promofy.allow_destructive_reset=yes conscientemente.';
  END IF;
END $$;

DROP TABLE IF EXISTS public.monitored_groups           CASCADE;
DROP TABLE IF EXISTS public.captured_messages          CASCADE;
DROP TABLE IF EXISTS public.group_monitors             CASCADE;
DROP TABLE IF EXISTS public.whatsapp_groups            CASCADE;
DROP TABLE IF EXISTS public.whatsapp_connections       CASCADE;
DROP TABLE IF EXISTS public.affiliate_conversions      CASCADE;
DROP TABLE IF EXISTS public.affiliate_accounts         CASCADE;
DROP TABLE IF EXISTS public.cta_conversations          CASCADE;
DROP TABLE IF EXISTS public.cta_history                CASCADE;
DROP TABLE IF EXISTS public.cta_rules                  CASCADE;
DROP TABLE IF EXISTS public.cta_profiles               CASCADE;
DROP TABLE IF EXISTS public.campaign_destinations      CASCADE;
DROP TABLE IF EXISTS public.campaigns                  CASCADE;
DROP TABLE IF EXISTS public.queue_items                CASCADE;
DROP TABLE IF EXISTS public.queue_configs              CASCADE;
DROP TABLE IF EXISTS public.copy_templates             CASCADE;
DROP TABLE IF EXISTS public.crm_leads                  CASCADE;
DROP TABLE IF EXISTS public.landing_pages              CASCADE;
DROP TABLE IF EXISTS public.integrations               CASCADE;
DROP TABLE IF EXISTS public.system_events              CASCADE;
DROP TABLE IF EXISTS public.system_logs                CASCADE;
DROP TABLE IF EXISTS public.products                   CASCADE;
DROP TABLE IF EXISTS public.profiles                   CASCADE;


-- ============================================================
-- 2. CRIAR TABELAS (nova estrutura — UUIDs, user_id, correto)
-- ============================================================

-- ── profiles ─────────────────────────────────────────────────
-- PK = auth.users.id (não tem user_id separado — usa id diretamente)
CREATE TABLE public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name  TEXT,
  avatar_url TEXT,
  settings   JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── whatsapp_connections ──────────────────────────────────────
CREATE TABLE public.whatsapp_connections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  phone      TEXT,
  status     TEXT NOT NULL DEFAULT 'disconnected'
             CHECK (status IN ('disconnected','qr_required','connecting','connected','reconnecting','logged_out','error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── whatsapp_groups ───────────────────────────────────────────
CREATE TABLE public.whatsapp_groups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  connection_id       UUID NOT NULL REFERENCES public.whatsapp_connections ON DELETE CASCADE,
  external_group_id   TEXT NOT NULL,
  name                TEXT NOT NULL,
  participants_count  INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, external_group_id)
);

-- ── group_monitors ────────────────────────────────────────────
CREATE TABLE public.group_monitors (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  group_id           UUID REFERENCES public.whatsapp_groups ON DELETE SET NULL,
  name               TEXT NOT NULL,
  platform           TEXT NOT NULL DEFAULT 'WhatsApp' CHECK (platform IN ('WhatsApp','Telegram')),
  external_id_or_url TEXT,
  linked_store       TEXT DEFAULT 'all',
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  review_required    BOOLEAN NOT NULL DEFAULT TRUE,
  rules              JSONB DEFAULT '{}',
  captured_count     INTEGER DEFAULT 0,
  approved_count     INTEGER DEFAULT 0,
  last_activity_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── captured_messages ─────────────────────────────────────────
CREATE TABLE public.captured_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  monitor_id     UUID REFERENCES public.group_monitors ON DELETE SET NULL,
  raw_content    TEXT NOT NULL,
  image_url      TEXT,
  extracted_data JSONB,
  confidence     NUMERIC(3,2) DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected','processing','failed')),
  received_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── affiliate_accounts ────────────────────────────────────────
CREATE TABLE public.affiliate_accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  platform   TEXT NOT NULL,
  tag        TEXT,
  status     TEXT NOT NULL DEFAULT 'not_configured'
             CHECK (status IN ('not_configured','configured','error')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- ── affiliate_conversions ─────────────────────────────────────
CREATE TABLE public.affiliate_conversions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  account_id    UUID REFERENCES public.affiliate_accounts ON DELETE SET NULL,
  original_url  TEXT NOT NULL,
  converted_url TEXT,
  platform      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('success','conversion_failed','platform_not_supported','not_configured','pending')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── cta_profiles ──────────────────────────────────────────────
CREATE TABLE public.cta_profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tone            TEXT DEFAULT 'urgent',
  length          TEXT NOT NULL DEFAULT 'medium' CHECK (length IN ('short','medium','long')),
  emoji_level     TEXT NOT NULL DEFAULT 'moderate' CHECK (emoji_level IN ('none','moderate','heavy')),
  repetition_mode TEXT NOT NULL DEFAULT 'balanced' CHECK (repetition_mode IN ('low','balanced','flexible','custom')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ── cta_rules ─────────────────────────────────────────────────
CREATE TABLE public.cta_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.cta_profiles ON DELETE CASCADE,
  rule_type  TEXT NOT NULL CHECK (rule_type IN ('forbidden_word','required_word','forbidden_phrase')),
  value      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── cta_history ───────────────────────────────────────────────
CREATE TABLE public.cta_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  cta_text   TEXT NOT NULL,
  rating     TEXT CHECK (rating IN ('good','bad','neutral')),
  context    JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── cta_conversations ─────────────────────────────────────────
CREATE TABLE public.cta_conversations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── products ──────────────────────────────────────────────────
CREATE TABLE public.products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title            TEXT NOT NULL,
  original_price   NUMERIC(10,2) DEFAULT 0.00,
  price            NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  discount_percent INTEGER DEFAULT 0,
  rating           NUMERIC(3,2) DEFAULT 5.0,
  reviews_count    INTEGER DEFAULT 0,
  category         TEXT DEFAULT 'Geral',
  marketplace      TEXT NOT NULL,
  raw_url          TEXT,
  affiliate_url    TEXT,
  coupon_code      TEXT,
  image            TEXT,
  status           TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','pausado','esgotado','link_quebrado')),
  is_favorite      BOOLEAN DEFAULT FALSE,
  is_archived      BOOLEAN DEFAULT FALSE,
  hot_score        INTEGER DEFAULT 80,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── campaigns ─────────────────────────────────────────────────
CREATE TABLE public.campaigns (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name           TEXT NOT NULL,
  type           TEXT DEFAULT 'Disparo Único',
  status         TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','agendada','finalizada','pausada')),
  total_sent     INTEGER DEFAULT 0,
  clicks         INTEGER DEFAULT 0,
  conversions    INTEGER DEFAULT 0,
  revenue        NUMERIC(10,2) DEFAULT 0.00,
  scheduled_date TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── campaign_destinations ─────────────────────────────────────
CREATE TABLE public.campaign_destinations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES public.campaigns ON DELETE CASCADE,
  group_id     UUID REFERENCES public.whatsapp_groups ON DELETE SET NULL,
  channel_name TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── queue_configs ─────────────────────────────────────────────
CREATE TABLE public.queue_configs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name               TEXT NOT NULL,
  platform           TEXT NOT NULL,
  channel_name       TEXT NOT NULL,
  channel_id         TEXT,
  status             TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','pausada')),
  interval_minutes   INTEGER DEFAULT 15,
  auto_shuffle       BOOLEAN DEFAULT TRUE,
  peak_hours_only    BOOLEAN DEFAULT TRUE,
  days_of_week       JSONB DEFAULT '["seg","ter","qua","qui","sex","sab","dom"]',
  time_window_start  TEXT DEFAULT '08:00',
  time_window_end    TEXT DEFAULT '22:00',
  next_delivery_time TEXT,
  last_delivery_time TEXT,
  total_pending      INTEGER DEFAULT 0,
  total_sent         INTEGER DEFAULT 0,
  total_failed       INTEGER DEFAULT 0,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ── queue_items ───────────────────────────────────────────────
CREATE TABLE public.queue_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  queue_config_id UUID REFERENCES public.queue_configs ON DELETE CASCADE,
  product_id      UUID REFERENCES public.products ON DELETE SET NULL,
  product_title   TEXT NOT NULL,
  product_image   TEXT,
  price           NUMERIC(10,2),
  original_price  NUMERIC(10,2),
  marketplace     TEXT,
  copy_text       TEXT NOT NULL,
  affiliate_url   TEXT NOT NULL,
  channel_ids     JSONB DEFAULT '[]',
  scheduled_for   TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','enviando','enviado','falhou','pausado')),
  priority        INTEGER DEFAULT 1,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── copy_templates ────────────────────────────────────────────
CREATE TABLE public.copy_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title       TEXT NOT NULL,
  category    TEXT DEFAULT 'Geral',
  store       TEXT DEFAULT 'Todas as Lojas',
  content     TEXT NOT NULL,
  usage_count INTEGER DEFAULT 0,
  is_favorite BOOLEAN DEFAULT FALSE,
  is_default  BOOLEAN DEFAULT FALSE,
  status      TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','inativo')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── crm_leads ─────────────────────────────────────────────────
CREATE TABLE public.crm_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name             TEXT NOT NULL,
  handle_or_phone  TEXT NOT NULL,
  platform         TEXT DEFAULT 'Telegram',
  tags             JSONB DEFAULT '[]',
  engagement_score INTEGER DEFAULT 50,
  total_clicks     INTEGER DEFAULT 0,
  last_active      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── landing_pages ─────────────────────────────────────────────
CREATE TABLE public.landing_pages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title                 TEXT NOT NULL,
  slug                  TEXT NOT NULL,
  views                 INTEGER DEFAULT 0,
  clicks                INTEGER DEFAULT 0,
  conversion_rate       NUMERIC(5,2) DEFAULT 0,
  active_products_count INTEGER DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('publicada','rascunho')),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, slug)
);

-- ── integrations ──────────────────────────────────────────────
CREATE TABLE public.integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  key                  TEXT NOT NULL,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL CHECK (category IN ('marketplace','social')),
  logo_icon_name       TEXT,
  configuration_status TEXT NOT NULL DEFAULT 'not_configured'
                       CHECK (configuration_status IN ('not_configured','configured')),
  connection_status    TEXT NOT NULL DEFAULT 'disconnected'
                       CHECK (connection_status IN ('disconnected','connected','error')),
  tag_afiliado         TEXT,
  webhook_url          TEXT,
  last_sync            TEXT DEFAULT 'Pendente de configuração',
  description          TEXT,
  logs_count           INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

-- ── system_logs ───────────────────────────────────────────────
CREATE TABLE public.system_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','error','success')),
  module     TEXT NOT NULL,
  message    TEXT NOT NULL,
  details    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── system_events ─────────────────────────────────────────────
CREATE TABLE public.system_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload    JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 3. ROW LEVEL SECURITY — Habilitar em todas as tabelas
-- ============================================================
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_monitors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_rules              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cta_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_destinations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_configs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_pages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_events          ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. POLÍTICAS RLS
-- ============================================================

-- profiles: usa id = auth.uid() (não user_id — a PK é o próprio auth.uid())
CREATE POLICY "profiles_owner" ON public.profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "whatsapp_connections_owner" ON public.whatsapp_connections
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "whatsapp_groups_owner" ON public.whatsapp_groups
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "group_monitors_owner" ON public.group_monitors
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "captured_messages_owner" ON public.captured_messages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "affiliate_accounts_owner" ON public.affiliate_accounts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "affiliate_conversions_owner" ON public.affiliate_conversions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "cta_profiles_owner" ON public.cta_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "cta_rules_owner" ON public.cta_rules
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "cta_history_owner" ON public.cta_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "cta_conversations_owner" ON public.cta_conversations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "products_owner" ON public.products
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "campaigns_owner" ON public.campaigns
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- campaign_destinations: valida ownership cruzado com campaigns
CREATE POLICY "campaign_destinations_owner" ON public.campaign_destinations
  FOR ALL
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "queue_configs_owner" ON public.queue_configs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "queue_items_owner" ON public.queue_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "copy_templates_owner" ON public.copy_templates
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "crm_leads_owner" ON public.crm_leads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "landing_pages_owner" ON public.landing_pages
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "integrations_owner" ON public.integrations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "system_logs_owner" ON public.system_logs
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "system_events_owner" ON public.system_events
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ============================================================
-- 5. TRIGGER: Auto-criar profile ao registrar usuário
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
