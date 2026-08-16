-- ============================================================
-- ROLLBACK de 20260814T1330__extend_yatco_listings_and_add_price_history.sql
--
-- ⚠️ DESTRUCTIF. Ce fichier détruit tout l'historique de prix collecté et
-- les colonnes broker/agent/fiche technique de yatco_global_listings. Il
-- n'est appliqué par aucun script : son exécution est une décision humaine
-- explicite.
--
-- SAUVEGARDE PRÉALABLE OBLIGATOIRE, avant toute exécution :
--   pg_dump "$SUPABASE_DB_URL" \
--     --table=public.yatco_listing_price_history \
--     --file=yatco_price_history_backup_$(date +%Y%m%dT%H%M%S).sql
--
-- Ne retire que les objets introduits par la migration up jumelle : les
-- tables et l'index déjà en place avant celle-ci ne sont pas touchés.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.yatco_listing_price_deltas;
DROP TABLE IF EXISTS public.yatco_listing_price_history;

DROP INDEX IF EXISTS public.idx_yatco_global_listings_source_created_at;

ALTER TABLE IF EXISTS public.yatco_global_listings
  DROP COLUMN IF EXISTS broker_name,
  DROP COLUMN IF EXISTS broker_company,
  DROP COLUMN IF EXISTS agent_name,
  DROP COLUMN IF EXISTS agent_email,
  DROP COLUMN IF EXISTS spec_sheet_url,
  DROP COLUMN IF EXISTS source_created_at;

COMMIT;
