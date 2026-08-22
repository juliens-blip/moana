-- Le flux BOSS est live à la demande. Seuls les favoris et leurs snapshots
-- doivent être persistés.
BEGIN;

ALTER TABLE public.yatco_global_favorites
  ADD COLUMN IF NOT EXISTS listing_snapshot JSONB;

UPDATE public.yatco_global_favorites f
SET listing_snapshot = to_jsonb(l)
FROM public.yatco_global_listings l
WHERE f.listing_id = l.id
  AND f.listing_snapshot IS NULL;

ALTER TABLE public.yatco_global_favorites
  ALTER COLUMN listing_id DROP NOT NULL;

ALTER TABLE public.yatco_global_favorites
  DROP CONSTRAINT IF EXISTS yatco_global_favorites_broker_id_listing_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_yatco_global_favorites_broker_dedup
  ON public.yatco_global_favorites (broker_id, dedup_key);

ALTER TABLE public.yatco_global_favorites
  ADD CONSTRAINT yatco_global_favorites_snapshot_object
  CHECK (listing_snapshot IS NULL OR jsonb_typeof(listing_snapshot) = 'object');

-- Nettoyage des imports historiques : les annonces non favorites ne restent
-- pas en base. Les snapshots des favoris ont été copiés ci-dessus.
DELETE FROM public.yatco_global_listings l
WHERE NOT EXISTS (
  SELECT 1 FROM public.yatco_global_favorites f
  WHERE f.listing_id = l.id OR f.dedup_key = l.dedup_key
);

COMMIT;
