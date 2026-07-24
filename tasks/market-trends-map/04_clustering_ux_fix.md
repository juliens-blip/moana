# 04 — Correctif UX : clustering/spiderfy de la carte des mouvements

## Besoin (retour utilisateur, 2026-07-24)
Sur `/dashboard/market-trends`, les bulles de la carte (`MarketMovementsMap.tsx`)
sont trop collées en vue monde, surtout sur mobile : impossible de cliquer sur
un point précis. Demande explicite : clustering, clic sur cluster = zoom ou
liste, séparation au zoom, spiderfy si besoin, gros touch targets.

## EXPLORE (résumé)
- Stack carte confirmée : `react-simple-maps` (SVG/d3-geo), **pas** Leaflet/Mapbox
  — donc pas de lib de clustering marker-based existante (`leaflet.markercluster`,
  `supercluster`, etc.) à brancher directement.
- Un pré-clustering **serveur** existait déjà : `clusterNearbyLocations()` dans
  `lib/supabase/market-pulse-map.ts` (fusion haversine à 40km, fixe, non lié au
  zoom). Bon pour réduire le nombre de zones mais ne résout pas la collision
  visuelle à l'écran une fois zoomé/dézoomé.
- `react-simple-maps` expose `useMapContext()` (projection) et
  `useZoomPanContext()` (échelle `k` courante) — et son `ZoomableGroup` accepte
  `center`/`zoom` en props **contrôlées** (vérifié dans
  `node_modules/react-simple-maps/dist/index.es.js:729-747` : un effet réagit
  aux changements de ces props et rejoue la transform d3-zoom). Donc un
  "clic cluster → zoom programmatique" est faisable sans fork de la lib.

## Décision technique
Clustering **client, en pixels écran, recalculé à chaque pan/zoom** (pas un
seuil géographique fixe) :
- `lib/geo/screen-cluster.ts` : `clusterByProjectedDistance()`, union-find
  générique sur distance projetée (même forme que `clusterNearbyLocations`
  mais en unités de plan projeté, testable sans React/vrai geo).
- Dans `MapMarkers` (nouveau sous-composant, enfant de `ZoomableGroup`) :
  seuil = `CLUSTER_PIXEL_RADIUS / zoomScale` (k live via `useZoomPanContext`)
  → les clusters se séparent automatiquement en zoomant, se refusionnent en
  dézoomant.
- Clic sur bulle multi-zones : zoom programmatique (`center`/`zoom` contrôlés
  sur `ZoomableGroup`, ×4 par clic, plafonné à `MAX_ZOOM=20`). Si déjà à
  `MAX_ZOOM` et toujours fusionné (points géographiquement quasi identiques) →
  **spiderfy** : éventail de bulles individuelles autour du centroïde, en
  décalage pixel pur (indépendant de la projection géo, comme le fait Leaflet).
- Touch targets : cercle invisible de hit-area ≥22px de rayon (~44px de
  diamètre) sous chaque bulle visible, sans changer la taille/couleur affichée
  (design conservé à l'identique).
- Boutons zoom +/-/reset (44×44px) superposés sur la carte pour la
  découvrabilité mobile (pinch pas toujours évident dans une page qui scrolle).
  `touchAction: 'none'` sur le conteneur pour que d3-zoom capte bien les
  gestes tactiles sans conflit de scroll de page.

## Fichiers
Nouveaux : `lib/geo/screen-cluster.ts`, `tests/screen-cluster.test.ts`.
Modifié : `components/listings/MarketMovementsMap.tsx` (logique de clustering/
zoom/spiderfy/hit-area ; design, couleurs, panneau liste bateaux inchangés).
Non touchés : `lib/supabase/market-pulse-map.ts` (le pré-clustering serveur
40km reste tel quel, complémentaire — il réduit le volume de zones avant que
le clustering écran ne s'applique), `page.tsx`, schéma/scraper.

## TEST
- `npx tsc --noEmit` : OK.
- `npm run lint` : OK.
- `npm run build` : OK, route `/dashboard/market-trends` toujours code-split
  seule (`next/dynamic ssr:false`), pas de régression de bundle partagé.
- `npx tsx --test tests/screen-cluster.test.ts tests/geocode.test.ts
  tests/market-pulse-map-dedup.test.ts` : 25/25 verts.
- Agent test-code (validation indépendante) : lint/tsc/build/25 tests confirmés
  verts indépendamment. A détecté 1 point mineur — `maxTotal` (échelle des
  bulles) était recalculé depuis le clustering courant au lieu d'un maximum
  global fixe, causant une "pulsation" de taille au pan/zoom. Corrigé (calcul
  unique sur `locations` complet, indépendant du clustering) ; tsc/lint
  rejoués verts. Détail dans `journalbug.md` (entrée 2026-07-24).

## Limite connue
Contrôle visuel authentifié (clic réel sur bulle/cluster, pinch mobile réel)
non exécuté — pas de credentials broker ni d'outil navigateur dans cet
environnement, même limite que le cycle initial (voir `03_implementation_log.md`).
