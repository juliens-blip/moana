# 01 — Analyse EXPLORE : Carte des mouvements de bateaux (Market Trends, Bloc A)

Phase 1 du tunnel agentique. **Aucun code de feature ici.** Décisions utilisateur déjà actées
(carte REMPLACE le Bloc A ; géocodage ville→repli pays ; source `yatco_market_pulse`).

> ⚠️ **Post-scriptum (implémentation finale)** : après cette analyse, l'utilisateur a demandé une
> fenêtre de **14 jours** (« deux dernières semaines ») au lieu des 7 jours discutés ci-dessous, et
> une cadence de crawl à **48 h** (au lieu de 72 h). Le document ci-dessous reflète l'état de la
> réflexion au moment de l'analyse ; le code livré utilise `MARKET_PULSE_MAP_DAYS = 14`
> (`lib/supabase/market-pulse-map.ts`) et le timer systemd à 48 h. Voir `03_implementation_log.md`.

---

## 1. Contexte & objectif

Remplacer le **Bloc A** de `app/dashboard/market-trends/page.tsx` — les 3 courbes recharts
« État du marché mondial YATCO MLS » (`components/listings/MarketReviewCharts.tsx`) — par une
**carte du monde interactive** montrant les **mouvements de bateaux des 7 derniers jours** :
- `feed_type = 'new'` → nouveaux listings,
- `feed_type = 'sold'` → ventes,
- (`feed_type = 'modified'` : hors périmètre carte, reste agrégé dans le Bloc B).

Le **Bloc B** (`MarketPulseTrendChart`, « Tendance récente ») reste **inchangé**.

---

## 2. Fichiers concernés (rôle + modification prévue)

| Fichier | Rôle actuel | Modif prévue (phase CODE) |
|---|---|---|
| `app/dashboard/market-trends/page.tsx` | Server component. `Promise.allSettled([getLatestMarketReview(), getMarketPulseTrendEntries()])` → rend `<MarketReviewCharts>` (bloc A) + `<MarketPulseTrendChart>` (bloc B). `export const dynamic = 'force-dynamic'`. | **Retirer** l'appel `getLatestMarketReview()` et la `<section aria-labelledby="market-review-heading">` (l.53–74). **Ajouter** un appel serveur `getRecentMarketPulseMovements({ days: 7 })` et rendre `<MarketMovementsMap>`. Garder le bloc B intact. |
| `components/listings/MarketReviewCharts.tsx` | Bloc A (3 `LineChart`). | **Non rendu** après la modif. Le fichier **peut rester** dans le repo (décision utilisateur) ; retirer aussi son ré-export de `index.ts` est optionnel (le laisser ne coûte rien, l'enlever évite un import mort — à trancher au PLAN). |
| `components/listings/MarketPulseTrendChart.tsx` | Bloc B. | **Aucune modif.** |
| `components/listings/index.ts` | Barrel d'export (`MarketReviewCharts` l.11, `MarketPulseTrendChart` l.12). | **Ajouter** `export { MarketMovementsMap } from './MarketMovementsMap';`. |
| `lib/supabase/market-review.ts` | Lectures serveur admin (`createAdminClient`). Contient `getMarketPulseTrendEntries` (l.122) — pattern exact à copier : `.from('yatco_market_pulse').select('*').gte('scraped_at', since).order(...).limit(...)`. | **Ajouter** `getRecentMarketPulseMovements({ days })` : mêmes bornes/clamp, filtre `feed_type in ('new','sold')`, dédup `vid+feed_type` sur la fenêtre, projette les champs carte. (Alternative : nouveau `lib/supabase/market-pulse-map.ts` — à trancher au PLAN ; `market-review.ts` est le plus cohérent car même table.) |
| `lib/types.ts` | `YatcoMarketPulseEntry` (l.94–114). | **Ajouter** un type projeté léger, ex. `MarketMovementPoint { vid; feed_type: 'new'|'sold'; vessel_name; builder?; loa_text?; price_text?; location?; lat; lon; resolved: 'city'|'country'|'none' }`. |
| **NOUVEAU** `components/listings/MarketMovementsMap.tsx` | — | Composant `'use client'` : carte SVG + points, légende new/sold, compteur « N non localisés », tooltip vessel. |
| **NOUVEAU** `lib/geo/*` (ou `components/listings/geo/`) | — | Géocodeur offline + datasets JSON embarqués (voir §4). Hors `lib/supabase`. |

### Pattern architectural confirmé (à respecter à l'identique)
`page.tsx` (server, `force-dynamic`) → `lib/supabase/*` (`createAdminClient`, service_role, RLS server-only)
→ props passées à un composant **`'use client'`** qui fait le rendu (recharts aujourd'hui, SVG carto demain).
Le navigateur **ne requête jamais** Supabase. Le géocodage doit donc être fait **côté serveur ou à partir
d'un dataset statique importé** — jamais via une API réseau runtime.

`admin.ts` : `createAdminClient()` lit `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.

---

## 3. Données & scraping — le scraper suffit, aucune retouche nécessaire

**Confirmé : `yatco_market_pulse.location` suffit pour géocoder. Pas besoin de toucher au scraper**
(`ops/yatco-automation/scrapers/market-pulse-scrape.mjs`, `fields['VESSEL LOCATION'] → location`).

### Réalité de la base (probe live, 63 lignes)
- **Total : 63 lignes**, sur **2 jours distincts** (`2026-07-21`, `2026-07-22`).
- `feed_type` : `new` 24 · `modified` 24 · `sold` 15 → **39 événements new+sold** avant dédup.
- **Dédup `vid+feed_type` sur 7 j : 40 lignes uniques** (toutes tables confondues) ; côté carte on ne garde que new+sold.
- **35 valeurs `location` distinctes**, toutes non nulles.

### Le format de `location` est PROPRE et structuré (≠ des exemples du prompt)
Contrairement au texte libre des `listings` cité dans la mission (« Golf-juan », « Grèce »…), le champ
`yatco_market_pulse.location` observé suit **systématiquement** `"<Ville>, <Région>, <Pays>"` :

```
Genoa, Liguria, Italy           Antibes, Provence-Alpes-Cote-d'Azur, France
Bodrum, Mugla, Turkey           Cruising Budva, Budva Municipality, Montenegro
Fort Lauderdale, Florida, United States   Nassau, New Providence, The Bahamas
Gold Coast, Queensland, Australia         Dubai, Dubai, United Arab Emirates
Phuket, Phuket, Thailand        Cruising Palma, Balearic Islands, Spain     ...
```

Conséquences pour le géocodage :
- **Le PAYS est le dernier token après virgule → fiable à ~100 %.** Le repli pays garantit un placement
  pour **100 % des lignes actuelles** (0 non localisé aujourd'hui). Le compteur « N non localisés » ne
  vaudra >0 que si `location` est `null` ou pays inconnu (aucun cas en base).
- **La VILLE est le 1er token** (retirer le préfixe `"Cruising "` présent sur ~5 valeurs). C'est un mot
  simple, sans accent problématique une fois `normalize()` appliqué.
- Pays présents : Italy, France, Turkey, Montenegro, Germany, Greece, Australia, The Bahamas,
  United States, United Arab Emirates, Spain, Thailand (12). Villes distinctes : ~30.

Les noms de pays sont déjà en **anglais** dans `market_pulse` (pas « Grèce »/« Turquie »). `COUNTRY_ALIASES`
(FR→EN) de `scripts/sync-yatco-stats.ts:102` reste utile **par sécurité** mais peu sollicité ici ;
`normalize()` (`sync-yatco-stats.ts:48`, NFD + strip accents + lowercase) est directement réutilisable.
Attention à normaliser `"The Bahamas"` → `bahamas` et `"United States"`, `"United Arab Emirates"`.

**Couverture géocodage réelle attendue** : **35/35 localisations résolues au moins au niveau pays** ;
niveau ville pour toutes celles présentes dans le dataset villes embarqué (voir §4, seed = les ~30 villes
observées → 100 % précis dès le seed). Robustesse future : toute nouvelle ville hors seed retombe sur le
pays sans casser l'affichage.

---

## 4. Recherche externe (Context7) — carto & géocodage offline

### 4.1 Comparatif librairies carto (Next 14 App Router, React 18.2, rendu client, self-contained, 0 réseau runtime)

| Option | Version | Rendu | Réseau runtime | React 18 | Bundle (approx.) | Verdict |
|---|---|---|---|---|---|---|
| **react-simple-maps** | `^3.0.0` | **SVG** (d3-geo + topojson-client inclus) | **Aucun** si topojson **importé en local** (le prop `geography` accepte une URL **ou un objet** geojson/topojson) | **Oui** — peerDeps `^16.8 \|\| 17.x \|\| 18.x` (**pas 19**) ✔ | lib ~ petite + d3-geo/topojson-client ; **world-atlas `countries-110m` ≈ 100 KB** vendored | **RECOMMANDÉ** |
| leaflet / react-leaflet | leaflet 1.9 / react-leaflet 4.x | Canvas/DOM + **tuiles raster** | **OUI — tuiles servies en ligne** (OSM/Mapbox…) ⇒ **viole « self-contained / 0 réseau »** et/ou exige une **clé** | react-leaflet 4 = React 18 ok | + CSS externe + assets marqueurs | **Rejeté** (tuiles online, clé, CSP artefact) |
| SVG / d3-geo maison | d3-geo `^3`, topojson-client `^3` | SVG | Aucun (topojson local) | Agnostique | ~ équivalent à rsm (mêmes deps d3-geo/topojson) mais **plus de code à écrire** (projection, zoom, hit-testing) | Repli si on veut 0 dépendance déclarative, sinon rsm fait ça pour nous |

Notes clés (docs Context7 `/zcreativelabs/react-simple-maps`) :
- Gère le SSR : `useGeographies` fait `if (typeof window === 'undefined') return` → **impératif de rendre
  le composant en `'use client'`** (comme les charts actuels). OK avec notre pattern.
- Le monde vient d'un **topojson** que l'on **vendore dans le repo** (`world-atlas` `countries-110m.json`,
  ~100 KB) et qu'on importe en objet → **zéro fetch réseau**, compatible CSP stricte.
- Composants utiles : `ComposableMap`, `Geographies`/`Geography` (fond pays), `Marker` (points new/sold),
  `ZoomableGroup` (zoom/pan optionnel).

### 4.2 Géocodage offline (sans API runtime, sans clé)

Le format `"Ville, Région, Pays"` rend le problème **simple**. Approche recommandée = **deux datasets JSON
embarqués dans le repo** + parsing maison, **aucune dépendance npm** :

1. **`country-centroids.json`** (~200 pays → `{ lat, lon }`, domaine public, ~10–15 KB). Repli garanti
   par le dernier token de `location`. Clé = pays normalisé (`normalize()` + `COUNTRY_ALIASES`).
2. **`city-coords.json`** — table **curée** ville→`{ lat, lon }`, **seedée avec les ~30 villes réellement
   observées** (Genoa, Antibes, Bodrum, Budva, Cannes, Viareggio, Fort Lauderdale, Nassau, Gold Coast,
   Dubai, Phuket, Palma…). Quelques KB. Extensible à la main quand de nouvelles villes apparaissent.

Pourquoi **pas** un package dataset complet (`all-the-cities`/`cities500` GeoNames ≈ 10 MB, ou
`/dr5hn/countries-states-cities-database` ≈ 40 MB avec lat/lon ville) : **trop lourd à bundler** pour un
gain nul (le flux ne contient qu'une poignée de hubs yachting). Le seed curé + repli pays couvre 100 % du
réel tout en gardant le bundle < ~120 KB total (topojson + géo).

**Algo géocodeur (pur, testable, côté serveur dans la fonction de lecture)** :
```
parse(location):
  toks = location.split(',').map(trim)         // ["Genoa","Liguria","Italy"]
  country = normalize(alias(toks[last]))
  city    = normalize(strip "Cruising " from toks[0])
  if city in CITY_COORDS      -> { ...coords, resolved:'city' }
  else if country in COUNTRY_CENTROIDS -> { ...centroid, resolved:'country' }
  else                        -> { resolved:'none' }   // -> compteur "N non localisés"
```
Réutiliser `normalize()` et `COUNTRY_ALIASES` (`scripts/sync-yatco-stats.ts:48,102`) — les recopier dans
un helper `lib/geo/` (ne pas importer depuis `scripts/`).

### 4.3 Recommandation ferme

- **Carto : `react-simple-maps@^3` + `world-atlas` topojson `countries-110m` vendored en local.** SVG,
  0 réseau runtime, React 18 supporté, ~100 KB, rendu déclaratif → le moins de code. `'use client'`.
- **Géocodage : datasets JSON embarqués (`country-centroids.json` + `city-coords.json` seedé) + parseur
  maison.** Aucune dépendance npm, aucune clé, repli pays = couverture 100 % du réel.

**Nouvelles dépendances à valider (zone protégée `package.json`, décision utilisateur au PLAN)** :
`react-simple-maps` (runtime). `world-atlas` peut être une **devDependency** (on ne garde que le JSON
vendored) ou le JSON copié à la main sans dépendance. `@types/react-simple-maps` en devDep (TS strict).
d3-geo/topojson-client arrivent en transitif via react-simple-maps.

---

## 5. Recommandation d'implémentation (esquisse pour le PLAN)

1. `lib/supabase/market-review.ts` : `getRecentMarketPulseMovements({ days=7 })` — clamp identique à
   l'existant, `.in('feed_type', ['new','sold'])`, `.gte('scraped_at', since)`, **dédup `vid+feed_type`**
   (garder l'occurrence la plus récente), retourne un tableau projeté.
2. `lib/geo/geocode.ts` + `lib/geo/country-centroids.json` + `lib/geo/city-coords.json` : géocodeur pur.
   Le géocodage se fait **côté serveur** (dans la fonction de lecture) pour envoyer au client des points
   déjà `{lat, lon, resolved}` — le client ne charge pas les datasets géo, seulement le topojson carte.
3. `components/listings/MarketMovementsMap.tsx` (`'use client'`) : `ComposableMap`/`Geographies` (fond),
   `Marker` par point (couleur : new = `#2a78d6` / sky, sold = `#10b981` — cohérent avec les couleurs
   du Bloc B), tooltip (vessel_name, builder, loa_text, price_text, location), **badge « N non localisés »**,
   états vide/erreur alignés sur `StatusMessage`/`MarketPulseTrendChart`. Superposition des points au même
   lieu (plusieurs bateaux même ville) : léger jitter ou cluster/compteur.
4. `page.tsx` : retirer bloc A + son `getLatestMarketReview`, ajouter la lecture mouvements + `<MarketMovementsMap>`.
5. Titre section ajusté (ex. « Mouvements du marché — 7 derniers jours »).

---

## 6. Contraintes & risques

- **Zones protégées** (`app/`, `components/`, `lib/`, `package.json`) : toute modif = phase CODE explicite ;
  **toute nouvelle dépendance** (`react-simple-maps`, types, world-atlas) = **décision utilisateur au PLAN**.
- **React 18.2 (pas 19)** : react-simple-maps `^3` supporte 16.8/17/18, **pas** 19 → parfait ici, mais
  **verrouiller** et ne pas laisser un `^4`/futur tirer React 19.
- **`'use client'` obligatoire** (SSR early-return de `useGeographies`) — cohérent avec le pattern charts.
- **Taille bundle** : topojson `countries-110m` ~100 KB + géo JSON quelques KB. Rester sur la résolution
  110m (pas 50m/10m) ; datasets géo curés, pas un dump GeoNames.
- **Event-stream** : **dédupliquer `vid+feed_type`** sur la fenêtre 7 j (sinon un bateau vu à 2 runs =
  2 points). Probe : 63 → 40 après dédup.
- **Localisations non résolues** : afficher un compteur « N non localisés » (robustesse ; 0 attendu
  aujourd'hui car pays toujours présent). Gérer `location = null`.
- **CSP / self-contained** : aucun fetch de tuiles/topojson distant — tout vendored. (Écarte leaflet.)
- **Fraîcheur données** : refresh systemd 72 h + seulement 2 jours en base → sur 7 j la carte affichera
  peu de points certains jours ; prévoir un état « peu/pas de mouvements ».
- Ne pas importer de code depuis `scripts/` vers `lib/`/`components/` (recopier `normalize`/aliases).

---

## 7. Questions ouvertes pour la phase PLAN

1. **Emplacement de la fonction de lecture** : étendre `lib/supabase/market-review.ts` (même table, cohérent)
   ou créer `lib/supabase/market-pulse-map.ts` ?
2. **`MarketReviewCharts` / son export `index.ts:11`** : le laisser en place (mort mais inoffensif) ou
   retirer l'export pour éviter l'import mort ? (Le fichier composant reste, per décision utilisateur.)
3. **Précision par défaut** : dot par bateau avec jitter, ou agrégation par ville (bulle taille = nb de
   bateaux) ? Impacte le design du composant.
4. **Modified** : vraiment exclu de la carte (only new+sold) ? Confirmé par la mission — à acter.
5. **Interactivité** : zoom/pan (`ZoomableGroup`) souhaité ou carte statique lisible ? (bundle/UX).
6. **`world-atlas`** : dépendance devDep vs JSON copié à la main sans dépendance ?
