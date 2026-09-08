CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_price numeric DEFAULT 0,
  price numeric DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  rating numeric DEFAULT 5,
  reviews_count integer DEFAULT 0,
  category text DEFAULT 'Geral',
  marketplace text DEFAULT 'Amazon',
  raw_url text DEFAULT '',
  affiliate_url text DEFAULT '',
  coupon_code text DEFAULT '',
  image text DEFAULT '',
  status text DEFAULT 'ativo',
  is_favorite boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  collection_id text DEFAULT '',
  hot_score integer DEFAULT 80,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.queue_configs (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text DEFAULT 'Telegram',
  channel_name text DEFAULT '',
  channel_id text DEFAULT '',
  status text DEFAULT 'ativa',
  interval_minutes integer DEFAULT 15,
  auto_shuffle boolean DEFAULT true,
  peak_hours_only boolean DEFAULT false,
  days_of_week jsonb DEFAULT '["seg","ter","qua","qui","sex","sab","dom"]'::jsonb,
  time_window_start text DEFAULT '08:00',
  time_window_end text DEFAULT '22:00',
  next_delivery_time text DEFAULT '',
  last_delivery_time text DEFAULT '',
  total_pending integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_failed integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.queue_items (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  queue_config_id text REFERENCES public.queue_configs(id) ON DELETE CASCADE,
  product_id text DEFAULT '',
  product_title text DEFAULT '',
  product_image text DEFAULT '',
  price numeric DEFAULT 0,
  original_price numeric DEFAULT 0,
  marketplace text DEFAULT 'Amazon',
  copy_text text DEFAULT '',
  affiliate_url text DEFAULT '',
  channel_ids jsonb DEFAULT '[]'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  status text DEFAULT 'pendente',
  priority integer DEFAULT 1,
  error_message text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.monitored_groups (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text DEFAULT 'Telegram',
  external_id_or_url text DEFAULT '',
  linked_store text DEFAULT 'Todas as Lojas',
  status text DEFAULT 'ativo',
  captured_count integer DEFAULT 0,
  approved_count integer DEFAULT 0,
  last_activity text DEFAULT '',
  rules jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.captured_messages (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id text DEFAULT '',
  group_name text DEFAULT '',
  platform text DEFAULT 'Telegram',
  raw_content text DEFAULT '',
  image_url text,
  extracted_json jsonb,
  confidence numeric DEFAULT 0,
  status text DEFAULT 'Pendente',
  template_used_id text,
  final_text text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.copy_templates (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text DEFAULT 'Geral',
  store text DEFAULT 'Todas as Lojas',
  content text DEFAULT '',
  usage_count integer DEFAULT 0,
  is_favorite boolean DEFAULT false,
  status text DEFAULT 'ativo',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_leads (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  handle_or_phone text DEFAULT '',
  platform text DEFAULT 'Telegram',
  tags jsonb DEFAULT '[]'::jsonb,
  engagement_score integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  last_active text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'marketplace',
  logo_icon_name text DEFAULT '',
  status text DEFAULT 'desconectado',
  tag_afiliado text DEFAULT '',
  api_key text DEFAULT '',
  webhook_url text DEFAULT '',
  last_sync text DEFAULT '',
  description text DEFAULT '',
  logs_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_logs (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  timestamp text NOT NULL,
  level text DEFAULT 'info',
  module text DEFAULT '',
  message text DEFAULT '',
  details text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text DEFAULT '',
  views integer DEFAULT 0,
  clicks integer DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  active_products_count integer DEFAULT 0,
  status text DEFAULT 'rascunho',
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, created_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email = COALESCE(EXCLUDED.email, profiles.email),
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();;
