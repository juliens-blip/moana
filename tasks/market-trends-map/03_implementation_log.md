# 🧪 RAPPORT DE TEST - Carte "Mouvements du marché" (Market Trends, Bloc A)

Phase 4 du tunnel (test-code), exécutée indépendamment du développeur. Working dir : `D:\dev\moana\moana`.

## 📋 Contexte

- **Fichiers créés** : `lib/geo/atlas/countries-110m.json`, `lib/geo/country-centroids.json`,
  `lib/geo/city-coords.json`, `lib/geo/geocode.ts`, `lib/supabase/market-pulse-map.ts`,
  `components/listings/MarketMovementsMap.tsx`, `tests/geocode.test.ts`,
  `tests/market-pulse-map-dedup.test.ts`.
- **Fichiers modifiés** : `package.json` (+`react-simple-maps`, +`@types/react-simple-maps`),
  `lib/types.ts` (additif), `components/listings/index.ts`,
  `app/dashboard/market-trends/page.tsx`, `ops/yatco-automation/systemd/moana-yatco-refresh.timer`,
  `ops/yatco-automation/README.md` (72h → 48h).
- **Type de changement** : feature (remplacement Bloc A) + config (cadence crawl).
- **Lignes modifiées (git diff --stat, fichiers de la feature)** : ~303 insertions / 56 suppressions
  sur 10 fichiers trackés + 8 nouveaux fichiers.
- **Note** : `git status` montre aussi des WIP tiers non liés à cette feature (`bugs.md`,
  `.claude/agents/README.md`, `backup/brokers.csv` supprimé, `.codex/`, `graphify-out/`) — non
  stagés/testés ici, hors périmètre (cohérent avec CLAUDE.md « Zones protégées »).

## ✅ Résultats des Tests

### 0. Cache & Configuration
- **Statut cache `.next/`** : ⚠️ Présent (build relancé par mes soins par-dessus) — pas de symptôme
  de cache corrompu (« Dynamic server usage ») observé.
- **Token/Base ID consistency** : sans objet (aucune variable d'environnement touchée par cette feature).

### 1. Linting
- **Statut** : ✅ Succès — `npm run lint` → `ESLint: No issues found`.

### 2. Type Checking
- **Statut** : ✅ Succès — `npx tsc --noEmit` → `TypeScript: No errors found`.

### 3. Build Process
- **Statut** : ✅ Succès — `npm run build` (Next 14.2.33), ~65 s, 16/16 pages générées,
  route `/dashboard/market-trends` bundlée sans erreur ESM sur `react-simple-maps`/`d3-geo`
  (aucun `transpilePackages` requis, contrairement au risque anticipé au plan).
- **Point d'attention bundle** (voir bugs §Majeure ci-dessous) : le chunk contenant
  `react-simple-maps`/`ComposableMap`/`ZoomableGroup` (`514-f3599d251d40fce0.js`, ~496 KB brut /
  ~141 KB gzip) est référencé non seulement par `/dashboard/market-trends`, mais aussi par
  `/dashboard`, `/dashboard/bateau-a-suivre`, `/dashboard/bateau-chantier/*`,
  `/dashboard/listings-yatco`, `/dashboard/market-pulse` — toutes les routes qui importent
  quoi que ce soit du barrel `components/listings/index.ts`. Confirmé par grep du chunk et
  comparaison des listes de chunks dans `.next/app-build-manifest.json`.

### 4. Tests Unitaires
- **Statut** : ✅ Succès — `npx tsx --test tests/geocode.test.ts tests/market-pulse-map-dedup.test.ts`
  → **12/12 tests passés** (7 géocodage + 5 dédup/agrégation), ré-exécutés indépendamment,
  résultat identique à celui annoncé par le développeur.

### 5. Serveur de Développement
- **Statut** : ✅ Déjà démarré par le développeur, réutilisé (pas de second `npm run dev` lancé).
- **Test fonctionnel (curl)** :
  - `GET /dashboard/market-trends` → `HTTP/1.1 307 Temporary Redirect`, `Location: /login`
    (comportement ATTENDU : route protégée par cookie `moana_session`, pas de crash serveur).
  - `GET /login` → `200` (serveur globalement sain).

### 6. Cohérence des données
- Sans objet — aucun accès direct aux données authentifiées possible sans credentials broker
  (limite documentée ci-dessous).

## 🐛 Erreurs & Warnings Détaillés

### Erreurs Critiques (Bloquantes)
Aucune.

### Erreurs Majeures
Aucun bug logique confirmé dans `lib/geo/geocode.ts` ou `lib/supabase/market-pulse-map.ts`
(voir revue détaillée ci-dessous — tout est cohérent). Un point d'architecture mérite attention :

1. **Bundling du chunk `react-simple-maps`/`d3-geo`/atlas sur des routes non liées à la carte**
   — `components/listings/index.ts` (barrel) + `.next/app-build-manifest.json`
   - **Constat** : `MarketMovementsMap` (et donc `react-simple-maps`, `d3-geo`, l'atlas topojson
     ~100 KB) est exporté depuis le même barrel `components/listings/index.ts` que
     `ListingCard`/`FleetAuditCard`/etc. Le graphe de chunks Next groupe ce code dans un chunk
     partagé (`514-*.js`) chargé par **6 routes dashboard** (`/dashboard`,
     `/dashboard/bateau-a-suivre`, `/dashboard/bateau-chantier/[id]/edit`,
     `/dashboard/listings-yatco`, `/dashboard/market-pulse`, `/dashboard/market-trends`),
     pas seulement par la page qui rend réellement la carte.
   - **Cause probable** : pattern barrel-export pré-existant (déjà le cas pour `recharts` via
     `MarketPulseTrendChart`/`MarketReviewCharts` dans le même barrel) — cette feature l'aggrave
     en y ajoutant `react-simple-maps` + `d3-geo` + l'atlas vendored, sans `next/dynamic`.
   - **Impact** : contredit l'hypothèse du plan (§4, Étape 7 : « atlas importé uniquement dans le
     composant carte (code-splité par route) ») — dans les faits, ~141 KB gzip supplémentaires
     sont potentiellement chargés sur des pages qui n'affichent jamais la carte.
   - **Suggestion (non appliquée, hors mandat test-code)** : importer `MarketMovementsMap` via
     `next/dynamic(() => import('./MarketMovementsMap'), { ssr: false })` dans `page.tsx`, ou
     l'exclure du barrel et l'importer par chemin direct dans `page.tsx`.
   - **Sévérité** : majeure mais non bloquante (n'empêche ni le build ni le fonctionnement ;
     impact perf/bundle uniquement).

### Warnings (Non-bloquants)
- `baseline-browser-mapping`/`caniuse-lite` : données obsolètes (> 2 mois / 7 mois), warning
  pré-existant, sans rapport avec cette feature.

## 🔍 Revue de cohérence (lecture de code, sans modification)

- **Bloc B (`MarketPulseTrendChart`, section `market-pulse-trend-heading`)** : ✅ **strictement
  intact** — `git diff` confirme 0 modification de la section (`app/dashboard/market-trends/page.tsx`
  lignes 49-64 dans la version actuelle) ; import et rendu identiques à l'original.
- **`components/listings/MarketReviewCharts.tsx`** : ✅ toujours présent sur disque (644 lignes/5.5 KB,
  aucun diff), simplement dé-exporté de `components/listings/index.ts` (conforme au plan §2).
- **`react` version** : ✅ reste **18.2.0** dans `package.json` et `package-lock.json`
  (`node_modules/react`.version = `18.2.0`, aucune autre version présente dans le lockfile).
  `react-simple-maps` verrouillé à `3.0.0` (peerDep `16.8||17||18`).
- **`lib/supabase/market-review.ts`** : ✅ **0 diff** (`git diff` vide) — toujours utilisé tel quel
  par le Bloc B (`getMarketPulseTrendEntries`).
- **`app/dashboard/market-pulse/page.tsx` et ses composants** : ✅ **0 diff, 0 fichier touché**
  (`git status`/`git diff` vides sur `app/dashboard/market-pulse/`).
- **Dédup `vid+feed_type`** (`buildMovementsResult`) : ✅ correcte — clé `` `${vid}::${feed_type}` ``,
  garde la première ligne vue (rows supposées triées desc par `scraped_at`, garanti par la requête
  `.order('scraped_at', {ascending:false})` de `getRecentMarketPulseMovements`), `new`/`sold` sur le
  même `vid` traités comme 2 mouvements distincts, `modified` filtré. Confirmé par les 5 tests unitaires.
- **Gestion d'erreurs Supabase** : ✅ cohérente avec `market-review.ts` (`console.error` préfixé +
  `throw new Error(...)` avec le message d'erreur Supabase). `clampInteger`/`getWindowStartDate`
  recopiés à l'identique du pattern `market-review.ts:103-116` (renommage local sans changement
  de logique).
- **Géocodage — location à un seul token (pas de virgule)** : ✅ ne crashe pas. Avec `raw="Miami"`,
  `tokens=["Miami"]`, `countryRaw = cityRaw = "Miami"` (le même token sert de candidat ville *et*
  pays) → résout en `city` si `"miami"` est dans `city-coords.json`, sinon tente le pays, sinon
  `resolved:'none'` (compté dans `unlocatedCount`). Comportement dégradé raisonnable, pas testé
  explicitement dans `tests/geocode.test.ts` (aucun cas à un seul token) mais aucun risque
  d'exception (pas d'accès hors-limite : `tokens[tokens.length-1]` et `tokens[0]` valides dès
  `tokens.length>=1`, déjà garanti par le early-return `tokens.length===0`).
- **Tri des locations par `total`** : ✅ correct — `sortedLocations = [...].sort((a,b)=>b.total-a.total)`
  (desc). `totalMovements = seen.size - unlocatedCount` correspond bien à la somme des `total` par
  lieu (vérifié logiquement).
- **Format des datasets géo** : ✅ spot-check cohérent — `country-centroids.json`/`city-coords.json`
  en `[lon, lat]` (convention documentée par la clé `_format`), valeurs plausibles vérifiées
  (Italy `[12.57,41.87]`, Genoa `[8.9463,44.4056]`, Antibes, Budva, Palma — coordonnées correctes).
- **Secrets** : ✅ aucun grep positif sur clés API/tokens/mots de passe en dur dans les fichiers
  créés/modifiés (seuls faux positifs : noms de variables `tokens`, champs de type
  `password`/`password_hash` déjà existants dans `lib/types.ts`, mot « secret » dans une phrase de
  `ops/yatco-automation/README.md`).
- **Fenêtre 14 jours vs 7 jours du plan** : ⚠️ `MARKET_PULSE_MAP_DAYS = 14` dans le code
  (`lib/supabase/market-pulse-map.ts`) alors que `01_analysis.md`/`02_plan.md` documentent 7 jours
  partout. Cohérent avec la mission qui m'a été donnée (14 jours), mais **les documents de phase
  EXPLORE/PLAN n'ont pas été mis à jour** en conséquence — dérive de doc à signaler, pas un bug de
  code.

## 💡 Recommandations

### Priorité 1 (Critiques)
Aucune action requise.

### Priorité 2 (Majeures)
1. Éviter que `react-simple-maps`/`d3-geo`/l'atlas topojson ne se retrouvent dans un chunk partagé
   par des routes qui n'affichent jamais la carte.
   - **Solution suggérée** : `next/dynamic(() => import('@/components/listings/MarketMovementsMap'), { ssr: false })`
     dans `page.tsx`, ou sortir `MarketMovementsMap` du barrel `components/listings/index.ts` et
     l'importer par chemin direct.

### Priorité 3 (Mineures)
1. Mettre à jour `01_analysis.md`/`02_plan.md` pour refléter la fenêtre 14 jours réellement
   implémentée (actuellement documentée à 7 jours).
2. Ajouter un cas de test pour une `location` à un seul token (pas de virgule) dans
   `tests/geocode.test.ts`, pour figer explicitement le comportement dégradé observé.

## ⚠️ Limite connue (non contournée)

Le contrôle visuel authentifié (clic sur bulle, zoom/pan, rendu réel des couleurs new/sold,
panneau liste bateaux) **n'a pas pu être exécuté** : pas de credentials broker, pas d'outil
navigateur disponible dans cet environnement. Je n'ai ni tenté de forger une session `moana_session`
ni de contourner `getSession()`. Seul le test serveur (curl 307 → `/login`, pas de crash) a pu
confirmer que la route ne casse pas au niveau serveur.

## 🎯 Conclusion

**Verdict Global** : ✅ Prêt (avec 1 point d'attention non-bloquant à traiter au prochain cycle)

**Résumé** : Lint, type-check, build et les 12 tests unitaires sont tous verts, ré-exécutés
indépendamment avec des résultats identiques à ceux annoncés. Le Bloc B et la page
`market-pulse` sont strictement intacts, `react` reste en 18.2.0, `MarketReviewCharts.tsx` est
conservé mais dé-exporté. Aucun bug logique ni secret en dur trouvé dans le code créé. Le seul
point à corriger avant un futur cycle de perf est le bundling non scindé de
`react-simple-maps`/l'atlas sur plusieurs routes dashboard non liées à la carte — à traiter via
`next/dynamic` ou en sortant le composant du barrel. Le contrôle visuel authentifié reste à faire
par un agent disposant de credentials broker et d'un outil navigateur.

---

## 🔁 LOOP — Correction appliquée (même cycle)

Le point Priorité 2 (bundling partagé) a été corrigé immédiatement, sans repasser par EXPLORE/PLAN
(fix local, pas un changement de portée) :

- `components/listings/index.ts` : export de `MarketMovementsMap` **retiré** (commentaire expliquant
  pourquoi, pour éviter qu'il soit ré-ajouté par erreur).
- `app/dashboard/market-trends/page.tsx` : import via `next/dynamic(() => import('@/components/listings/MarketMovementsMap'), { ssr: false })`
  (aliasé `nextDynamic` pour ne pas percuter l'export de config de route `export const dynamic = 'force-dynamic'`),
  avec un `loading` fallback (« Chargement de la carte… »).

**Vérification post-fix** (`npm run build`) : les routes qui n'affichent pas la carte sont repassées
à leur poids normal — `/dashboard` 306 kB (contre 383 kB avant fix), `/dashboard/market-pulse` 304 kB
(contre 381 kB), `/dashboard/listings-yatco` 304 kB, `/dashboard/bateau-a-suivre` 307 kB. Seule
`/dashboard/market-trends` porte désormais le poids de la carte (77.2 kB route + 381 kB First Load JS).
Re-passe complète : `npm run lint` ✅, `npx tsc --noEmit` ✅, `npm run build` ✅ (16/16 pages),
12/12 tests unitaires ✅ (inchangés).

**Nouveau verdict global : ✅ Prêt, sans point d'attention restant** (hors contrôle visuel authentifié,
toujours à faire par un humain ou un agent avec credentials + navigateur — cf limite ci-dessus).
