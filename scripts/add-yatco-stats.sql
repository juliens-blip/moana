-- ============================================================
-- MOANA YACHTING - YATCO BOSS LINKING & STATS HISTORY
-- Execute once in Supabase SQL Editor.
--
-- Scope: public.listings only (bateaux_a_suivre / bateaux_chantier
-- are explicitly out of scope for this feature).
-- ============================================================

BEGIN;

-- 1. Link column on listings ------------------------------------------------
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS yatco_vessel_id TEXT;

COMMENT ON COLUMN public.listings.yatco_vessel_id IS
  'YATCO BOSS internal vessel ID (the vID query param in /search/vesseldetails/viewlisting/?vID=..., NOT the public "YATCO MLS #"). NULL if unmatched.';

-- One YATCO vessel maps to at most one of our listings.
CREATE UNIQUE INDEX IF NOT EXISTS uq_listings_yatco_vessel_id
  ON public.listings (yatco_vessel_id)
  WHERE yatco_vessel_id IS NOT NULL;

-- 2. Stats history table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yatco_listing_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,

  impressions INTEGER CHECK (impressions IS NULL OR impressions >= 0),
  detail_views INTEGER CHECK (detail_views IS NULL OR detail_views >= 0),
  phone_clicks INTEGER CHECK (phone_clicks IS NULL OR phone_clicks >= 0),
  gallery_views INTEGER CHECK (gallery_views IS NULL OR gallery_views >= 0),
  leads INTEGER CHECK (leads IS NULL OR leads >= 0),

  source TEXT NOT NULL DEFAULT 'manual_refresh'
    CHECK (source IN ('manual_refresh', 'backfill')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One snapshot per listing per day; re-running the sync script the same
  -- day upserts instead of duplicating rows.
  CONSTRAINT uq_yatco_listing_stats_listing_date UNIQUE (listing_id, snapshot_date)
);

COMMENT ON TABLE public.yatco_listing_stats IS
  'Daily snapshots of YATCO BOSS online stats for linked listings; appended by scripts/sync-yatco-stats.ts';
COMMENT ON COLUMN public.yatco_listing_stats.snapshot_date IS
  'Calendar date the stats snapshot represents (operator-triggered refresh, not a fixed cron)';
COMMENT ON COLUMN public.yatco_listing_stats.source IS
  'manual_refresh = normal operator-triggered pull; backfill = historical data entered after the fact';

-- Trend queries: "history for listing X ordered by date".
CREATE INDEX IF NOT EXISTS idx_yatco_listing_stats_listing_date
  ON public.yatco_listing_stats (listing_id, snapshot_date DESC);

-- RLS posture matches lead_kyc_reports: server-only (service_role), browser
-- roles denied — this app never talks to Supabase from the browser anyway,
-- all reads/writes go through createAdminClient() in server code.
ALTER TABLE public.yatco_listing_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_listing_stats FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_listing_stats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yatco_listing_stats TO service_role;

COMMIT;
