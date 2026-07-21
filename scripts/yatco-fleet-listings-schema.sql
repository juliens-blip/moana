-- ============================================================
-- MOANA YACHTING - YATCO BOSS FLEET CONTENT AUDIT
-- Execute once in Supabase SQL Editor.
--
-- Separate from public.listings (the app's own CRM table): this table is a
-- full ingestion of Moana's YATCO BOSS fleet as seen by BOSS itself (photos,
-- specs completeness), independent of which listings are already linked via
-- listings.yatco_vessel_id (~10 of ~34 as of 2026-07-21).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.yatco_fleet_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vid TEXT NOT NULL,
  mls_id TEXT,
  vessel_name TEXT NOT NULL,
  status TEXT,
  agreement_type TEXT,
  builder TEXT,
  model_year INTEGER,
  asking_price_text TEXT,
  loa_text TEXT,
  broker_name TEXT,

  photo_count INTEGER NOT NULL DEFAULT 0 CHECK (photo_count >= 0),
  has_description BOOLEAN NOT NULL DEFAULT false,
  has_broker_message BOOLEAN NOT NULL DEFAULT false,
  has_hull_deck_specs BOOLEAN NOT NULL DEFAULT false,
  has_engine_specs BOOLEAN NOT NULL DEFAULT false,
  has_dimensions BOOLEAN NOT NULL DEFAULT false,
  has_speed_capacity_specs BOOLEAN NOT NULL DEFAULT false,
  days_on_market INTEGER CHECK (days_on_market IS NULL OR days_on_market >= 0),

  linked_listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,

  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_yatco_fleet_listings_vid UNIQUE (vid)
);

COMMENT ON TABLE public.yatco_fleet_listings IS
  'Full YATCO BOSS fleet snapshot (content audit) ingested by scripts/sync-yatco-fleet-listings.ts from fleet-audit-scrape.mjs output. Independent of public.listings coverage.';
COMMENT ON COLUMN public.yatco_fleet_listings.vid IS
  'YATCO BOSS internal vessel ID (vID query param), NOT the public YATCO MLS #.';
COMMENT ON COLUMN public.yatco_fleet_listings.linked_listing_id IS
  'Best-effort match to public.listings (via yatco_vessel_id or normalized name); NULL if unmatched.';

CREATE INDEX IF NOT EXISTS idx_yatco_fleet_listings_status
  ON public.yatco_fleet_listings (status);

-- RLS posture matches yatco_listing_stats / lead_kyc_reports: server-only
-- (service_role), browser roles denied — the app never queries Supabase
-- from the browser, all reads go through createAdminClient() server-side.
ALTER TABLE public.yatco_fleet_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_fleet_listings FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_fleet_listings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.yatco_fleet_listings TO service_role;

COMMIT;
