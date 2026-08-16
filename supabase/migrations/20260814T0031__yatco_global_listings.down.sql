-- ============================================================
-- ROLLBACK de 20260814T0031__yatco_global_listings.sql
--
-- ⚠️ DESTRUCTIF. Ce fichier détruit toutes les annonces scrapées et tout
-- l'historique d'exécution. Il n'est appliqué par aucun script : son
-- exécution est une décision humaine explicite.
--
-- SAUVEGARDE PRÉALABLE OBLIGATOIRE, avant toute exécution :
--   pg_dump "$SUPABASE_DB_URL" \
--     --table=public.yatco_global_listings \
--     --table=public.yatco_scrape_runs \
--     --file=yatco_backup_$(date +%Y%m%dT%H%M%S).sql
--
-- Les triggers trg_yatco_*_updated_at disparaissent avec leurs tables.
-- Aucune autre table du schéma public n'est touchée.
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.yatco_global_listings;
DROP TABLE IF EXISTS public.yatco_scrape_runs;
DROP FUNCTION IF EXISTS public.update_yatco_updated_at();

COMMIT;
