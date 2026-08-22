DROP TRIGGER IF EXISTS trg_capture_yatco_favorite_snapshot ON public.yatco_global_listings;
DROP FUNCTION IF EXISTS public.capture_yatco_favorite_snapshot();
DROP TABLE IF EXISTS public.yatco_global_favorite_history;
DROP TABLE IF EXISTS public.yatco_global_favorites;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_cabins;
ALTER TABLE public.yatco_global_listings
  DROP COLUMN IF EXISTS cabins,
  DROP COLUMN IF EXISTS listing_status;
