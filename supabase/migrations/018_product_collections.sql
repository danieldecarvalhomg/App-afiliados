-- Coleções persistentes da Biblioteca.

CREATE TABLE IF NOT EXISTS public.product_collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS product_collections_user_name_uidx
  ON public.product_collections(user_id, lower(name));

CREATE TABLE IF NOT EXISTS public.product_collection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  collection_id UUID NOT NULL REFERENCES public.product_collections(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS product_collection_items_user_idx
  ON public.product_collection_items(user_id, collection_id, created_at);

CREATE OR REPLACE FUNCTION public.validate_product_collection_item_owner()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_collections collection
    WHERE collection.id = NEW.collection_id AND collection.user_id = NEW.user_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.products product
    WHERE product.id = NEW.product_id AND product.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'PRODUCT_COLLECTION_OWNERSHIP_INVALID';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS validate_product_collection_item_owner_trigger
  ON public.product_collection_items;
CREATE TRIGGER validate_product_collection_item_owner_trigger
  BEFORE INSERT OR UPDATE OF user_id, collection_id, product_id
  ON public.product_collection_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_collection_item_owner();

ALTER TABLE public.product_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_collections_owner ON public.product_collections;
CREATE POLICY product_collections_owner ON public.product_collections
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS product_collection_items_owner ON public.product_collection_items;
CREATE POLICY product_collection_items_owner ON public.product_collection_items
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
