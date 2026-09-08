-- AfiliHub — Amazon e Mercado Livre no Radar por conta.

ALTER TABLE public.marketplace_discovery_runs
  DROP CONSTRAINT IF EXISTS marketplace_discovery_runs_marketplace_check;

ALTER TABLE public.marketplace_discovery_runs
  ADD CONSTRAINT marketplace_discovery_runs_marketplace_check
  CHECK (marketplace IN ('shopee', 'amazon', 'mercado_livre'));

COMMENT ON COLUMN public.affiliate_accounts.encrypted_credentials IS
  'Envelope AES-GCM server-side. Shopee: appId/secret; Amazon: appId/secret/partnerTag; Mercado Livre: appId/secret/accessToken/refreshToken.';
