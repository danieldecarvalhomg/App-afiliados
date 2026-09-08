-- =============================================================
-- MIGRATION 06: AI Training & Preferences
-- Recurso transversal: Histórico de treinamento da IA e
-- preferências consolidadas por conta/usuário.
-- =============================================================

-- -------------------------------------------------------------
-- 20. AI_TRAINING_CHATS — Histórico de conversa com a IA de treino
-- -------------------------------------------------------------
CREATE TABLE public.ai_training_chats (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender       TEXT NOT NULL CHECK (sender IN ('user', 'assistant')),
  message_text TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_training_chats IS 'Histórico de conversas do usuário com o assistente de treinamento da IA.';

CREATE INDEX idx_ai_training_chats_account_id ON public.ai_training_chats(account_id);
CREATE INDEX idx_ai_training_chats_created_at ON public.ai_training_chats(account_id, created_at ASC);

ALTER TABLE public.ai_training_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam chats de treinamento" ON public.ai_training_chats
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 21. AI_PREFERENCES — Instruções e preferências consolidadas da IA
-- 1 por conta (UNIQUE account_id)
-- -------------------------------------------------------------
CREATE TABLE public.ai_preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL UNIQUE REFERENCES public.accounts(id) ON DELETE CASCADE,
  default_cta_tone    TEXT DEFAULT 'persuasivo_urgente',
  custom_instructions TEXT,
  forbidden_words     TEXT[] NOT NULL DEFAULT '{}',
  auto_emoji_style    TEXT DEFAULT 'moderate',
  preferred_ai_model  TEXT DEFAULT 'gemini-2.5-flash',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_preferences IS 'Preferências/instruções consolidadas que a IA deve seguir ao reescrever mensagens e gerar CTAs.';

CREATE TRIGGER set_ai_preferences_updated_at BEFORE UPDATE ON public.ai_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam preferências da IA" ON public.ai_preferences
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));;
