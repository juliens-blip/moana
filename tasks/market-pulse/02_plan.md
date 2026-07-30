# 02 — Plan (PLAN, apex) : market-pulse

## 1. Schéma Supabase

`scripts/market-pulse-schema.sql` — nouvelle table `yatco_market_pulse`, RLS
service_role-only (même posture que `yatco_fleet_listings`/`yatco_listing_stats`).
Une ligne par (vid, feed_type, scraped_at) — pas d'upsert par vid seul, car un même
vessel peut apparaître dans plusieurs feeds/jours avec un `history_text` différent à
chaque run (c'est un flux d'évènements, pas un état courant comme la flotte Moana).

```sql
CREATE TABLE public.yatco_market_pulse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_type TEXT NOT NULL CHECK (feed_type IN ('new', 'modified', 'sold')),
  vid TEXT NOT NULL,
  mls_id TEXT,
  vessel_name TEXT NOT NULL,
  builder TEXT,
  model_year INTEGER,
  category TEXT,
  loa_text TEXT,
  price_text TEXT,
  location TEXT,
  broker_name TEXT,
  history_text TEXT,              -- texte brut BOSS, ex. "Price was €35,900,000 EUR changed to €29,500,000 EUR."
  is_price_drop BOOLEAN NOT NULL DEFAULT false,
  price_before_text TEXT,
  price_after_text TEXT,
  sold_date TEXT,                  -- feed 'sold' uniquement
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_market_pulse_vid_feed_run UNIQUE (vid, feed_type, scraped_at)
);
CREATE INDEX idx_market_pulse_feed_scraped ON public.yatco_market_pulse (feed_type, scraped_at DESC);
CREATE INDEX idx_market_pulse_price_drop ON public.yatco_market_pulse (is_price_drop) WHERE is_price_drop;
-- RLS : service_role only, comme les tables sœurs.
```

## 2. Scraping (standalone, réutilisable)

`D:\dev\scrape-mcp\scripts\market-pulse-scrape.mjs` — même schéma que
`fleet-audit-scrape.mjs` : Playwright headless, réutilise `auth/yatcoboss.json`.
Séquence par feed : `goto` l'URL code-bearing Search → click `useractionid="75"`
(new) / `"76"` (modified) / `"77"` (sold) → wait → parser les cartes `.Resulttop`
+ `.Result` rendues (haut de tri "Largest", ~12-25 lignes selon le feed, limite connue
et documentée — pas de pagination résolue). Extraction par carte : `data-vesselid`,
nom (`h4`), specs de l'en-tête (LOA/builder/catégorie/année), puis dans `.Result` :
broker(s), price (`Price:` span), location (`VESSEL LOCATION:` span), sold date
(`Sold Date:` span, feed sold), `history_text` (`.HistoryText` div, si présent).
Regex sur `history_text` : `/Price was ([^ ]+(?:\s?[A-Z]{3})?[\d.,]+[^ ]*(?:\s?[A-Z]{3})?)\s*changed to\s*([^.]+)\./i`
→ si match, `is_price_drop=true` (ou `false` si le prix "after" est supérieur — parser
les deux montants pour comparer, pas juste détecter la présence du pattern).
Sortie JSON par run : `market-pulse.json` (array des 3 feeds combinés, champ `feedType`).

## 3. Ingestion

`scripts/sync-market-pulse.ts` (calqué sur `sync-yatco-fleet-listings.ts`) : lit le
JSON, **insert** (pas upsert d'état — append d'évènement) avec `scraped_at` = horodatage
du run, `onConflict: 'vid,feed_type,scraped_at'` en no-op si rejoué le même run.

## 4. Backend app (lib/)
- `lib/supabase/market-pulse.ts` — `getMarketPulseFeed(feedType?, { priceDropOnly? })`
  lecture seule, tri `scraped_at DESC`.
- `lib/types.ts` — ajout `YatcoMarketPulseEntry` (append, section dédiée).

## 5. UI — nouvelle section
- Route `app/dashboard/market-pulse/page.tsx`, serveur, fetch direct.
- `components/listings/MarketPulseCard.tsx` — carte comparable : nom, builder/année/LOA,
  prix, localisation, broker, badge feed (Nouveau/Modifié/Vendu), et si `is_price_drop`,
  bandeau rouge "Prix : X → Y" bien visible (c'est la donnée à plus forte valeur).
- `components/listings/MarketPulseGrid.tsx` — filtre par feed (Tous/Nouveau/Modifié/Vendu)
  + toggle "Baisses de prix uniquement".
- Nav Header : lien "Market Pulse" (même pattern que "Listings YATCO").

## 6. Fichiers touchés
Nouveaux : `scripts/market-pulse-schema.sql`, `scripts/sync-market-pulse.ts`,
`D:\dev\scrape-mcp\scripts\market-pulse-scrape.mjs`, `lib/supabase/market-pulse.ts`,
`app/dashboard/market-pulse/page.tsx`, `components/listings/MarketPulseCard.tsx`,
`components/listings/MarketPulseGrid.tsx`.
Modifiés : `lib/types.ts` (ajout type), `components/listings/index.ts` (exports),
`components/layout/Header.tsx` (nav).

## 7. Ordre CODE → TEST → DEPLOY
1. SQL (exécutée par l'utilisateur dans Supabase SQL Editor, comme les tables sœurs).
2. Scraper + run initial → `market-pulse.json`.
3. Ingestion + run initial.
4. `lib/types.ts`, `lib/supabase/market-pulse.ts`.
5. UI (page + cartes + grille + nav).
6. TEST : `tsc --noEmit`, `eslint`, QA visuelle (`next dev` + cookie broker local).
7. Rien commité sans demande explicite (même caveat `lib/types.ts`/`package.json` que #3).
