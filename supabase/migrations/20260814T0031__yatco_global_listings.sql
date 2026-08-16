-- ============================================================
-- MOANA YACHTING - YATCO GLOBAL LISTINGS
-- Migration idempotente : rejouable sans effet de bord.
--
-- Purpose:
--   1. Journaliser chaque exécution de scrape (public.yatco_scrape_runs).
--   2. Stocker les annonces YATCO dédupliquées (public.yatco_global_listings).
--   3. Conserver le prix et la devise d'origine à côté d'un price_usd
--      normalisé, exploitable pour le seuil de 2 000 000 USD.
--   4. Garder ces tables strictement server-only (service_role).
--
-- Cette migration ne contient aucun DROP : le rollback vit dans le fichier
-- .down.sql frère et relève d'une décision humaine.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Journal d'exécution du scraper.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yatco_scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clé d'idempotence de l'exécution, fournie par l'appelant.
  run_key TEXT NOT NULL,

  -- Cycle de vie. Les lignes terminées sont conservées comme historique.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'running',
      'completed',
      'failed',
      'cancelled'
    )),

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,

  -- Compteurs d'exécution, jamais négatifs.
  listings_seen INTEGER NOT NULL DEFAULT 0 CHECK (listings_seen >= 0),
  listings_inserted INTEGER NOT NULL DEFAULT 0 CHECK (listings_inserted >= 0),
  listings_updated INTEGER NOT NULL DEFAULT 0 CHECK (listings_updated >= 0),
  listings_skipped INTEGER NOT NULL DEFAULT 0 CHECK (listings_skipped >= 0),
  pages_fetched INTEGER NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),

  -- Diagnostics opérationnels seulement. Jamais de secret ni de trace complète.
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),

  -- Paramètres d'appel du run (filtres, pagination), pour l'audit.
  params JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(params) = 'object'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

-- ------------------------------------------------------------
-- Annonces YATCO dédupliquées.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yatco_global_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identité de l'annonce à la source.
  source TEXT NOT NULL DEFAULT 'yatco'
    CHECK (btrim(source) <> ''),
  external_id TEXT NOT NULL
    CHECK (btrim(external_id) <> ''),

  -- Clé de déduplication calculée en base : jamais NULL, jamais divergente
  -- d'un worker à l'autre.
  dedup_key TEXT GENERATED ALWAYS AS
    (lower(source) || ':' || lower(external_id)) STORED,

  listing_url TEXT,

  -- Descriptif bateau.
  boat_name TEXT,
  builder TEXT,
  model TEXT,
  model_year INTEGER,
  length_m NUMERIC(10,2),

  -- Prix d'origine conservé tel quel, plus sa normalisation USD traçable.
  price_amount NUMERIC(14,2),
  price_currency TEXT
    CHECK (price_currency IS NULL OR char_length(price_currency) = 3),
  price_usd NUMERIC(14,2)
    CHECK (price_usd IS NULL OR price_usd >= 0),
  price_usd_rate NUMERIC(18,8),
  price_converted_at TIMESTAMPTZ,

  -- Localisation.
  country TEXT,
  country_code TEXT
    CHECK (country_code IS NULL OR char_length(country_code) = 2),
  city TEXT,

  -- Fraîcheur côté source, distincte des timestamps techniques locaux.
  source_updated_at TIMESTAMPTZ,

  -- Traçabilité de collecte.
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_id UUID REFERENCES public.yatco_scrape_runs(id) ON DELETE SET NULL,

  -- Charge brute d'audit.
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(raw_payload) = 'object'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Index.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_yatco_global_listings_dedup
  ON public.yatco_global_listings (dedup_key);

CREATE UNIQUE INDEX IF NOT EXISTS uq_yatco_scrape_runs_run_key
  ON public.yatco_scrape_runs (run_key);

-- Index partiel : seule la tranche >= 2 000 000 USD est requêtée.
CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_price_usd
  ON public.yatco_global_listings (price_usd)
  WHERE price_usd >= 2000000;

CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_source_updated_at
  ON public.yatco_global_listings (source_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_country_code
  ON public.yatco_global_listings (country_code);

CREATE INDEX IF NOT EXISTS idx_yatco_scrape_runs_started_at
  ON public.yatco_scrape_runs (started_at DESC);

-- ------------------------------------------------------------
-- updated_at technique : fonction dédiée, search_path vide, pour ne pas
-- entrer en collision avec public.update_updated_at_column() (brokers/leads).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_yatco_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_yatco_scrape_runs_updated_at
  BEFORE UPDATE ON public.yatco_scrape_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_yatco_updated_at();

CREATE OR REPLACE TRIGGER trg_yatco_global_listings_updated_at
  BEFORE UPDATE ON public.yatco_global_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_yatco_updated_at();

-- ------------------------------------------------------------
-- RLS : tables backend-only, comme public.lead_kyc_reports.
-- ------------------------------------------------------------
ALTER TABLE public.yatco_scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_scrape_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_global_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_global_listings FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_scrape_runs FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.yatco_global_listings FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.yatco_scrape_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.yatco_global_listings TO service_role;

-- ------------------------------------------------------------
-- Documentation du contrat.
-- ------------------------------------------------------------
COMMENT ON TABLE public.yatco_scrape_runs IS
  'Journal des exécutions du scraper YATCO; accès server-side uniquement';
COMMENT ON TABLE public.yatco_global_listings IS
  'Annonces YATCO dédupliquées; accès server-side uniquement';

COMMENT ON COLUMN public.yatco_global_listings.dedup_key IS
  'Clé de déduplication générée lower(source):lower(external_id); index unique';
COMMENT ON COLUMN public.yatco_global_listings.price_amount IS
  'Prix affiché à la source, dans price_currency, jamais converti';
COMMENT ON COLUMN public.yatco_global_listings.price_currency IS
  'Devise ISO 4217 du prix d''origine (3 lettres)';
COMMENT ON COLUMN public.yatco_global_listings.price_usd IS
  'Prix normalisé en USD, renseigné par le scraper avec price_usd_rate et price_converted_at';
COMMENT ON COLUMN public.yatco_global_listings.source_updated_at IS
  'Horodatage de mise à jour côté YATCO, distinct du updated_at technique local';

COMMIT;
