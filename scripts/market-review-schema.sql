-- ============================================================
-- MOANA YACHTING - YATCO MARKET REVIEW SNAPSHOTS (global market state)
-- Execute once in Supabase SQL Editor.
--
-- One snapshot per scrape run of BOSS's "Market Review" report (global,
-- all brokers, by size band, 2021 -> current YTD). History kept (not
-- upserted) so the app can show trend-of-trend if useful later.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.yatco_market_review_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  size_bands JSONB NOT NULL,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.yatco_market_review_snapshots IS
  'Global YATCO MLS market state (Sold Vessels/Total Sold Value/Average Days on Market by size band, 2021->YTD), ingested by scripts/sync-market-review.ts from market-review-scrape.mjs output.';
COMMENT ON COLUMN public.yatco_market_review_snapshots.size_bands IS
  'Shape: { soldVessels: { "<band>": { "<year>": "<count>" } }, totalSoldValue: {...}, avgDaysOnMarket: {...} }';

CREATE INDEX IF NOT EXISTS idx_market_review_snapshots_scraped_at
  ON public.yatco_market_review_snapshots (scraped_at DESC);

ALTER TABLE public.yatco_market_review_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_market_review_snapshots FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_market_review_snapshots FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yatco_market_review_snapshots TO service_role;

COMMIT;
