-- ============================================================
-- MOANA YACHTING - YATCO MLS MARKET PULSE (comps + price drops)
-- Execute once in Supabase SQL Editor.
--
-- Event stream (one row per vessel per feed per scrape run), NOT a current-state
-- table like yatco_fleet_listings: the same vessel can reappear across runs with
-- a different history_text each time. MLS-wide (all brokers), not Moana's fleet.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.yatco_market_pulse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type TEXT NOT NULL CHECK (feed_type IN ('new', 'modified', 'sold')),
  vid TEXT NOT NULL,
  mls_id TEXT,
  vessel_name TEXT NOT NULL,
  builder TEXT,
  model_year INTEGER,
  category TEXT,
  loa_text TEXT,
  price_text TEXT,
  location TEXT,
  broker_name TEXT,
  history_text TEXT,
  is_price_drop BOOLEAN NOT NULL DEFAULT false,
  price_before_text TEXT,
  price_after_text TEXT,
  sold_date TEXT,

  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_market_pulse_vid_feed_run UNIQUE (vid, feed_type, scraped_at)
);

COMMENT ON TABLE public.yatco_market_pulse IS
  'MLS-wide (all brokers) market comps feed ingested by scripts/sync-market-pulse.ts from market-pulse-scrape.mjs output. Event stream, not current state.';
COMMENT ON COLUMN public.yatco_market_pulse.vid IS
  'YATCO BOSS internal vessel ID (vID query param), NOT the public YATCO MLS #. Not necessarily a Moana vessel.';
COMMENT ON COLUMN public.yatco_market_pulse.history_text IS
  'Raw BOSS change description, e.g. "Price was EUR 35,900,000 changed to EUR 29,500,000." Parsed into price_before_text/price_after_text/is_price_drop when it matches a price change.';

CREATE INDEX IF NOT EXISTS idx_market_pulse_feed_scraped
  ON public.yatco_market_pulse (feed_type, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_pulse_price_drop
  ON public.yatco_market_pulse (is_price_drop) WHERE is_price_drop;

-- RLS posture matches yatco_fleet_listings / yatco_listing_stats: server-only
-- (service_role), the app never queries Supabase from the browser.
ALTER TABLE public.yatco_market_pulse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_market_pulse FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_market_pulse FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yatco_market_pulse TO service_role;

COMMIT;
