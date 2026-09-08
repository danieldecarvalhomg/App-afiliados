DROP TABLE IF EXISTS public.landing_pages CASCADE;

CREATE TABLE public.landing_pages (
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

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own pages" ON public.landing_pages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pages" ON public.landing_pages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pages" ON public.landing_pages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pages" ON public.landing_pages FOR DELETE USING (auth.uid() = user_id);;
