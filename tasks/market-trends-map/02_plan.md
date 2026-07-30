# 02 — PLAN (APEX) : Carte des mouvements de bateaux (Market Trends, remplace Bloc A)

Phase 2 du tunnel. **Plan granulaire AVANT tout code.** Entrée = `01_analysis.md` (EXPLORE).
Décisions utilisateur figées (voir prompt) : intégrées, non rediscutées.
Chaque étape CODE = un livrable qui compile ; l'ordre garantit que chaque commit passe `type-check` + `build`.

> ⚠️ **Post-scriptum (implémentation finale)** : fenêtre passée à **14 jours** et crawl à **48 h**
> sur demande utilisateur postérieure à ce plan (qui documente encore 7 jours ci-dessous). Code
> livré : `MARKET_PULSE_MAP_DAYS = 14`. Voir `03_implementation_log.md` pour le détail du cycle réel.

---

## 1. Objectif

Remplacer le **Bloc A** de `app/dashboard/market-trends/page.tsx:53-74` (les 3 courbes recharts
`MarketReviewCharts`) par une **carte du monde interactive** (`react-simple-maps`, SVG, 0 réseau runtime)
des **mouvements de bateaux des 7 derniers jours** issus de `yatco_market_pulse` :
- **1 bulle par ville**, rayon ∝ nombre de mouvements, **couleur = feed_type** (new = sky/`#2a78d6`,
  sold = emerald/`#10b981`) ;
- **clic sur bulle → liste des bateaux** du lieu (nom, builder, LOA, prix, badge new/sold) ;
- **zoom + pan** (`ZoomableGroup`) ; compteur « N mouvements · M lieux [· K non localisés] ».

Fenêtre = 7 j ; **dédup `vid+feed_type`** sur la fenêtre ; seuls `new` et `sold` (jamais `modified`).
Le **Bloc B** (`MarketPulseTrendChart`, `page.tsx:76-89`) reste **strictement intact**.

---

## 2. Décisions d'architecture (TRANCHÉES)

| Question ouverte (01_analysis §7) | Décision |
|---|---|
| Emplacement lecture serveur | **Nouveau fichier `lib/supabase/market-pulse-map.ts`** exportant `getRecentMarketPulseMovements({ days })`. Isole la logique carte (dédup + géocodage + agrégation) sans alourdir `market-review.ts`. Réutilise le pattern `createAdminClient` + `.gte('scraped_at', since)` de `lib/supabase/market-review.ts:122-143` (clamp `clampInteger` + `getTrendStartDate` recopiés localement — fonctions non exportées là-bas). |
| Export mort `MarketReviewCharts` (`index.ts:11`) | **Retirer** l'export de `components/listings/index.ts:11` (plus référencé après le retrait du Bloc A → évite un import mort). **Garder** le fichier `MarketReviewCharts.tsx` (décision utilisateur : ne pas supprimer de code protégé). |
| Précision par défaut | **Agrégation par ville** : 1 bulle/ville, rayon ∝ total mouvements. (Pas de jitter par bateau.) |
| `modified` | **Exclu** de la carte (`.in('feed_type', ['new','sold'])`). |
| Interactivité | **Zoom + pan** via `ZoomableGroup`. |
| Atlas topojson | **`lib/geo/atlas/countries-110m.json`** (colocalisé avec les autres assets géo), **import statique** dans le composant client. Justification : tout ce qui est « données géo » vit sous `lib/geo/`; le composant importe l'objet → 0 fetch, CSP-safe. |
| `world-atlas` dépendance | **Aucune dép** (runtime ni devDep). JSON copié à la main (voir Étape 2). |

**Split serveur / client** (respecte le pattern `01_analysis §2`) :
- **Serveur** (`lib/supabase/market-pulse-map.ts` + `lib/geo/geocode.ts`) : lit Supabase, dédup, géocode
  via `country-centroids.json` + `city-coords.json`, **agrège par lieu**, renvoie des points déjà
  `{lat, lon, resolved, ...}`. Le client ne charge JAMAIS les datasets géo ni Supabase.
- **Client** (`components/listings/MarketMovementsMap.tsx`, `'use client'`) : reçoit le résultat en props,
  importe **uniquement** l'atlas topojson pour le fond de carte, rend bulles + interactions.

---

## 3. Périmètre & propriété des fichiers

| Chemin | Action | Rôle |
|---|---|---|
| `package.json` | **modify** | + `react-simple-maps` (dependencies), `@types/react-simple-maps` (devDependencies). |
| `lib/geo/atlas/countries-110m.json` | **create** | Atlas monde topojson vendored (~100 KB), import statique. |
| `lib/geo/country-centroids.json` | **create** | ~200 pays → `{lat, lon}` (clé = pays normalisé). Repli garanti. |
| `lib/geo/city-coords.json` | **create** | Villes curées → `{lat, lon}` (seed = ~30 villes observées, §3 de l'analyse). |
| `lib/geo/geocode.ts` | **create** | `normalize` + `COUNTRY_ALIASES` recopiés de `scripts/sync-yatco-stats.ts:48,102` + `geocodeLocation(raw)`. Pur, testable. |
| `lib/supabase/market-pulse-map.ts` | **create** | `getRecentMarketPulseMovements({ days })` : lecture admin + dédup + géocodage + agrégation par lieu. |
| `lib/types.ts` | **modify** (additif) | + `MarketMovementVessel`, `MarketMovementLocation`, `MarketMovementsResult`. |
| `components/listings/MarketMovementsMap.tsx` | **create** | `'use client'` — carte SVG, bulles new/sold, panneau liste bateaux au clic, zoom/pan, compteur. |
| `components/listings/index.ts` | **modify** | + export `MarketMovementsMap` ; **−** export `MarketReviewCharts` (l.11). |
| `app/dashboard/market-trends/page.tsx` | **modify** | Retire Bloc A + `getLatestMarketReview`, ajoute lecture mouvements + `<MarketMovementsMap>`. Bloc B intact. |
| `tests/geocode.test.ts` | **create** | Tests unitaires `geocodeLocation` (node:test). |
| `tests/market-pulse-map-dedup.test.ts` | **create** | Test unitaire de la dédup + agrégation (fonction pure extraite). |
| `components/listings/MarketReviewCharts.tsx` | **inchangé** | Conservé, non rendu, non exporté. |
| `components/listings/MarketPulseTrendChart.tsx` | **inchangé** | Bloc B protégé. |

> Zones protégées touchées (`package.json`, `app/`, `components/`, `lib/`) : autorisées ici car actées
> par l'utilisateur. Ne stager QUE ces fichiers (respecter les WIP existants — CLAUDE.md « Zones protégées »).

---

## 4. Étapes CODE (numérotées, chaque étape compile)

### Étape 1 — Dépendances
- `npm install react-simple-maps@^3.0.0`
- `npm install -D @types/react-simple-maps@^3.0.0`
- Vérifier que `react` reste **18.2.0** (react-simple-maps@3 peerDep `16.8||17||18`, **jamais** 19 —
  `01_analysis §6`). `git diff package.json package-lock.json` pour contrôle.
- **Compile ?** Oui (aucun import encore). `npm run type-check` doit rester vert.

### Étape 2 — Vendoring de l'atlas topojson (aucune dépendance)
- Récupérer `countries-110m.json` du package npm `world-atlas` **sans l'ajouter aux deps** :
  `npm pack world-atlas@2` dans un dossier temp (scratchpad), extraire `world-atlas/countries-110m.json`,
  le copier vers `lib/geo/atlas/countries-110m.json`, puis supprimer le tarball. (Alt : `curl -o ... https://unpkg.com/world-atlas@2/countries-110m.json` si réseau dispo.)
- Vérifier : fichier ~100 KB, contient `{"type":"Topology","objects":{"countries":...}}`.
- Créer `lib/geo/atlas/countries-110m.d.ts` si nécessaire (déclaration `declare module '*.json'` inutile car
  `resolveJsonModule:true` dans `tsconfig.json:12` → import direct typé). Aucun `.d.ts` à ajouter a priori.
- **Compile ?** Oui (JSON non encore importé).

### Étape 3 — Datasets géo
- `lib/geo/country-centroids.json` : objet `{ "<pays normalisé>": [lon, lat] }` (ordre `[lon,lat]` =
  convention react-simple-maps/GeoJSON ; documenter le choix en tête via une clé `_format` ou un commentaire
  dans `geocode.ts`). Au minimum les 12 pays observés (`01_analysis §3`) + une base ~200 pays domaine public.
  Clés déjà passées à `normalize()` (ex. `"united states"`, `"united arab emirates"`, `"bahamas"`).
- `lib/geo/city-coords.json` : `{ "<ville normalisée>": [lon, lat] }`, seed = les ~30 villes observées
  (Genoa, Antibes, Bodrum, Budva, Cannes, Viareggio, Fort Lauderdale, Nassau, Gold Coast, Dubai, Phuket,
  Palma…). Clés normalisées (préfixe « Cruising » déjà retiré côté parseur, pas dans la clé).
- **Compile ?** Oui.

### Étape 4 — `lib/geo/geocode.ts` (pur, testable)
- **Recopier** (ne pas importer depuis `scripts/` — exclu du build, `tsconfig.json:26`) :
  - `normalize()` de `scripts/sync-yatco-stats.ts:48-55` (NFD + strip accents + lowercase + `[^a-z0-9]→ ' '`).
  - `COUNTRY_ALIASES` de `scripts/sync-yatco-stats.ts:102-112`.
- Importer les 2 datasets JSON (`country-centroids.json`, `city-coords.json`) typés
  `Record<string, [number, number]>`.
- Exporter :
  ```ts
  export type GeocodeResult =
    | { lat: number; lon: number; resolved: 'city' | 'country'; city?: string; country: string }
    | { lat: null; lon: null; resolved: 'none'; city?: string; country?: string };

  export function geocodeLocation(raw: string | null | undefined): GeocodeResult;
  ```
  Algo (`01_analysis §4.2`) :
  1. `null`/vide → `{resolved:'none'}`.
  2. `toks = raw.split(',').map(trim)` ; `countryRaw = toks[toks.length-1]` ; `cityRaw = toks[0]` moins
     préfixe `/^cruising\s+/i`.
  3. `countryKey = COUNTRY_ALIASES[normalize(countryRaw)] ?? normalize(countryRaw)` ;
     `cityKey = normalize(cityCleaned)`.
  4. `if (CITY_COORDS[cityKey])` → `{lat, lon, resolved:'city', city, country}`.
  5. `else if (COUNTRY_CENTROIDS[countryKey])` → `{..., resolved:'country', country}`.
  6. `else` → `{resolved:'none'}`.
  (Convertir `[lon,lat]` du dataset en `{lat, lon}` à la sortie.)
- **Compile ?** Oui (module pur, aucun import app).

### Étape 5 — Types (`lib/types.ts`, additif, après l.114)
```ts
export interface MarketMovementVessel {
  vid: string;
  feed_type: 'new' | 'sold';
  vessel_name: string;
  builder?: string;
  loa_text?: string;
  price_text?: string;
  sold_date?: string;
}
export interface MarketMovementLocation {
  key: string;            // clé d'agrégation (ville|pays normalisé)
  lat: number;
  lon: number;
  resolved: 'city' | 'country';
  label: string;          // libellé affiché (ville, pays ou pays seul)
  country: string;
  newCount: number;
  soldCount: number;
  total: number;
  vessels: MarketMovementVessel[];
}
export interface MarketMovementsResult {
  locations: MarketMovementLocation[];
  totalMovements: number;
  locatedPlaces: number;
  unlocatedCount: number;
  windowDays: number;
}
```
- Ne rien modifier au-dessus. **Compile ?** Oui.

### Étape 6 — `lib/supabase/market-pulse-map.ts` (lecture serveur)
- Constantes : `MARKET_PULSE_MAP_DAYS = 7`, `MAX_DAYS = 31`, `MAX_ROWS = 5_000`.
- Recopier `clampInteger` + `getTrendStartDate` (calqués sur `market-review.ts:103-116`, non exportés là-bas).
- **Fonction pure exportée pour test** :
  `export function buildMovementsResult(rows: YatcoMarketPulseEntry[], windowDays: number): MarketMovementsResult`
  1. Filtrer `feed_type ∈ {new, sold}` (garde-fou même si la requête filtre déjà).
  2. **Dédup `vid+feed_type`** : Map clé `` `${vid}::${feed_type}` `` → garder la ligne au `scraped_at`
     le plus récent (rows déjà triés desc → premier vu gagne).
  3. Pour chaque ligne dédupliquée : `geocodeLocation(location)`.
     - `resolved==='none'` → `unlocatedCount++`.
     - sinon agréger dans une Map par clé de lieu (`city:<cityKey>` ou `country:<countryKey>`),
       incrémenter `newCount`/`soldCount`, pousser un `MarketMovementVessel` (city label = 1er token nettoyé).
  4. `total = newCount + soldCount`, trier `locations` par `total` desc.
  5. Retourner `{locations, totalMovements, locatedPlaces:locations.length, unlocatedCount, windowDays}`.
- **Fonction serveur exportée** :
  `export async function getRecentMarketPulseMovements({ days }: { days?: number } = {}): Promise<MarketMovementsResult>`
  → clamp `days`, `since = getTrendStartDate(days)`, `createAdminClient()`,
  `.from('yatco_market_pulse').select('*').in('feed_type',['new','sold']).gte('scraped_at', since)
  .order('scraped_at',{ascending:false}).limit(MAX_ROWS)` (pattern `market-review.ts:130-135`),
  gestion d'erreur identique (`console.error` + `throw`), puis `return buildMovementsResult(data||[], days)`.
- **Compile ?** Oui (types + geocode existent). Type-check vert.

### Étape 7 — Composant `components/listings/MarketMovementsMap.tsx` (`'use client'`)
- Props : `{ data: MarketMovementsResult; error?: boolean }`.
- Imports : `react`, `react-simple-maps` (`ComposableMap`, `Geographies`, `Geography`, `Marker`,
  `ZoomableGroup`), atlas `import geoTopo from '@/lib/geo/atlas/countries-110m.json'`.
- Constantes couleur : `NEW='#2a78d6'`, `SOLD='#10b981'` (cohérence `MarketPulseTrendChart.tsx:81,83`
  + `MarketPulseCard.tsx:14,16` sky/emerald). Couleur bulle : dominante = feed majoritaire du lieu,
  ou bulle bicolore (halo new + cœur sold) si mixte — implémentation simple : couleur = feed majoritaire,
  légende explicite « bleu = nouveaux, vert = vendus ».
- Rayon : `r = clamp(baseMin, baseMin + k*sqrt(total), rMax)` (aire ∝ total).
- Rendu :
  - Header : titre « Mouvements du marché — {windowDays} derniers jours » + compteur
    `« {totalMovements} mouvements · {locatedPlaces} lieux[ · {unlocatedCount} non localisés] »`.
  - `error` → bloc `role="alert"` rouge (style `page.tsx:16-21` / `MarketPulseTrendChart.tsx:62-65`).
  - `totalMovements===0` → état vide « Aucun mouvement sur la fenêtre » (style `MarketPulseTrendChart:66-71`).
  - Sinon `ComposableMap` (projection `geoMercator` ou defaut `geoEqualEarth`) dans un conteneur responsive
    (`w-full`, hauteur fixe ~`h-[420px]`), `<ZoomableGroup>` (pan/zoom), `<Geographies geography={geoTopo}>`
    fond pays gris clair, puis `data.locations.map` → `<Marker coordinates={[lon,lat]}>` cercle cliquable
    (`onClick` → `setSelected(location)`), `aria-label`.
  - Panneau latéral/inférieur : si `selected`, liste `selected.vessels` (nom, builder, LOA, prix, badge
    new/sold réutilisant la charte `FEED_BADGE` de `MarketPulseCard.tsx:13-17`) + bouton fermer.
- **SSR** : `'use client'` obligatoire (`useGeographies` early-return SSR, `01_analysis §4.1`).
- **Compile ?** Oui. `type-check` + `build` sur ce composant.

### Étape 8 — Barrel `components/listings/index.ts`
- Ajouter `export { MarketMovementsMap } from './MarketMovementsMap';`.
- **Retirer** `export { MarketReviewCharts } from './MarketReviewCharts';` (l.11).
- **Compile ?** Oui **seulement après l'Étape 9** (page.tsx importe encore `MarketReviewCharts`).
  → **Faire l'Étape 9 dans le même commit** que l'Étape 8 pour ne pas casser le build.

### Étape 9 — Branchement page `app/dashboard/market-trends/page.tsx`
- Imports : remplacer `MarketReviewCharts` (l.3) par `MarketMovementsMap` ; retirer `getLatestMarketReview`,
  ajouter `getRecentMarketPulseMovements` depuis `@/lib/supabase/market-pulse-map` ; retirer l'import de type
  `YatcoMarketReviewSnapshot` (l.2) devenu inutile ; ajouter le type `MarketMovementsResult`.
- `Promise.allSettled` (l.33-36) : remplacer `getLatestMarketReview()` par
  `getRecentMarketPulseMovements({ days: 7 })`. Garder `getMarketPulseTrendEntries(...)` intact.
- Remplacer la `<section aria-labelledby="market-review-heading">` (l.53-74) par
  `<section aria-labelledby="market-movements-heading">` contenant `<MarketMovementsMap data={movements} error={movementsFailed} />`.
- Ajuster le paragraphe d'intro (l.47-50) si besoin (mentionner la carte plutôt que « état YATCO MLS par taille »).
- **Ne pas toucher** `<section aria-labelledby="market-pulse-trend-heading">` (l.76-89, Bloc B).
- **Compile ?** Oui (avec Étape 8). `build` doit rendre la route `/dashboard/market-trends`.

### Étape 10 — Tests unitaires (fichiers)
- `tests/geocode.test.ts` (node:test, cf `tests/kyc-deterministic.test.ts:1-8`) — voir Étape TEST 4.
- `tests/market-pulse-map-dedup.test.ts` — voir Étape TEST 5.
- **Compile ?** Oui (inclus dans `**/*.ts` du `tsconfig`).

---

## 5. Étapes TEST (obligatoires — plusieurs)

1. **Lint** : `npm run lint` → 0 erreur sur les fichiers créés/modifiés.
2. **Type-check** : `npm run type-check` (`tsc --noEmit`) → vert. Vérifie surtout l'import JSON typé
   (`resolveJsonModule`) et les types `MarketMovements*`.
3. **Build** : `npm run build` → route `/dashboard/market-trends` bundlée sans erreur. Surveiller un éventuel
   souci de transpilation ESM de `react-simple-maps`/`d3-geo` (voir Risques). Contrôler la taille du chunk
   client (atlas ~100 KB attendu).
4. **Unitaire géocodage** (`tests/geocode.test.ts`, `npx tsx --test tests/geocode.test.ts`) — cas :
   - **ville résolue** : `"Genoa, Liguria, Italy"` → `resolved:'city'`, coords = seed Genoa.
   - **repli pays** : `"Nowhereville, X, Italy"` (ville hors seed) → `resolved:'country'`, coords Italy.
   - **préfixe Cruising** : `"Cruising Palma, Balearic Islands, Spain"` → `resolved:'city'` Palma
     (préfixe retiré).
   - **alias/normalisation pays** : `"Somewhere, X, The Bahamas"` → `resolved:'country'` bahamas ;
     `"X, Y, United Arab Emirates"` → pays résolu.
   - **non résolu** : `null` et `"Atlantis, Deep, Neverland"` → `resolved:'none'`.
5. **Unitaire dédup + agrégation** (`tests/market-pulse-map-dedup.test.ts`, via `buildMovementsResult`) :
   - 2 lignes `même vid + feed_type='new'` à `scraped_at` différents → **1 mouvement** (garde le plus récent).
   - même `vid` mais `new` et `sold` → **2 mouvements** (clé inclut feed_type).
   - `feed_type='modified'` ignoré.
   - 3 bateaux même ville → 1 `location`, `total=3`, `vessels.length=3`, `newCount/soldCount` corrects.
   - `location=null` → `unlocatedCount=1`, pas dans `locations`.
6. **Contrôle visuel** (`npm run dev`, `/dashboard/market-trends`) :
   - **0 mouvement** (fenêtre vide) → état vide propre, pas de crash, Bloc B toujours présent.
   - **quelques mouvements** (données réelles ~40 dédup) → bulles placées, tailles cohérentes, couleurs
     new/sold, **clic bulle → liste bateaux**, zoom/pan OK, compteur exact.
   - **Bloc B inchangé** (courbe « Tendance récente » identique visuellement).

> Note runner : les tests suivent la convention repo `node:test` + `node:assert/strict`
> (`tests/kyc-deterministic.test.ts`). Aucune nouvelle dép de test ; exécution via `npx tsx --test <file>`.

---

## 6. Risques & rollback

| Risque | Probabilité | Mitigation / Rollback |
|---|---|---|
| `react-simple-maps`/`d3-geo` (ESM) non transpilé par Next 14 au build | Moyenne | Si `build` échoue sur un import ESM : ajouter `transpilePackages: ['react-simple-maps','d3-geo','d3-scale','d3-array']` dans `next.config.js:34` (zone build — modif ciblée, à documenter). |
| `react-simple-maps@3` tire React 19 en transitif | Faible | Version **pinnée `^3.0.0`** (peer `16.8||17||18`). Vérifier `package-lock.json` : `react` reste `18.2.0`. Rollback : `npm remove react-simple-maps @types/react-simple-maps`. |
| Atlas JSON introuvable/mauvais format | Faible | Étape 2 vérifie taille + structure (`objects.countries`). Source alt unpkg. |
| Import JSON 100 KB alourdit le chunk client | Faible | 110m seulement (pas 50m/10m). Atlas importé **uniquement** dans le composant carte (code-splité par route). |
| Ville hors seed mal placée | Faible | Repli pays garanti (0 non localisé attendu, `01_analysis §3`). Ajout manuel dans `city-coords.json` si besoin. |
| Ordre Étape 8/9 casse le build (import mort `MarketReviewCharts`) | Certain si mal ordonné | Étapes 8 **et** 9 dans le **même commit**. |
| Régression Bloc B | Faible | `page.tsx:76-89` non touché ; contrôle visuel dédié (TEST 6). |

**Rollback global** : `git restore` des 3 fichiers protégés modifiés (`package.json`, `page.tsx`,
`index.ts`) + `git clean` des nouveaux (`lib/geo/*`, `lib/supabase/market-pulse-map.ts`,
`components/listings/MarketMovementsMap.tsx`, `tests/*`) + `npm install`. `MarketReviewCharts.tsx`
jamais supprimé → restauration triviale du Bloc A.

---

## 7. Critères de sortie

- [ ] `npm run lint`, `npm run type-check`, `npm run build` : tous verts.
- [ ] `tests/geocode.test.ts` et `tests/market-pulse-map-dedup.test.ts` : tous verts (cas ville/pays/
      non-résolu/préfixe Cruising/alias + dédup/agrégation).
- [ ] `/dashboard/market-trends` : Bloc A remplacé par la carte ; bulles new/sold, rayon ∝ mouvements,
      clic → liste bateaux, zoom/pan, compteur « N mouvements · M lieux [· K non localisés] ».
- [ ] Bloc B (`MarketPulseTrendChart`) **strictement identique**.
- [ ] 0 dépendance réseau runtime (atlas + datasets vendored, import statique) ; `react` reste 18.2.0.
- [ ] `MarketReviewCharts.tsx` conservé, non exporté, non rendu.
- [ ] Seuls les fichiers listés au §3 sont stagés (WIP tiers non touchés).

---

## 8. Ordre de commit conseillé (chaque commit compile)

1. Étape 1 (deps) — compile.
2. Étapes 2+3+4+5 (assets géo + geocode + types) — compile, unités géocode testables.
3. Étape 6 (lecture serveur) + Étape 10 test dédup — compile, unité dédup testable.
4. Étape 7 (composant carte) — compile.
5. Étapes 8+9 (index + page, **ensemble**) — compile, feature live.
6. Étape 10 test géocode (si pas déjà) + passes TEST finales.
