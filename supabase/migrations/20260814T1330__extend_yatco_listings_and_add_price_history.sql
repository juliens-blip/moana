-- ============================================================
-- MOANA YACHTING - YATCO GLOBAL LISTINGS - EXTENSION + HISTORIQUE PRIX
-- Migration idempotente : rejouable sans effet de bord.
--
-- Purpose:
--   1. Étendre public.yatco_global_listings avec les métadonnées broker,
--      agent, fiche technique et date de création côté source.
--   2. Ajouter l'index de fraîcheur sur source_created_at (fenêtre 72h),
--      en complément de l'index existant sur source_updated_at.
--   3. Introduire public.yatco_listing_price_history : un point de prix
--      par observation, plusieurs points possibles pour un même dedup_key.
--   4. Exposer public.yatco_listing_price_deltas, une vue calculant le
--      delta montant et pourcentage avec le point de prix précédent.
--
-- Cette migration ne contient aucun DROP : le rollback vit dans le fichier
-- .down.sql frère et relève d'une décision humaine.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Extension de public.yatco_global_listings.
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.yatco_global_listings
  ADD COLUMN IF NOT EXISTS broker_name TEXT,
  ADD COLUMN IF NOT EXISTS broker_company TEXT,
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_email TEXT,
  ADD COLUMN IF NOT EXISTS spec_sheet_url TEXT,
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_source_created_at
  ON public.yatco_global_listings (source_created_at DESC);

-- ------------------------------------------------------------
-- Historique des prix : un point par observation, jamais réécrit.
-- dedup_key référence l'index unique de yatco_global_listings, la même
-- identité que la table parente.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.yatco_listing_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  dedup_key TEXT NOT NULL
    REFERENCES public.yatco_global_listings (dedup_key) ON DELETE CASCADE,

  price_amount NUMERIC(14,2),
  price_currency TEXT
    CHECK (price_currency IS NULL OR char_length(price_currency) = 3),
  price_usd NUMERIC(14,2)
    CHECK (price_usd IS NULL OR price_usd >= 0),

  -- Horodatage de l'observation ; fait foi pour l'ordre des points de prix.
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Clé d'idempotence explicite : un worker qui rejoue la même observation
  -- doit pouvoir écrire avec ON CONFLICT (dedup_key, observed_at) DO NOTHING
  -- plutôt qu'un check-puis-insert sujet aux courses.
  CONSTRAINT uq_yatco_listing_price_history_dedup_observed
    UNIQUE (dedup_key, observed_at)
);

CREATE INDEX IF NOT EXISTS idx_yatco_listing_price_history_dedup_key
  ON public.yatco_listing_price_history (dedup_key, observed_at DESC);

-- ------------------------------------------------------------
-- Delta de prix par rapport au point précédent du même dedup_key.
-- security_invoker : la vue applique la RLS de l'appelant, pas celle du
-- propriétaire, cohérente avec FORCE ROW LEVEL SECURITY sur la table.
-- Pas de division par zéro : un prix précédent nul ou à zéro donne un
-- pourcentage NULL plutôt qu'une erreur.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.yatco_listing_price_deltas
  WITH (security_invoker = true) AS
SELECT
  h.id,
  h.dedup_key,
  h.observed_at,
  h.price_usd,
  LAG(h.price_usd) OVER w AS previous_price_usd,
  h.price_usd - LAG(h.price_usd) OVER w AS price_delta_usd,
  CASE
    WHEN LAG(h.price_usd) OVER w IS NULL OR LAG(h.price_usd) OVER w = 0
      THEN NULL
    ELSE round(
      (h.price_usd - LAG(h.price_usd) OVER w)
        / LAG(h.price_usd) OVER w * 100,
      4
    )
  END AS price_delta_pct
FROM public.yatco_listing_price_history h
WINDOW w AS (PARTITION BY h.dedup_key ORDER BY h.observed_at);

-- ------------------------------------------------------------
-- RLS : historique backend-only, même politique que la table parente.
-- ------------------------------------------------------------
ALTER TABLE public.yatco_listing_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yatco_listing_price_history FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.yatco_listing_price_history FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.yatco_listing_price_deltas FROM anon, authenticated;

GRANT SELECT, INSERT
  ON TABLE public.yatco_listing_price_history TO service_role;
GRANT SELECT
  ON TABLE public.yatco_listing_price_deltas TO service_role;

-- ------------------------------------------------------------
-- Documentation du contrat.
-- ------------------------------------------------------------
COMMENT ON TABLE public.yatco_listing_price_history IS
  'Historique des points de prix YATCO par dedup_key; accès server-side uniquement';
COMMENT ON COLUMN public.yatco_listing_price_history.observed_at IS
  'Horodatage de l''observation du prix; fait foi pour l''ordre des points';
COMMENT ON VIEW public.yatco_listing_price_deltas IS
  'Delta montant et pourcentage entre deux points de prix consécutifs d''un même dedup_key';
COMMENT ON COLUMN public.yatco_global_listings.broker_name IS
  'Nom du broker YATCO tel qu''affiché à la source';
COMMENT ON COLUMN public.yatco_global_listings.spec_sheet_url IS
  'URL de la fiche technique YATCO, si publiée';
COMMENT ON COLUMN public.yatco_global_listings.source_created_at IS
  'Horodatage de création côté YATCO, distinct du created_at technique local';

COMMIT;
