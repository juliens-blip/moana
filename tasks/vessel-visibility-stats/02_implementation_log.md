# 02 — Implementation log (CODE + TEST) : vessel-visibility-stats

## Fichiers créés
- `scripts/vessel-visibility-stats-schema.sql` — ajoute `stats_impressions`,
  `stats_detail_views`, `stats_phone_clicks`, `stats_gallery_views`,
  `stats_leads`, `stats_synced_at` sur `yatco_fleet_listings` (courant, pas
  d'historique). **Appliquée par l'utilisateur** dans Supabase SQL Editor.
- `D:\dev\scrape-mcp\scripts\vessel-stats-scrape.mjs` — scraper standalone :
  Insight Analytics → FLEET/INVENTORY (756) → YATCO.com Vessel Statistics
  Report (769) → soumet le formulaire par défaut (7 derniers jours, **pas
  besoin de renseigner OfficeID** — testé, fonctionne sans, contrairement à
  une note antérieure) → parse MLSID (attribut caché derrière un préfixe
  "YATCO MLS #:", nettoyé)/Name/LOA/Impressions/DetailViews/PhoneClicks/
  GalleryViews/Leads. **Exécuté en live** : 25 lignes.
- `scripts/sync-vessel-visibility-stats.ts` — croise chaque ligne scrapée par
  **MLS# exact** avec `yatco_fleet_listings` (pas de vID/builder dans ce
  rapport, donc matching par MLS# plutôt que par nom) → upsert des colonnes
  stats_* sur `yatco_fleet_listings` (alimente les cartes Listings YATCO) →
  écrit aussi un fichier bridge au format attendu par le script existant
  `sync-yatco-stats.ts` (vesselId/builder/loaMeters récupérés depuis
  `yatco_fleet_listings`) pour les vessels matchés. **Exécuté en live** :
  7/25 matchés (le rapport BOSS couvre aussi des vessels non-Actifs hors du
  périmètre des 25 listings actifs de fleet-content-audit — cohérent avec le
  gap 25/34 déjà documenté), 0 erreur.

## Chantier "yatco-stats" terminé (fichiers non touchés, juste exécutés)
`scripts/sync-yatco-stats.ts` (préexistant, jamais modifié) lancé pour de vrai
avec le fichier bridge : **3/7 déjà liés** à un listing Moana (MAZAG, ANNAMIA,
Atlantis — noms internes Moana, parfois différents du nom YATCO), snapshot
`yatco_listing_stats` écrit pour chacun, 0 erreur. Les 4 non liés (BAGLIETTO
DOM 133, TI AMO, CHANTELLA, RIVA 115) n'ont pas de ligne dans `listings` —
confirme le gap déjà connu (~10/59 listings ont un yatco_vessel_id). La courbe
recharts de `YatcoStatsSection.tsx` (déjà branchée dans `ListingDetailModal.tsx`)
n'affichera l'historique qu'à partir du 2e relevé (normal, un seul snapshot
existe pour l'instant par vessel).

## Fichiers modifiés
- `lib/types.ts` — ajout des 6 champs stats_* sur `YatcoFleetListing` (append,
  même caveat WIP que les autres outils).
- `components/listings/FleetAuditCard.tsx` — bandeau "Visibilité YATCO.com
  (7 derniers jours)" (Impressions/Vues/Appels/Galerie + mention leads si >0),
  affiché seulement quand `stats_impressions` n'est pas `null`.

## TEST
- `tsc --noEmit` : aucune nouvelle erreur (les 10 erreurs pré-existantes du
  WIP sanctions/yatco-stats non lié restent identiques).
- `eslint` sur les 3 fichiers touchés : 0 issue.
- QA visuelle réelle : `next dev` + cookie de session broker local →
  `GET /dashboard/listings-yatco` → 200, 7 cartes affichent bien le bandeau
  de visibilité (ATLANTIS = 149 impressions confirmé dans le HTML rendu).

## Non fait / hors périmètre v1
- Seuls les 25 listings Actifs de `yatco_fleet_listings` peuvent recevoir des
  stats (même limite que fleet-content-audit) — les 18 lignes non matchées du
  rapport BOSS correspondent probablement à des vessels Expired/Withdrawn/Sold
  hors périmètre actuel.
- Rafraîchissement manuel (2 commandes : scraper puis les 2 scripts de sync).
- Rien commité — même caveat `lib/types.ts` que les autres outils.

## Reprise intégrée — 2026-07-22

- Les contrats partagés `Listing.yatco_vessel_id` et `YatcoListingStats` sont
  maintenant présents ; l'API et la section UI gèrent les réponses vides,
  les erreurs et l'annulation du fetch.
- `npm run type-check`, `npm run lint` et `git diff --check` passent sur l'état
  intégré. Le second snapshot reste nécessaire pour afficher une courbe.
