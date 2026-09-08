-- =============================================================
-- MIGRATION 05: Analytics & Library
-- Eventos de analítico, Biblioteca de mídias, Coleções (n:m)
-- =============================================================

-- -------------------------------------------------------------
-- 16. ANALYTICS_EVENTS — Eventos granulares de desempenho
-- source_type + source_id formam polimorfismo flexível
-- Particionamento futuro por created_at já suportado pelo índice
-- -------------------------------------------------------------
CREATE TABLE public.analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('click', 'conversion', 'post_sent', 'view', 'impression')),
  source_type  TEXT NOT NULL CHECK (source_type IN ('campaign', 'offer', 'landing_page', 'channel', 'template')),
  source_id    UUID NOT NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.analytics_events IS 'Log de eventos (cliques, conversões, envios, views) para relatórios por campanha/oferta/canal.';
COMMENT ON COLUMN public.analytics_events.source_type IS 'Tipo da entidade-origem do evento: campaign, offer, landing_page, channel ou template.';
COMMENT ON COLUMN public.analytics_events.source_id IS 'UUID da entidade-origem. Combinado com source_type forma a referência polimórfica.';

CREATE INDEX idx_analytics_account_id ON public.analytics_events(account_id);
CREATE INDEX idx_analytics_source ON public.analytics_events(account_id, source_type, source_id);
CREATE INDEX idx_analytics_event_type ON public.analytics_events(account_id, event_type);
CREATE INDEX idx_analytics_created_at ON public.analytics_events(account_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros inserem e leem eventos" ON public.analytics_events
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 17. LIBRARY_ITEMS — Acervo de mídias e textos
-- item_type: image | text | link | video
-- -------------------------------------------------------------
CREATE TABLE public.library_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  item_type    TEXT NOT NULL CHECK (item_type IN ('image', 'text', 'link', 'video')),
  title        TEXT NOT NULL,
  content      TEXT,
  media_url    TEXT,
  file_size    BIGINT,
  mime_type    TEXT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.library_items IS 'Acervo de imagens, textos, links e vídeos reutilizáveis nas campanhas.';

CREATE INDEX idx_library_items_account_id ON public.library_items(account_id);
CREATE INDEX idx_library_items_type ON public.library_items(account_id, item_type);
CREATE INDEX idx_library_items_tags ON public.library_items USING GIN(tags);

CREATE TRIGGER set_library_items_updated_at BEFORE UPDATE ON public.library_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.library_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam biblioteca" ON public.library_items
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 18. COLLECTIONS — Pastas/categorias da biblioteca
-- -------------------------------------------------------------
CREATE TABLE public.collections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  color        TEXT DEFAULT '#6366f1',
  icon         TEXT,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.collections IS 'Coleções/pastas para organizar itens da biblioteca. Relação n:m com library_items via collection_items.';

CREATE INDEX idx_collections_account_id ON public.collections(account_id);

CREATE TRIGGER set_collections_updated_at BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam coleções" ON public.collections
  FOR ALL USING (public.user_belongs_to_account(account_id))
  WITH CHECK (public.user_belongs_to_account(account_id));

-- -------------------------------------------------------------
-- 19. COLLECTION_ITEMS — Associação n:m entre itens e coleções
-- Uma imagem pode estar em várias coleções.
-- Uma coleção pode ter vários itens.
-- -------------------------------------------------------------
CREATE TABLE public.collection_items (
  collection_id  UUID NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  item_id        UUID NOT NULL REFERENCES public.library_items(id) ON DELETE CASCADE,
  added_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection_id, item_id)
);

COMMENT ON TABLE public.collection_items IS 'Tabela associativa n:m entre library_items e collections.';

CREATE INDEX idx_collection_items_item_id ON public.collection_items(item_id);

ALTER TABLE public.collection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros gerenciam itens de coleções" ON public.collection_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id AND public.user_belongs_to_account(c.account_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collections c
      WHERE c.id = collection_id AND public.user_belongs_to_account(c.account_id)
    )
  );;
