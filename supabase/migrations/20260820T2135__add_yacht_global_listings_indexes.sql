-- ============================================================
-- MOANA YACHTING - YATCO GLOBAL LISTINGS - INDEX DES FILTRES
-- Migration idempotente : rejouable sans effet de bord.
--
-- Purpose:
--   Indexer séparément chaque colonne utilisée par les filtres du
--   dashboard YATCO Global (lib/supabase/yatco-global.ts) et le
--   timestamp d'ingestion utilisé par son tri par défaut :
--     - model_year : filtre minYear
--     - length_m   : filtre minLengthMeters
--     - country    : filtre country (comparé en ILIKE)
--     - price_usd  : filtre prix à venir ; remplace le seul index qui
--       existait sur cette colonne, l'index partiel retiré par
--       20260814T1930 (nom distinct pour ne pas entrer en collision avec
--       lui si son down.sql venait à le restaurer)
--     - updated_at : .order('updated_at', { ascending: false }), le tri
--       par défaut ; id en second membre comme clé de départ stable pour
--       une future pagination par curseur
--
--   CREATE INDEX n'a pas d'équivalent de ALTER TABLE ... IF EXISTS pour
--   protéger contre une table parente absente : chaque instruction est
--   donc encapsulée dans un bloc DO gardé par to_regclass(), pour rester
--   un no-op silencieux plutôt qu'une erreur si
--   public.yatco_global_listings n'existe pas encore (rejeu partiel,
--   environnement de test vide).
--
--   N'altère aucune colonne, ne touche à aucune table ni à aucune vue
--   existante (public.yatco_selection_candidates). Le rollback vit dans
--   le fichier .down.sql frère et relève d'une décision humaine.
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.yatco_global_listings') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_model_year '
      || 'ON public.yatco_global_listings (model_year)';
    EXECUTE 'COMMENT ON INDEX public.idx_yatco_global_listings_model_year IS '
      || quote_literal('Support du filtre minYear (lib/supabase/yatco-global.ts)');

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_length_m '
      || 'ON public.yatco_global_listings (length_m)';
    EXECUTE 'COMMENT ON INDEX public.idx_yatco_global_listings_length_m IS '
      || quote_literal('Support du filtre minLengthMeters (lib/supabase/yatco-global.ts)');

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_country '
      || 'ON public.yatco_global_listings (country)';
    EXECUTE 'COMMENT ON INDEX public.idx_yatco_global_listings_country IS '
      || quote_literal('Support du filtre country, comparé en ILIKE (lib/supabase/yatco-global.ts)');

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_price_usd_filter '
      || 'ON public.yatco_global_listings (price_usd)';
    EXECUTE 'COMMENT ON INDEX public.idx_yatco_global_listings_price_usd_filter IS '
      || quote_literal('Support d''un futur filtre prix, sans plancher ; distinct de idx_yatco_global_listings_price_usd (index partiel >= 2M USD retiré par 20260814T1930)');

    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_updated_at '
      || 'ON public.yatco_global_listings (updated_at DESC, id)';
    EXECUTE 'COMMENT ON INDEX public.idx_yatco_global_listings_updated_at IS '
      || quote_literal('Support du tri par défaut .order(updated_at DESC) ; id en clé de départ pour une pagination stable');
  END IF;
END
$$;

COMMIT;
