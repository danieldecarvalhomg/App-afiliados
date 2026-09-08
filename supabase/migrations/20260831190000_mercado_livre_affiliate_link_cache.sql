-- Cache seguro de links já convertidos. A chave inclui usuário e etiqueta para
-- impedir qualquer compartilhamento de atribuição entre contas.
CREATE TABLE IF NOT EXISTS public.mercado_livre_affiliate_link_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  tracking_label text NOT NULL DEFAULT '',
  source_url text NOT NULL,
  affiliate_url text NOT NULL,
  hit_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mercado_livre_affiliate_link_cache_owner_item_label_key
    UNIQUE (user_id, item_key, tracking_label)
);

CREATE INDEX IF NOT EXISTS mercado_livre_affiliate_link_cache_expiry_idx
  ON public.mercado_livre_affiliate_link_cache (expires_at);
CREATE INDEX IF NOT EXISTS mercado_livre_affiliate_link_cache_owner_recent_idx
  ON public.mercado_livre_affiliate_link_cache (user_id, last_used_at DESC);

ALTER TABLE public.mercado_livre_affiliate_link_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mercado_livre_affiliate_link_cache FROM anon, authenticated;
GRANT ALL ON public.mercado_livre_affiliate_link_cache TO service_role;

COMMENT ON TABLE public.mercado_livre_affiliate_link_cache IS
  'Cache backend-only de links ML, isolado por usuário, produto e etiqueta.';

