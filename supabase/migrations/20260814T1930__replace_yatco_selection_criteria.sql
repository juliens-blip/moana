-- ============================================================
-- MOANA YACHTING - YATCO GLOBAL LISTINGS - CRITÈRES DE SÉLECTION
-- Migration idempotente : rejouable sans effet de bord.
--
-- Purpose:
--   Remplacer l'index partiel fondé sur un plancher de prix à 2 000 000 USD
--   par les nouveaux critères de sélection des annonces YATCO :
--     - fraîcheur : source_created_at OU source_updated_at dans les 72
--       dernières heures ;
--     - length_m > 26 ;
--     - model_year >= 2010 ;
--     - AUCUN plancher de prix : price_usd n'intervient plus dans le filtre.
--
-- Cette migration n'altère aucune colonne de public.yatco_global_listings et
-- ne touche ni public.yatco_listing_price_history ni
-- public.yatco_listing_price_deltas, déjà livrés par la migration
-- 20260814T1330. Le rollback vit dans le fichier .down.sql frère et relève
-- d'une décision humaine.
-- ============================================================

BEGIN;

-- Retire l'ancien index partiel : la sélection ne filtre plus sur un
-- plancher de prix.
DROP INDEX IF EXISTS public.idx_yatco_global_listings_price_usd;

-- Index de support pour le volet statique des critères. Le volet fraîcheur
-- (relatif à now()) ne peut pas être un prédicat d'index, now() n'étant pas
-- immuable : il est porté par la vue ci-dessous.
CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_selection_criteria
  ON public.yatco_global_listings (length_m, model_year)
  WHERE length_m > 26 AND model_year >= 2010;

-- Vue des annonces sélectionnées. security_invoker : applique la RLS de
-- l'appelant, cohérent avec FORCE ROW LEVEL SECURITY sur la table.
CREATE OR REPLACE VIEW public.yatco_selection_candidates
  WITH (security_invoker = true) AS
SELECT l.*
FROM public.yatco_global_listings l
WHERE (
    l.source_created_at >= now() - INTERVAL '72 hours'
    OR l.source_updated_at >= now() - INTERVAL '72 hours'
  )
  AND l.length_m > 26
  AND l.model_year >= 2010;
-- Volontairement aucun filtre sur price_usd : pas de plancher de prix.

REVOKE ALL PRIVILEGES ON TABLE public.yatco_selection_candidates FROM anon, authenticated;
GRANT SELECT ON TABLE public.yatco_selection_candidates TO service_role;

COMMENT ON VIEW public.yatco_selection_candidates IS
  'Annonces YATCO fraîches (créées ou mises à jour <72h), length_m > 26, model_year >= 2010, sans plancher de prix';

COMMIT;
