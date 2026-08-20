-- ============================================================
-- MOANA YACHTING - YATCO GLOBAL LISTINGS - FIX SIGNAL DE FRAÎCHEUR
-- Migration idempotente : rejouable sans effet de bord.
--
-- Purpose:
--   La vue public.yatco_selection_candidates (migration 20260814T1930)
--   filtrait la fraîcheur sur source_created_at/source_updated_at — des
--   dates PUBLIÉES PAR YATCO, pas nos dates d'ingestion :
--     - source_created_at n'est jamais rempli : YATCO n'expose aucune date
--       de création d'annonce sur les pages scrapées (jamais de valeur
--       inventée, voir scripts/yatco_collector.py:parse_listing).
--     - source_updated_at vient du <lastmod> du sitemap YATCO, qui bouge
--       très rarement (souvent plusieurs mois) même pour une annonce que
--       nous découvrons/mettons à jour aujourd'hui.
--   Résultat observé en production : 4438 annonces en base, plusieurs
--   ingérées le jour même, mais la vue renvoie 0 lignes — le filtre teste
--   la mauvaise horloge.
--
--   Cette migration bascule le signal de fraîcheur sur first_seen_at/
--   updated_at (nos colonnes techniques d'ingestion, toujours à jour car
--   posées par le worker à chaque scrape/mise à jour). Aucun autre critère
--   ne change (length_m > 26, model_year >= 2010, aucun plancher de prix).
--   N'altère aucune colonne de public.yatco_global_listings.
-- ============================================================

BEGIN;

CREATE OR REPLACE VIEW public.yatco_selection_candidates
  WITH (security_invoker = true) AS
SELECT l.*
FROM public.yatco_global_listings l
WHERE (
    l.first_seen_at >= now() - INTERVAL '72 hours'
    OR l.updated_at >= now() - INTERVAL '72 hours'
  )
  AND l.length_m > 26
  AND l.model_year >= 2010;
-- Volontairement aucun filtre sur price_usd : pas de plancher de prix.

COMMENT ON VIEW public.yatco_selection_candidates IS
  'Annonces YATCO découvertes ou mises à jour par notre ingestion <72h (first_seen_at/updated_at), length_m > 26, model_year >= 2010, sans plancher de prix';

COMMIT;
