ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.captured_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
-- Products
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Users can view own products') THEN
  CREATE POLICY "Users can view own products" ON public.products FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Users can insert own products') THEN
  CREATE POLICY "Users can insert own products" ON public.products FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Users can update own products') THEN
  CREATE POLICY "Users can update own products" ON public.products FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='Users can delete own products') THEN
  CREATE POLICY "Users can delete own products" ON public.products FOR DELETE USING (auth.uid() = user_id);
END IF;

-- Queue configs
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_configs' AND policyname='Users can view own queues') THEN
  CREATE POLICY "Users can view own queues" ON public.queue_configs FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_configs' AND policyname='Users can insert own queues') THEN
  CREATE POLICY "Users can insert own queues" ON public.queue_configs FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_configs' AND policyname='Users can update own queues') THEN
  CREATE POLICY "Users can update own queues" ON public.queue_configs FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_configs' AND policyname='Users can delete own queues') THEN
  CREATE POLICY "Users can delete own queues" ON public.queue_configs FOR DELETE USING (auth.uid() = user_id);
END IF;

-- Queue items
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_items' AND policyname='Users can view own queue items') THEN
  CREATE POLICY "Users can view own queue items" ON public.queue_items FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_items' AND policyname='Users can insert own queue items') THEN
  CREATE POLICY "Users can insert own queue items" ON public.queue_items FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_items' AND policyname='Users can update own queue items') THEN
  CREATE POLICY "Users can update own queue items" ON public.queue_items FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='queue_items' AND policyname='Users can delete own queue items') THEN
  CREATE POLICY "Users can delete own queue items" ON public.queue_items FOR DELETE USING (auth.uid() = user_id);
END IF;

-- Captured messages
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='captured_messages' AND policyname='Users can view own messages') THEN
  CREATE POLICY "Users can view own messages" ON public.captured_messages FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='captured_messages' AND policyname='Users can insert own messages') THEN
  CREATE POLICY "Users can insert own messages" ON public.captured_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='captured_messages' AND policyname='Users can update own messages') THEN
  CREATE POLICY "Users can update own messages" ON public.captured_messages FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='captured_messages' AND policyname='Users can delete own messages') THEN
  CREATE POLICY "Users can delete own messages" ON public.captured_messages FOR DELETE USING (auth.uid() = user_id);
END IF;

-- Copy templates
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='copy_templates' AND policyname='Users can view own templates') THEN
  CREATE POLICY "Users can view own templates" ON public.copy_templates FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='copy_templates' AND policyname='Users can insert own templates') THEN
  CREATE POLICY "Users can insert own templates" ON public.copy_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='copy_templates' AND policyname='Users can update own templates') THEN
  CREATE POLICY "Users can update own templates" ON public.copy_templates FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='copy_templates' AND policyname='Users can delete own templates') THEN
  CREATE POLICY "Users can delete own templates" ON public.copy_templates FOR DELETE USING (auth.uid() = user_id);
END IF;

-- CRM leads
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='Users can view own leads') THEN
  CREATE POLICY "Users can view own leads" ON public.crm_leads FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='Users can insert own leads') THEN
  CREATE POLICY "Users can insert own leads" ON public.crm_leads FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='Users can update own leads') THEN
  CREATE POLICY "Users can update own leads" ON public.crm_leads FOR UPDATE USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='Users can delete own leads') THEN
  CREATE POLICY "Users can delete own leads" ON public.crm_leads FOR DELETE USING (auth.uid() = user_id);
END IF;

-- System logs
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_logs' AND policyname='Users can view own logs') THEN
  CREATE POLICY "Users can view own logs" ON public.system_logs FOR SELECT USING (auth.uid() = user_id);
END IF;
IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='system_logs' AND policyname='Users can insert own logs') THEN
  CREATE POLICY "Users can insert own logs" ON public.system_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
END IF;

END $$;;
