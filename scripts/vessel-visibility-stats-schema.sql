-- ============================================================
-- MOANA YACHTING - VESSEL VISIBILITY STATS on yatco_fleet_listings
-- Execute once in Supabase SQL Editor.
--
-- Adds current-window visibility stats (impressions/views/clicks/leads) to
-- the fleet-content-audit table, matched by MLS# against YATCO.com's own
-- "Vessel Statistics Report". Current-state columns (like the rest of
-- yatco_fleet_listings), not a history table — the per-listing historical
-- trend chart already lives in yatco_listing_stats (separate WIP, CRM modal).
-- ============================================================

BEGIN;

ALTER TABLE public.yatco_fleet_listings
  ADD COLUMN IF NOT EXISTS stats_impressions INTEGER,
  ADD COLUMN IF NOT EXISTS stats_detail_views INTEGER,
  ADD COLUMN IF NOT EXISTS stats_phone_clicks INTEGER,
  ADD COLUMN IF NOT EXISTS stats_gallery_views INTEGER,
  ADD COLUMN IF NOT EXISTS stats_leads INTEGER,
  ADD COLUMN IF NOT EXISTS stats_synced_at TIMESTAMPTZ;

COMMENT ON COLUMN public.yatco_fleet_listings.stats_impressions IS
  'YATCO.com visibility stats for the current report window (default: last 7 days), from scripts/sync-vessel-visibility-stats.ts. NULL if never synced.';

COMMIT;
