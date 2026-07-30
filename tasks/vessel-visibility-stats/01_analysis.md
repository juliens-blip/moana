# 01 — Analyse (EXPLORE) : vessel-visibility-stats

## Besoin
Demande utilisateur (2026-07-21) : faire apparaître dans « Listings YATCO »
(fleet-content-audit) une analyse des statistiques de visibilité des bateaux
sur les canaux de diffusion YATCO (impressions, vues, clics, leads).

## Chantier existant trouvé (non commité)
Un chantier « yatco-stats » complet mais jamais testé en live existe déjà :
- `scripts/add-yatco-stats.sql` : colonne `listings.yatco_vessel_id` + table
  `yatco_listing_stats` (historique quotidien par listing). **Déjà appliqué en
  live sur Supabase** (vérifié : la table et la colonne existent).
- `scripts/sync-yatco-stats.ts` : ingestion + **auto-linking intelligent**
  (match exact nom+builder, fallback spec-match LOA/prix/localisation si le nom
  générique YATCO diffère du nom Moana) — bien conçu, jamais exécuté avec de
  vraies données scrapées (aucun fichier d'entrée n'existait).
- `lib/supabase/yatco-stats.ts`, `app/api/listings/[id]/yatco-stats/route.ts`,
  `components/listings/YatcoStatsSection.tsx` : lecture + API + UI (courbe
  recharts), déjà **branchés dans `ListingDetailModal.tsx`** (rendu si
  `listing.yatco_vessel_id` existe). Complet, jamais vu de vraies données.

Décision utilisateur (AskUserQuestion) : **terminer ce chantier** ET l'étendre
à la section Listings YATCO.

## Source BOSS confirmée en live (2026-07-21)
Insight Analytics → FLEET/INVENTORY (`756`) → **YATCO.com Vessel Statistics
Report** (`769`, url `/insights/manage/vesselstatisticsreport/`) :
- Formulaire avec `DateStart`/`DateEnd` (défaut = 7 derniers jours), `OfficeID`
  (dropdown Kendo **vide** — pas d'options, mais **pas bloquant** : soumettre
  le formulaire sans le renseigner fonctionne quand même, contrairement à ce
  que notait une mémoire antérieure — probablement corrigé par le fix
  button/form de content-cleaner du 2026-07-16, ou jamais vraiment requis pour
  un compte mono-office).
- Colonnes retournées : **MLSID (vide dans les données vues), Name, LOA,
  Impressions, Detail Views, Phone Clicks, Gallery Views, Leads**. Pas de
  builder, pas de vID, pas de prix/localisation dans cette grille précise.
- Testé en live (fenêtre 7/14–7/21/2026) : **25 lignes réelles**, ex. ATLANTIS
  47.6m = 149 impressions/9 detail views/5 phone clicks/0 leads ; la plupart
  des autres vessels proches de zéro (signal de faible visibilité réel,
  cohérent avec l'inquiétude initiale de l'utilisateur type FOUZ sans photos).

## Problème de correspondance (matching)
Ce rapport ne donne ni vID ni builder → impossible de le nourrir directement
dans `sync-yatco-stats.ts` (qui a besoin de `vesselId` + `builder` pour son
auto-linking). **Solution** : croiser par nom normalisé avec
`yatco_fleet_listings` (déjà peuplée par l'outil #3, 25 vessels avec
vid+vessel_name+builder+loa_text) pour récupérer vID+builder+LOA avant de
nourrir le script existant — pas besoin de dupliquer sa logique de matching.

## Plan résumé
1. Scraper standalone `D:\dev\scrape-mcp\scripts\vessel-stats-scrape.mjs` →
   `vessel-stats.json` (Name/LOA/Impressions/DetailViews/PhoneClicks/
   GalleryViews/Leads brut).
2. Nouveau script `scripts/sync-vessel-visibility-stats.ts` :
   - Match nom normalisé contre `yatco_fleet_listings` → upsert des colonnes
     stats_* directement sur `yatco_fleet_listings` (courant, pas d'historique
     — cohérent avec le modèle déjà utilisé par cette table) → alimente les
     cartes Listings YATCO.
   - Prépare un fichier bridge au format exact attendu par
     `sync-yatco-stats.ts` (vesselId/vesselName/builder/loaMeters/impressions/…)
     pour les vessels matchés → **exécute le script existant tel quel**
     (aucune modification) → termine le chantier original (historique +
     auto-link + UI modale CRM déjà branchée).
3. Migration SQL : `ALTER TABLE yatco_fleet_listings ADD COLUMN stats_*`.
4. UI : `FleetAuditCard.tsx` affiche un bandeau compact (Impressions/Vues/
   Appels/Leads) quand les stats existent.
