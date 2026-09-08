-- AfiliHub — Bloco 3D.3: Product Media Intelligence / curadoria de imagens.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS media_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS primary_media_asset_id UUID;

ALTER TABLE public.marketplace_deals ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::JSONB;
ALTER TABLE public.marketplace_deals DROP CONSTRAINT IF EXISTS marketplace_deals_image_urls_check;
ALTER TABLE public.marketplace_deals ADD CONSTRAINT marketplace_deals_image_urls_check CHECK (jsonb_typeof(image_urls)='array');

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_media_status_check;
ALTER TABLE public.products ADD CONSTRAINT products_media_status_check CHECK (media_status IN (
  'pending','analyzing','available','selected','unavailable','failed','needs_review'
));

CREATE TABLE IF NOT EXISTS public.product_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('marketplace','whatsapp','manual')),
  source_reference_id UUID,
  source_url TEXT,
  storage_path TEXT,
  mime_type TEXT CHECK (mime_type IS NULL OR mime_type IN ('image/jpeg','image/png','image/webp')),
  file_size BIGINT CHECK (file_size IS NULL OR file_size BETWEEN 1 AND 8388608),
  width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 20000),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 20000),
  content_hash TEXT CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  classification TEXT CHECK (classification IS NULL OR classification IN (
    'clean_product_photo','marketplace_product_image','lifestyle_product_photo','promotional_creative','screenshot','packaging','unknown'
  )),
  has_text_overlay BOOLEAN NOT NULL DEFAULT FALSE,
  has_detected_branding BOOLEAN NOT NULL DEFAULT FALSE,
  has_qr_code BOOLEAN NOT NULL DEFAULT FALSE,
  has_watermark BOOLEAN NOT NULL DEFAULT FALSE,
  possible_conflicting_commercial_text BOOLEAN NOT NULL DEFAULT FALSE,
  product_match_confidence NUMERIC(5,4) CHECK (product_match_confidence IS NULL OR product_match_confidence BETWEEN 0 AND 1),
  quality_score NUMERIC(5,2) CHECK (quality_score IS NULL OR quality_score BETWEEN 0 AND 100),
  analysis_status TEXT NOT NULL DEFAULT 'pending' CHECK (analysis_status IN ('pending','analyzing','completed','failed')),
  selection_status TEXT NOT NULL DEFAULT 'candidate' CHECK (selection_status IN ('candidate','rejected','auto_selected','manual_selected')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  processing_worker_id TEXT,
  last_error_code TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_media_source_check CHECK (source_url IS NOT NULL OR storage_path IS NOT NULL OR source_type = 'manual')
);

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_primary_media_asset_id_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_primary_media_asset_id_fkey
  FOREIGN KEY (primary_media_asset_id) REFERENCES public.product_media_assets(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_media_content_dedupe_idx ON public.product_media_assets(user_id,product_id,content_hash) WHERE content_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_media_source_dedupe_idx ON public.product_media_assets(user_id,product_id,source_type,source_reference_id,source_url) WHERE source_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_media_one_primary_idx ON public.product_media_assets(product_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS product_media_queue_idx ON public.product_media_assets(analysis_status,next_attempt_at,created_at) WHERE analysis_status IN ('pending','analyzing');
CREATE INDEX IF NOT EXISTS product_media_owner_product_idx ON public.product_media_assets(user_id,product_id,created_at);

CREATE TABLE IF NOT EXISTS public.media_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefer_no_text BOOLEAN NOT NULL DEFAULT TRUE,
  prefer_white_background BOOLEAN NOT NULL DEFAULT FALSE,
  prefer_lifestyle_for_clothing BOOLEAN NOT NULL DEFAULT FALSE,
  avoid_packaging BOOLEAN NOT NULL DEFAULT TRUE,
  natural_language TEXT CHECK (natural_language IS NULL OR length(natural_language) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.product_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_media_assets_owner" ON public.product_media_assets;
CREATE POLICY "product_media_assets_owner" ON public.product_media_assets FOR ALL USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "media_preferences_owner" ON public.media_preferences;
CREATE POLICY "media_preferences_owner" ON public.media_preferences FOR ALL USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('product-media','product-media',FALSE,8388608,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET public=FALSE,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "product_media_storage_owner_read" ON storage.objects;
CREATE POLICY "product_media_storage_owner_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='product-media' AND (storage.foldername(name))[1]=auth.uid()::text);
-- Escrita no bucket ocorre apenas pelo backend service_role, após validação binária.

CREATE OR REPLACE FUNCTION public.validate_product_media_ownership() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id=NEW.product_id AND p.user_id=NEW.user_id) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_OWNER_MISMATCH';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_product_media_ownership ON public.product_media_assets;
CREATE TRIGGER validate_product_media_ownership BEFORE INSERT OR UPDATE OF user_id,product_id ON public.product_media_assets FOR EACH ROW EXECUTE FUNCTION public.validate_product_media_ownership();

CREATE OR REPLACE FUNCTION public.validate_product_primary_media() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.primary_media_asset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.product_media_assets a WHERE a.id=NEW.primary_media_asset_id AND a.product_id=NEW.id AND a.user_id=NEW.user_id
  ) THEN RAISE EXCEPTION 'PRODUCT_PRIMARY_MEDIA_OWNER_MISMATCH'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS validate_product_primary_media ON public.products;
CREATE TRIGGER validate_product_primary_media BEFORE INSERT OR UPDATE OF primary_media_asset_id,user_id ON public.products FOR EACH ROW EXECUTE FUNCTION public.validate_product_primary_media();

CREATE OR REPLACE FUNCTION public.claim_next_product_media(p_worker_id TEXT,p_stale_before TIMESTAMPTZ)
RETURNS SETOF public.product_media_assets LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id UUID;
BEGIN
  UPDATE public.product_media_assets SET analysis_status='failed',processing_started_at=NULL,processing_worker_id=NULL,last_error_code='PROCESSING_TIMEOUT',updated_at=NOW()
  WHERE analysis_status='analyzing' AND processing_started_at<p_stale_before AND attempt_count>=3;
  SELECT id INTO v_id FROM public.product_media_assets WHERE attempt_count<3 AND ((analysis_status='pending' AND next_attempt_at<=NOW()) OR (analysis_status='analyzing' AND processing_started_at<p_stale_before)) ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.product_media_assets a SET analysis_status='analyzing',processing_started_at=NOW(),processing_worker_id=p_worker_id,attempt_count=a.attempt_count+1,last_error_code=NULL,updated_at=NOW() WHERE a.id=v_id RETURNING a.*;
END $$;
REVOKE ALL ON FUNCTION public.claim_next_product_media(TEXT,TIMESTAMPTZ) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_product_media(TEXT,TIMESTAMPTZ) TO service_role;
