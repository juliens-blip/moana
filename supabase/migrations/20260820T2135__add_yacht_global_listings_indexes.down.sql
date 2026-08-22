-- ============================================================
-- ROLLBACK de 20260820T2135__add_yacht_global_listings_indexes.sql
--
-- Retire uniquement les cinq index ajoutés par la migration up jumelle.
-- Ne touche à aucune colonne, à aucune table, à aucune vue.
-- DROP INDEX IF EXISTS est sûr même si public.yatco_global_listings ou
-- l'un des index est déjà absent (rejeu, environnement de test vide) :
-- contrairement à CREATE INDEX, DROP INDEX IF EXISTS n'a besoin d'aucun
-- garde supplémentaire sur la table parente.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.idx_yatco_global_listings_model_year;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_length_m;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_country;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_price_usd_filter;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_updated_at;

COMMIT;
