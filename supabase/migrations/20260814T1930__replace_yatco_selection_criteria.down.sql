-- ============================================================
-- ROLLBACK de 20260814T1930__replace_yatco_selection_criteria.sql
--
-- Retire les objets introduits par la migration up jumelle (vue de sélection
-- + index de critères) et restaure l'index partiel prix >= 2 000 000 USD
-- qu'elle avait retiré. Ne touche ni aux colonnes de
-- public.yatco_global_listings, ni à public.yatco_listing_price_history, ni
-- à public.yatco_listing_price_deltas.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.yatco_selection_candidates;
DROP INDEX IF EXISTS public.idx_yatco_global_listings_selection_criteria;

-- Restaure l'index partiel retiré par la migration up jumelle.
CREATE INDEX IF NOT EXISTS idx_yatco_global_listings_price_usd
  ON public.yatco_global_listings (price_usd)
  WHERE price_usd >= 2000000;

COMMIT;
