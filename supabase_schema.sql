-- ===================================================
-- AFFIFLOW AI - SCRIPT SQL COMPLETO & SAFE PARA SUPABASE
-- ===================================================
-- Instruções: Selecione TODO o texto abaixo (Ctrl+A) e clique em RUN!

-- 1. CRIAÇÃO DAS TABELAS
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  original_price NUMERIC(10, 2) DEFAULT 0.00,
  price NUMERIC(10, 2) NOT NULL,
  discount_percent INTEGER DEFAULT 0,
  rating NUMERIC(3, 2) DEFAULT 5.0,
  reviews_count INTEGER DEFAULT 0,
  category TEXT DEFAULT 'Geral',
  marketplace TEXT NOT NULL,
  raw_url TEXT,
  affiliate_url TEXT NOT NULL,
  coupon_code TEXT,
  image TEXT,
  status TEXT DEFAULT 'ativo',
  is_favorite BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  collection_id TEXT,
  hot_score INTEGER DEFAULT 80,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.queue_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  channel_id TEXT,
  status TEXT DEFAULT 'ativa',
  interval_minutes INTEGER DEFAULT 15,
  auto_shuffle BOOLEAN DEFAULT true,
  peak_hours_only BOOLEAN DEFAULT true,
  days_of_week JSONB,
  time_window_start TEXT DEFAULT '08:00',
  time_window_end TEXT DEFAULT '22:00',
  next_delivery_time TEXT,
  last_delivery_time TEXT,
  total_pending INTEGER DEFAULT 0,
  total_sent INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.queue_items (
  id TEXT PRIMARY KEY,
  queue_config_id TEXT,
  product_id TEXT,
  product_title TEXT NOT NULL,
  product_image TEXT,
  price NUMERIC(10, 2),
  original_price NUMERIC(10, 2),
  marketplace TEXT,
  copy_text TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  channel_ids JSONB,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pendente',
  priority INTEGER DEFAULT 1,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'Disparo Único',
  status TEXT DEFAULT 'ativa',
  target_channels JSONB,
  total_sent INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue NUMERIC(10, 2) DEFAULT 0.00,
  scheduled_date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle_or_phone TEXT NOT NULL,
  platform TEXT DEFAULT 'Telegram',
  tags JSONB,
  engagement_score INTEGER DEFAULT 50,
  total_clicks INTEGER DEFAULT 0,
  last_active TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_logs (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  level TEXT DEFAULT 'info',
  module TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT
);

-- 2. HABILITAR RLS (ROW LEVEL SECURITY)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- 3. REMOVER POLÍTICAS ANTIGAS SE EXISTIREM (EVITA ERRO DE DUPLICATA)
DROP POLICY IF EXISTS "Acesso Total Produtos" ON public.products;
DROP POLICY IF EXISTS "Acesso Total Filas Config" ON public.queue_configs;
DROP POLICY IF EXISTS "Acesso Total Filas Itens" ON public.queue_items;
DROP POLICY IF EXISTS "Acesso Total Campanhas" ON public.campaigns;
DROP POLICY IF EXISTS "Acesso Total CRM Leads" ON public.crm_leads;
DROP POLICY IF EXISTS "Acesso Total System Logs" ON public.system_logs;

-- 4. CRIAR POLÍTICAS DE PERMISSÃO PÚBLICA (READ/WRITE)
CREATE POLICY "Acesso Total Produtos" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Filas Config" ON public.queue_configs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Filas Itens" ON public.queue_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total Campanhas" ON public.campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total CRM Leads" ON public.crm_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso Total System Logs" ON public.system_logs FOR ALL USING (true) WITH CHECK (true);
