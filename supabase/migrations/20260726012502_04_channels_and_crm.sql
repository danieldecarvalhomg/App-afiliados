-- =============================================================
-- MIGRATION 04: Channels & CRM
-- Integrações externas, Canais de distribuição do usuário, CRM & Contatos
-- =============================================================

-- -------------------------------------------------------------
-- 13. INTEGRATIONS — Conexões com APIs externas
-- SEGURO: encrypted_credentials armazena tokens cifrados.
-- Nunca expor tokens em texto puro.
-- -------------------------------------------------------------
CREATE TABLE public.integrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL CHECK (provider IN ('whatsapp', 'telegram', 'shopee', 'mercadolivre', 'amazon', 'webhook', 'other')),
  name                  TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  -- Credenciais NUNCA em texto puro. Armazene tokens cifrados em nível de aplicação.
  -- Na produção, usar Supabase Vault ou criptografia PGP antes de inserir.
  encrypted_credentials JSONB NOT NULL DEFAULT '{}',
  last_synced_at        TIMESTAMPTZ,
  config                JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.integrations IS 'Conexões com serviços externos. Credenciais nunca em texto puro - usar encrypted_credentials com PGP/Vault.';
COMMENT ON COLUMN public.integrations.encrypted_credentials IS 'Tokens/chaves cifrados. NUNCA armazene texto puro aqui. Cifre antes de inserir.';

CREATE INDEX idx_integrations_account_id ON public.integrations(account_id);
CREATE INDEX idx_integrations_provider ON public.integrations(account_id, provider);

CREATE TRIGGER set_integrations_updated_at BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam integrações" ON public.integrations
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- Política adicional: ocultar encrypted_credentials para não-owners (segurança extra)
-- (Implementar via view segura ou função em produção)

-- -------------------------------------------------------------
-- 14. CHANNELS — Canais de distribuição do usuário
-- Diferente de monitored_groups (captura)
-- Aqui são os canais onde o afiliado ENVIA as promos
-- -------------------------------------------------------------
CREATE TABLE public.channels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  integration_id      UUID REFERENCES public.integrations(id) ON DELETE SET NULL,
  platform            TEXT NOT NULL,
  name                TEXT NOT NULL,
  external_channel_id TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  config              JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.channels IS 'Canais de distribuição do próprio afiliado (onde ele envia promos). Diferente de monitored_groups.';

CREATE INDEX idx_channels_account_id ON public.channels(account_id);
CREATE INDEX idx_channels_active ON public.channels(account_id, is_active);

CREATE TRIGGER set_channels_updated_at BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam canais" ON public.channels
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- Agora que channels existe, adicionar FK em scheduled_posts
ALTER TABLE public.scheduled_posts
  ADD CONSTRAINT scheduled_posts_channel_id_fkey
  FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE SET NULL;

-- -------------------------------------------------------------
-- 15. CONTACTS — CRM & Leads
-- tags: array de texto para segmentação flexível
-- status: lead | customer | unsubscribed
-- -------------------------------------------------------------
CREATE TABLE public.contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id           UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  email                TEXT,
  phone                TEXT,
  platform             TEXT,
  external_contact_id  TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  status               TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'customer', 'unsubscribed')),
  notes                TEXT,
  last_interaction_at  TIMESTAMPTZ,
  source               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.contacts IS 'CRM de leads/clientes. Tags para segmentação, status de relacionamento e histórico.';

CREATE INDEX idx_contacts_account_id ON public.contacts(account_id);
CREATE INDEX idx_contacts_status ON public.contacts(account_id, status);
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_email ON public.contacts(account_id, email);

CREATE TRIGGER set_contacts_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam contatos" ON public.contacts
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));;
