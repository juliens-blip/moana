# 03 — Plan (PLAN, apex) : fleet-content-audit

Portée confirmée (01_analysis.md) : ingestion flotte YATCO BOSS → Supabase + nouvelle
section app **« Listings YATCO »** + audit profond par bateau (photos, description,
specs, broker's message, days on market). Pipeline scraping validé en live sur BOLD
(02_scraping_findings.md, BREAKTHROUGH #2).

## 1. Schéma Supabase (nouvelle table, pas de modif de `listings`)

`scripts/yatco-fleet-listings-schema.sql` — même posture RLS que `yatco_listing_stats`
(service_role uniquement, l'app ne parle jamais à Supabase depuis le navigateur) :

```sql
CREATE TABLE public.yatco_fleet_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vid TEXT NOT NULL UNIQUE,              -- vID interne BOSS
  mls_id TEXT,
  vessel_name TEXT NOT NULL,
  status TEXT,                            -- VesselStatusText (Active, Expired...)
  agreement_type TEXT,
  builder TEXT,
  model_year INTEGER,
  asking_price_text TEXT,                 -- brut, devises variables
  loa_text TEXT,
  broker_name TEXT,
  photo_count INTEGER NOT NULL DEFAULT 0,
  has_description BOOLEAN NOT NULL DEFAULT false,
  has_broker_message BOOLEAN NOT NULL DEFAULT false,
  has_hull_deck_specs BOOLEAN NOT NULL DEFAULT false,
  has_engine_specs BOOLEAN NOT NULL DEFAULT false,
  has_dimensions BOOLEAN NOT NULL DEFAULT false,
  has_speed_capacity_specs BOOLEAN NOT NULL DEFAULT false,
  days_on_market INTEGER,
  linked_listing_id UUID REFERENCES public.listings(id),  -- rapprochement best-effort
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- + index sur status, RLS service_role-only comme yatco_listing_stats.
```

Score de complétude = calculé côté UI depuis les 6 booléens/photo_count (pas de colonne
stockée — évite une abstraction inutile).

## 2. Scraping (réutilisable, hors session Claude)

Nouveau script standalone dans `D:\dev\scrape-mcp\scripts\fleet-audit-scrape.mjs`
(Playwright headless, réutilise `auth/yatcoboss.json` comme `login.mjs`) :
- Séquence validée : `/insights/home/` → click `useractionid=756` → click `useractionid=767`
  → attendre `#MyListingsActive_Grid` → lire les 25 lignes (vID/MLS/nom/prix/specs/photo cover)
  → pour chaque vID, cliquer le bouton photo de la ligne → parser le panneau détail
  (photos `large_*`, description, Hull & Deck, Engine, Dimensions, Speed/Capacity/Weight,
  broker's message, days on market) → revenir à la grille (ou relancer la séquence).
- Sortie : `fleet-audit.json` (array de 25 objets) sur disque local.
- **Pourquoi un script à part plutôt que moi qui clique 25 fois par `interact`** : réutilisable
  par l'utilisateur sans Claude (`node scripts/fleet-audit-scrape.mjs`), corrige aussi la
  friction "toujours se reconnecter au MCP" pour ce cas précis — un simple script Node, pas
  un aller-retour MCP. Le run initial (peuplement) est quand même fait une fois via `interact`
  dans cette session pour valider le pipeline avant d'écrire le script (déjà fait sur BOLD).

## 3. Ingestion Supabase

`scripts/sync-yatco-fleet-listings.ts` (calqué sur `sync-yatco-stats.ts`) :
lit `fleet-audit.json`, upsert par `vid` dans `yatco_fleet_listings` via `createAdminClient()`.
Tentative de rapprochement `linked_listing_id` : match sur `listings.yatco_vessel_id = vid`,
sinon fallback nom normalisé (même fonction `normalize()` que `sync-yatco-stats.ts`).
Lancé à la main : `dotenv -e .env.local -- npx tsx scripts/sync-yatco-fleet-listings.ts fleet-audit.json`
(pas d'entrée `package.json` ajoutée — fichier protégé, hors périmètre de cette feature).

## 4. Backend app (lib/)

- `lib/supabase/yatco-fleet.ts` — `getFleetAuditListings()` (lecture seule, admin client,
  tri par `status` puis `vessel_name`).
- `lib/types.ts` — ajout de l'interface `YatcoFleetListing` (append en fin de fichier,
  section dédiée, ne touche pas aux types existants).

## 5. UI — nouvelle section

- Route `app/dashboard/listings-yatco/page.tsx` : composant serveur, fetch direct
  (pas de CRUD → pas besoin d'API route dédiée), `dynamic = 'force-dynamic'`.
- `components/listings/FleetAuditCard.tsx` : carte par vessel — photo count, badges
  manquants (pas de description / pas de photo / specs incomplètes), lien externe vers
  la fiche BOSS (`https://www.yatcoboss.com/search/vesseldetails/viewlisting/?vID=<vid>`),
  indicateur "lié à un listing Moana" ou non.
- Filtre simple : statut (Active par défaut) + toggle "incomplets uniquement" (state client,
  pas de nouvelle abstraction de filtres génériques comme `ListingFilters`).
- Nav : `components/layout/Header.tsx` — ajouter un lien "Listings YATCO" (desktop nav +
  drawer mobile), même pattern que les 3 liens existants (icône `Ship`, état actif via
  `pathname`).

## 6. Fichiers touchés (zones protégées, ordre déjà donné par l'utilisateur)

Nouveaux : `scripts/yatco-fleet-listings-schema.sql`, `scripts/sync-yatco-fleet-listings.ts`,
`lib/supabase/yatco-fleet.ts`, `app/dashboard/listings-yatco/page.tsx`,
`components/listings/FleetAuditCard.tsx`, `D:\dev\scrape-mcp\scripts\fleet-audit-scrape.mjs`.
Modifiés : `lib/types.ts` (ajout interface), `components/layout/Header.tsx` (ajout nav),
`components/listings/index.ts` (export du nouveau composant).
**Non touchés** : `listings` (table existante), tout le périmètre WIP listé dans les
contraintes de sécurité (sanctions, yatco-stats, etc.) — fichiers distincts, pas de croisement.

## 7. Ordre d'exécution (CODE → TEST → DEPLOY)

1. SQL schema (exécuté par l'utilisateur dans Supabase SQL editor, comme `add-yatco-stats.sql`).
2. `fleet-audit-scrape.mjs` (scrape-mcp repo) + run initial → `fleet-audit.json`.
3. `sync-yatco-fleet-listings.ts` + run initial → peuple `yatco_fleet_listings`.
4. `lib/types.ts`, `lib/supabase/yatco-fleet.ts`.
5. UI : page + carte + nav.
6. TEST (agent test-code) : `tsc --noEmit`, lint, build, vérif visuelle `npm run dev`
   sur `/dashboard/listings-yatco`.
7. DEPLOY : app sur Vercel (déploiement normal du repo) — pas de backend AWS pour cette
   feature (lecture Supabase seule, pas de nouveau service).
