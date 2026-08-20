-- ============================================================
-- ROLLBACK de 20260820T1615__fix_yatco_selection_freshness_signal.sql
--
-- Restaure le signal de fraîcheur d'origine (source_created_at/
-- source_updated_at) de la migration 20260814T1930. Ne touche à aucune
-- colonne de public.yatco_global_listings.
-- ============================================================

BEGIN;

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

COMMENT ON VIEW public.yatco_selection_candidates IS
  'Annonces YATCO fraîches (créées ou mises à jour <72h), length_m > 26, model_year >= 2010, sans plancher de prix';

COMMIT;
