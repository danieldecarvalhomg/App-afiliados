CREATE TABLE IF NOT EXISTS public.ai_response_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_kind text NOT NULL CHECK (cache_kind IN ('promotion','media')),
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  hit_count bigint NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cache_kind,cache_key)
);
CREATE INDEX IF NOT EXISTS ai_response_cache_expiry_idx ON public.ai_response_cache(expires_at);
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_response_cache FROM anon,authenticated;
GRANT ALL ON public.ai_response_cache TO service_role;
CREATE OR REPLACE FUNCTION public.touch_ai_response_cache(p_kind text,p_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  UPDATE public.ai_response_cache SET hit_count=hit_count+1,last_used_at=now()
  WHERE cache_kind=p_kind AND cache_key=p_key;
$$;
REVOKE ALL ON FUNCTION public.touch_ai_response_cache(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.touch_ai_response_cache(text,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.cta_candidate_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  text text NOT NULL,
  text_hash text NOT NULL,
  angle text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','used')),
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,cache_key,text_hash)
);
CREATE INDEX IF NOT EXISTS cta_candidate_pool_available_idx ON public.cta_candidate_pool(user_id,cache_key,created_at) WHERE status='available';
CREATE INDEX IF NOT EXISTS cta_candidate_pool_expiry_idx ON public.cta_candidate_pool(expires_at);
ALTER TABLE public.cta_candidate_pool ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cta_candidate_pool FROM anon,authenticated;
GRANT ALL ON public.cta_candidate_pool TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cta_candidates(p_user_id uuid,p_cache_key text,p_limit integer)
RETURNS TABLE(id uuid,text text,angle text,provider text,model text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  WITH selected AS (
    SELECT candidate.id FROM public.cta_candidate_pool candidate
    WHERE candidate.user_id=p_user_id AND candidate.cache_key=p_cache_key
      AND candidate.status='available' AND candidate.expires_at>now()
    ORDER BY candidate.created_at FOR UPDATE SKIP LOCKED LIMIT greatest(1,least(p_limit,12))
  ), claimed AS (
    UPDATE public.cta_candidate_pool candidate SET status='used',used_at=now()
    FROM selected WHERE candidate.id=selected.id
    RETURNING candidate.id,candidate.text,candidate.angle,candidate.provider,candidate.model,candidate.created_at
  ) SELECT claimed.id,claimed.text,claimed.angle,claimed.provider,claimed.model FROM claimed ORDER BY claimed.created_at;
$$;
REVOKE ALL ON FUNCTION public.claim_cta_candidates(uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cta_candidates(uuid,text,integer) TO service_role;
