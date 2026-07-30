# 03 — Implementation log (CODE + TEST) : market-pulse

## Fichiers créés
- `scripts/market-pulse-schema.sql` — table `yatco_market_pulse` (event-stream, pas
  d'état courant), RLS service_role-only. **Appliquée par l'utilisateur** dans le
  Supabase SQL Editor.
- `D:\dev\scrape-mcp\scripts\market-pulse-scrape.mjs` — scraper Playwright standalone
  (réutilise `auth/yatcoboss.json`) : Search module code-URL → clic `useractionid`
  75/76/77 (New/Modified/Sold) → parse `table.Resulttop`/`table.Result` par `p`
  label:value + `.HistoryText` → regex `Price was X changed to Y` pour détecter les
  baisses de prix sans logique de diff maison. **Exécuté en live** : 30 lignes
  (12 new, 12 modified, 6 sold), 0 erreur.
- `scripts/sync-market-pulse.ts` — ingestion JSON → Supabase, upsert par
  (vid, feed_type, scraped_at). **Exécuté en live** : 30 synced, 0 price drops sur
  ce batch (aucune des 12 lignes "modified" du haut du tri "Largest" n'avait de
  changement de prix ce jour — Country/Status uniquement), 0 erreur.
- `lib/supabase/market-pulse.ts` — `getMarketPulseFeed()` (lecture app, filtres
  feedType/priceDropOnly).
- `app/dashboard/market-pulse/page.tsx` — route serveur, fetch direct.
- `components/listings/MarketPulseCard.tsx` + `MarketPulseGrid.tsx` — carte comparable
  (bandeau rouge si baisse de prix détectée, tag "(Moana)" si le broker est Moana
  Yachting lui-même) + grille avec filtre feed + toggle "baisses de prix uniquement".

## Fichiers modifiés
- `lib/types.ts` — ajout `YatcoMarketPulseEntry` (append, même caveat que
  [[fleet-content-audit]] : ne pas stager le fichier en entier, WIP non lié dedans).
- `components/listings/index.ts` — export des 2 nouveaux composants.
- `components/layout/Header.tsx` — lien nav "Market Pulse" (desktop + drawer mobile).

## Découverte clé (EXPLORE)
`div.HistoryText` sur chaque carte de résultat MLS donne le **texte littéral du
changement** ("Price was €X changed to €Y.", "Status was Active changed to Sold.") —
pas besoin de stocker nos propres snapshots pour calculer une baisse de prix, BOSS
la fournit directement. Confirmé en live sur le feed Sold (ex. CD TWO : "Status was
Active changed to Sold.").

## Limite connue (documentée, pas résolue)
Chaque feed annonce un vrai total ("Modified Vessel Search Results - (190 Listings
Found)" testé ce jour) mais seules les ~12 premières lignes (triées "Largest" par
défaut) se rendent sans solution de pagination/lazy-load trouvée (`scrollIntoView`
+ `press End` + `blockResources:false` testés, sans effet). Décision produit : le
tri par taille correspond déjà au segment Moana (27-85m) donc pas un problème pour
la v1 ; pagination complète = v2 si le besoin se confirme.

## TEST
- `npx tsc --noEmit` → 0 erreur. `npx eslint` sur les 8 fichiers touchés → 0 issue.
- QA visuelle réelle : `next dev`, cookie de session broker construit localement
  (comme pour fleet-content-audit) → `GET /dashboard/market-pulse` → 200, contenu
  confirmé (PELORUS, ATLANTIS avec tag "(Moana)", CD TWO présents ; nav "Market
  Pulse" présent ; aucun texte d'erreur). Serveur dev arrêté après vérification.

## Non fait / hors périmètre v1
- Pagination complète des 3 feeds (actuellement top ~12-25 par tri taille).
- Pas de refresh automatique — manuel : `node D:/dev/scrape-mcp/scripts/
  market-pulse-scrape.mjs` puis `dotenv -e .env.local -- npx tsx scripts/
  sync-market-pulse.ts market-pulse.json`.
- Rien commité — même caveat `lib/types.ts`/`package.json` que fleet-content-audit.
