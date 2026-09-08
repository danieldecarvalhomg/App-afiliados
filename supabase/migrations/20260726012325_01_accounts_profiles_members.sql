-- =============================================================
-- MIGRATION 01: Accounts, Profiles, Account Members
-- Propósito: Modelagem multi-tenant (Conta × Usuário × Equipe).
-- Toda entidade pertence a uma `account`, não a um `user`.
-- =============================================================

-- Extensão para gerar UUIDs (já disponível no Supabase, só garantir)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -------------------------------------------------------------
-- 1. ACCOUNTS — Entidade principal de "empresa/conta"
-- Um usuário pode pertencer a mais de uma conta.
-- O plano determina os limites de recursos PRO.
-- -------------------------------------------------------------
CREATE TABLE public.accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  plan                  TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  max_templates         INT NOT NULL DEFAULT 3,
  max_monitored_groups  INT NOT NULL DEFAULT 1,
  max_automations       INT NOT NULL DEFAULT 2,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.accounts IS 'Entidade raiz multi-tenant. Cada conta pode ter equipe e plano distinto.';

-- -------------------------------------------------------------
-- 2. PROFILES — Estende auth.users com dados de perfil
-- Criado automaticamente via trigger ao registrar usuário.
-- current_account_id = conta ativa no momento da sessão.
-- -------------------------------------------------------------
CREATE TABLE public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_account_id  UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  full_name           TEXT,
  avatar_url          TEXT,
  settings            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'Extensão do auth.users. Armazena dados de perfil e conta ativa do usuário.';

-- -------------------------------------------------------------
-- 3. ACCOUNT_MEMBERS — Vínculo n:m entre Usuários e Contas
-- role: owner = dono, admin = administrador, member = membro
-- -------------------------------------------------------------
CREATE TABLE public.account_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

COMMENT ON TABLE public.account_members IS 'Membros de cada conta com papel (owner/admin/member). Base do controle de equipe.';

-- Índices de performance
CREATE INDEX idx_account_members_account_id ON public.account_members(account_id);
CREATE INDEX idx_account_members_user_id ON public.account_members(user_id);
CREATE INDEX idx_profiles_current_account ON public.profiles(current_account_id);

-- -------------------------------------------------------------
-- TRIGGER: Criar profile + account + membership automaticamente
-- quando um novo usuário se registra via Supabase Auth.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_account_id UUID;
BEGIN
  -- Cria conta pessoal padrão
  INSERT INTO public.accounts (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)) || '''s workspace')
  RETURNING id INTO new_account_id;

  -- Cria perfil
  INSERT INTO public.profiles (id, current_account_id, full_name, avatar_url)
  VALUES (
    NEW.id,
    new_account_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Adiciona como owner da conta
  INSERT INTO public.account_members (account_id, user_id, role)
  VALUES (new_account_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

-- Função helper: verifica se o usuário logado pertence à conta
CREATE OR REPLACE FUNCTION public.user_belongs_to_account(acc_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = acc_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Função helper: retorna account_id do perfil do usuário atual
CREATE OR REPLACE FUNCTION public.current_user_account_id()
RETURNS UUID AS $$
  SELECT current_account_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Policies: Accounts
CREATE POLICY "Membros podem ver sua conta" ON public.accounts
  FOR SELECT USING (public.user_belongs_to_account(id));

CREATE POLICY "Owners podem editar conta" ON public.accounts
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = public.accounts.id AND am.user_id = auth.uid() AND am.role = 'owner')
  );

-- Policies: Profiles
CREATE POLICY "Usuário lê/edita próprio perfil" ON public.profiles
  FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- Policies: Account Members
CREATE POLICY "Membros veem equipe da conta" ON public.account_members
  FOR SELECT USING (public.user_belongs_to_account(account_id));

CREATE POLICY "Owners gerenciam membros" ON public.account_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = public.account_members.account_id AND am.user_id = auth.uid() AND am.role IN ('owner', 'admin'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.account_members am WHERE am.account_id = public.account_members.account_id AND am.user_id = auth.uid() AND am.role IN ('owner', 'admin'))
  );
