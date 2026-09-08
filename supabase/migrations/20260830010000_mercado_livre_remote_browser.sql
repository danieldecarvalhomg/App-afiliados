-- Sessão remota persistente para geração de links do Mercado Livre sem depender
-- do Chrome do usuário. O contexto fica sob custódia do provedor de navegador
-- remoto; o AfiliHub armazena apenas os identificadores técnicos.

CREATE TABLE IF NOT EXISTS public.mercado_livre_remote_sessions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEEDS_LOGIN' CHECK (status IN (
    'NEEDS_LOGIN','CONNECTING','READY','ERROR','REVOKED'
  )),
  active_session_id TEXT,
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS mercado_livre_remote_context_unique
  ON public.mercado_livre_remote_sessions(context_id);

ALTER TABLE public.mercado_livre_remote_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercado_livre_remote_sessions FROM anon, authenticated;

