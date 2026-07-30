# 05 — Correctif définitif : clustering par recouvrement réel (pas un rayon fixe)

## Retour utilisateur (2026-07-24, après déploiement du correctif 04)
La carte reste mauvaise : les marqueurs restent superposés, impossible de
sélectionner tous les bateaux d'une zone. Demande explicite de repartir de
zéro si besoin sur la gestion des points denses.

## Cause racine trouvée (relecture du correctif 04)
Le correctif précédent (`lib/geo/screen-cluster.ts` v1,
`clusterByProjectedDistance`) fusionnait deux bulles seulement si leurs
**centres** étaient à moins de `CLUSTER_PIXEL_RADIUS = 26px` l'un de l'autre —
un seuil **fixe**, indépendant de la taille réelle des bulles. Or le rayon
d'une bulle est proportionnel au nombre de mouvements (`bubbleRadius`, jusqu'à
`MAX_RADIUS = 20px`, et davantage une fois plusieurs zones fusionnées en un
total combiné). Deux grosses bulles (~20px de rayon chacune) à 30px de centre
à centre ne sont PAS regroupées par un seuil de 26px, alors qu'elles se
chevauchent visuellement (20+20 = 40px > 30px) — exactement le bug rapporté :
« ronds empilés », zones cachées derrière une autre, impossible à cliquer
individuellement. Prouvé par test unitaire avant correction
(`tests/screen-cluster.test.ts`, cas "two large-radius bubbles merge even
though their centers are far apart").

## Nouvelle logique (remplace entièrement la v1)
`lib/geo/screen-cluster.ts` : `clusterByOverlap()` — clustering agglomératif
**conscient du rayon réel** de chaque bulle (visuel ET zone tactile) :
- Fusionne deux groupes dès que leurs cercles (rayon = `max(bubbleRadius(total
  combiné), MIN_HIT_RADIUS)`) se touchent ou se chevauchent, avec une marge
  `gap` (6px) de confort.
- **Point fixe itératif** : après chaque fusion, les rayons/centroïdes sont
  recalculés et toutes les paires re-testées, jusqu'à stabilité. Ça résout le
  cas de cascade (A ne touche pas C directement, mais A+B fusionnés a un rayon
  assez grand pour atteindre C) qu'un clustering en une seule passe manque —
  testé explicitement (`tests/screen-cluster.test.ts`, cas "cascading merge").
- Le rayon utilisé pour la décision de clustering est **le même** que celui de
  la zone tactile invisible (`MIN_HIT_RADIUS`, ~44px de diamètre), donc la
  garantie « aucune bulle ne cache une autre » couvre le visuel ET le tactile,
  pas seulement l'un des deux.
- Projection en espace écran réel (`projection(...) * zoomScale`) — recalculée
  à chaque pan/zoom, donc les groupes se séparent proprement en zoomant
  (distance écran réelle croît) et se refusionnent en dézoomant.

## Spiderfy renforcé
`components/listings/MarketMovementsMap.tsx` : l'éventail de secours (points
encore superposés même à `MAX_ZOOM`) passe d'un cercle fixe à une **spirale**
(angle = pas doré ≈137,5°, rayon = pas × √(i+1)) — reste propre même si plus
de deux/trois zones finissent par être réellement coïncidentes, alors qu'un
cercle à N positions fixes recommence à se chevaucher pour N élevé.

## Fichiers
Réécrits : `lib/geo/screen-cluster.ts` (fonction remplacée,
`clusterByProjectedDistance` supprimée — plus aucun appelant),
`tests/screen-cluster.test.ts` (7 tests dont 2 qui encodent directement le bug
trouvé et sa correction). `components/listings/MarketMovementsMap.tsx` :
clustering rebranché sur `clusterByOverlap`, spiderfy en spirale. Design
(couleurs, panneau liste, layout) toujours inchangé.

## TEST
- `npx tsc --noEmit` ✅, `npm run lint` ✅ (0 avertissement, y compris
  `react-hooks/exhaustive-deps` — accesseur de rayon inlined dans le
  `useMemo` plutôt qu'une closure externe, pas de désactivation de règle).
- `npm run build` ✅ (16/16 pages, route carte toujours code-split seule,
  79.5 kB — stable par rapport au correctif précédent).
- `npx tsx --test tests/screen-cluster.test.ts tests/geocode.test.ts
  tests/market-pulse-map-dedup.test.ts` : 26/26 verts.

## Agent test-code (validation indépendante) — verdict
✅ Prêt. Lint/tsc/build/26 tests unitaires confirmés indépendamment. Relecture
manuelle de `clusterByOverlap` : terminaison du point fixe correcte (le nombre
de groupes décroît strictement à chaque fusion), aucune paire de cercles
chevauchants non fusionnée trouvée, isolation des projections nulles saine,
sens du paramètre `gap` correct. Point de vigilance explicitement demandé —
cohérence d'unités entre `project()` (position écran réelle,
`projection(...) * zoomScale`) et `radius()` (même espace, non divisé par
`zoomScale`, car le rayon SVG rendu est lui `bubbleRadius(...)/zoomScale`
_à l'intérieur_ du groupe `scale(k)`, donc le rayon apparent à l'écran est
invariant du zoom) — vérifiée saine par relecture du transform de
`react-simple-maps` et un script Node numérique à k=1/3.7/0.6. Aucune
régression, rien à corriger.

## Limite connue (inchangée)
Contrôle visuel/tactile réel en navigateur toujours hors de portée dans cet
environnement (pas de credentials broker, pas d'outil navigateur) — la preuve
de correction repose ici sur des tests unitaires qui encodent directement la
géométrie du bug (rayons qui se chevauchent malgré une distance de centre
supérieure à un seuil fixe), pas sur une capture d'écran réelle.
