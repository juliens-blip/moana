# 01 — Analyse + Plan : market-trends

## Besoin
Nouvel onglet : « courbe de marché » sur ~2 semaines + état du marché yachting
mondial. Décision utilisateur (AskUserQuestion) : **pas de découpage régional**
— une vue globale suffit.

## EXPLORE — ce qui marche / ce qui ne marche pas
- **✅ Market Review** (Insight Analytics → WORLDWIDE MLS `757` → `781`,
  `/insights/manage/fiveyearmarketreport/`) : confirmé en live, **3 tableaux
  globaux** par tranche de taille (39' below / 40-79' / 80-119' / 120'+),
  années 2021→2026 YTD : **Sold Vessels by Size Range** (nb ventes), **Total
  Sold Value**, **Average Days on Market**. Pas de filtre date custom, pas de
  région — mais rendu fiable, rapide (~13s), aucune dépendance de formulaire.
  2026 YTD (au 21/07) : 59 ventes 120'+ (31j sur le marché en moyenne, vs 87j
  en 2025 — marché plus rapide cette année sur ce segment).
- **❌ MLS Sold Listings Report** (`774`, `/insights/manage/soldlistingreportoutput/`) :
  a un vrai filtre `DateRange_Start`/`DateRange_End` + `CountryID` (idéal sur le
  papier pour un "vrai" filtre 14 jours) mais **reste bloqué en "Loading..."
  indéfiniment** malgré plusieurs essais (fill date, filtre "Both" au lieu
  d'"Exclusive" par défaut, jusqu'à 10s d'attente) — grid Kendo qui ne
  répond jamais sur ce compte. **Abandonné**, pas creusé davantage (rendement
  décroissant sur l'investigation).
- **Sold Boats by Month** (`780`) : idem, "No items to display" persistant,
  probablement le même souci que `774` (non retesté après l'échec de 774).

## Décision de périmètre v1
1. **État du marché (global)** : scraper + stocker un snapshot du Market
   Review (3 tableaux, JSONB) — rafraîchi manuellement comme les autres outils.
2. **Courbe ~2 semaines** : **pas de rapport BOSS dédié fiable trouvé** pour
   un vrai historique rétroactif. Réutilise les données déjà collectées par
   [[market-pulse]] (`yatco_market_pulse`, event-stream New/Modified/Sold)
   — la courbe se construit **prospectivement** à chaque nouveau run du
   scraper market-pulse (pas d'historique rétroactif avant aujourd'hui,
   assumé et affiché clairement dans l'UI : "l'historique s'enrichit à
   chaque rafraîchissement").

## Schéma Supabase
`yatco_market_review_snapshots` — un snapshot par run (pas de normalisation
par cellule, le JSON de BOSS se prête bien à un stockage JSONB) :
```sql
CREATE TABLE yatco_market_review_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  size_bands JSONB NOT NULL,  -- { "120 and Above": { sold: {2021: 90, ...}, totalValue: {...}, avgDaysOnMarket: {...} }, ... }
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS service_role-only, comme les tables sœurs.
```

## Scraping + ingestion
- `D:\dev\scrape-mcp\scripts\market-review-scrape.mjs` — parse les 3 tableaux
  HTML en un objet JSON structuré par tranche de taille.
- `scripts/sync-market-review.ts` — insert simple (pas d'upsert, un snapshot
  de plus à chaque run, historique conservé).

## UI — nouvel onglet `/dashboard/market-trends`
- Section « État du marché mondial » : 3 mini-graphiques (barres, recharts,
  même palette que le reste de l'app) à partir du dernier snapshot — ventes
  par taille, valeur totale, jours sur le marché, 2021→2026 YTD.
- Section « Tendance récente (courbe qui s'enrichit) » : agrège
  `yatco_market_pulse` par jour de `scraped_at` (nb new/modified/sold, nb
  baisses de prix) en courbe recharts — message explicite si <3 points de
  données disponibles ("Historique limité — se construit à chaque
  rafraîchissement du scraper `market-pulse-scrape.mjs`").
- Nav Header : lien "Market Trends".

## Fichiers
Nouveaux : `scripts/market-review-schema.sql`, `scripts/sync-market-review.ts`,
`D:\dev\scrape-mcp\scripts\market-review-scrape.mjs`,
`lib/supabase/market-review.ts`, `app/dashboard/market-trends/page.tsx`,
`components/listings/MarketReviewCharts.tsx`,
`components/listings/MarketPulseTrendChart.tsx`.
Modifiés : `lib/types.ts` (ajout type), `components/layout/Header.tsx` (nav),
`components/listings/index.ts` (exports).
