-- Modo de revisão do monitoramento é uma preferência da conta, não do grupo.
-- O backend mantém fallback para group_monitors durante a aplicação desta migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::JSONB;
