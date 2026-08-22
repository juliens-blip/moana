-- Suivi local des annonces YATCO Global par broker.
-- Cette migration est volontairement indépendante de la production :
-- l'appliquer uniquement à la base Supabase utilisée pour les tests locaux.

ALTER TABLE public.yatco_global_listings
  ADD COLUMN IF NOT EXISTS cabins INTEGER,
  ADD COLUMN IF NOT EXISTS listing_status TEXT;

CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_cabins
  ON public.yatco_global_listings (cabins);

-- Rebuild the candidate view after ALTER TABLE so PostgREST exposes the new
-- columns (l.* is expanded when the view is created, not dynamically).
DROP VIEW IF EXISTS public.yatco_selection_candidates;
CREATE VIEW public.yatco_selection_candidates
  WITH (security_invoker = true) AS
SELECT l.*
FROM public.yatco_global_listings l
WHERE (
    l.first_seen_at >= now() - INTERVAL '72 hours'
    OR l.updated_at >= now() - INTERVAL '72 hours'
  )
  AND l.length_m > 26
  AND l.model_year >= 2010;
GRANT SELECT ON public.yatco_selection_candidates TO service_role;

CREATE TABLE IF NOT EXISTS public.yatco_global_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_id UUID NOT NULL REFERENCES public.brokers(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.yatco_global_listings(id) ON DELETE CASCADE,
  dedup_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (broker_id, listing_id)
);

CREATE TABLE IF NOT EXISTS public.yatco_global_favorite_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  favorite_id UUID NOT NULL REFERENCES public.yatco_global_favorites(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  listing_snapshot JSONB NOT NULL CHECK (jsonb_typeof(listing_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_yatco_global_favorites_broker
  ON public.yatco_global_favorites (broker_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_yatco_global_favorite_history_favorite
  ON public.yatco_global_favorite_history (favorite_id, observed_at DESC);

CREATE OR REPLACE FUNCTION public.capture_yatco_favorite_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.yatco_global_favorite_history (favorite_id, observed_at, listing_snapshot)
  SELECT f.id, now(), to_jsonb(NEW)
  FROM public.yatco_global_favorites f
  WHERE f.listing_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_yatco_favorite_snapshot ON public.yatco_global_listings;
CREATE TRIGGER trg_capture_yatco_favorite_snapshot
  AFTER INSERT OR UPDATE ON public.yatco_global_listings
  FOR EACH ROW EXECUTE FUNCTION public.capture_yatco_favorite_snapshot();

ALTER TABLE public.yatco_global_favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_global_favorites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_global_favorite_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_global_favorite_history FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_global_favorites, public.yatco_global_favorite_history FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yatco_global_favorites TO service_role;
GRANT SELECT, INSERT, DELETE ON TABLE public.yatco_global_favorite_history TO service_role;

COMMENT ON TABLE public.yatco_global_favorites IS 'Favoris YATCO Global par broker, accès server-side uniquement';
COMMENT ON TABLE public.yatco_global_favorite_history IS 'Snapshots des annonces favorites après chaque changement du scraper';
