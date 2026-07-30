# 07 — La vraie cause : erreur d'espace d'unités (SVG) + rayon non plafonné

## Contexte (4e retour utilisateur)

> « les ronds des bateaux sont trop gros et se gênent ce qui fait que je ne peux
> pas cliquer sur tous car ils se marchent les uns sur les autres »

Cycles 9, 10 et 11 ont chacun clôturé « tout vert » (lint / tsc / build / tests)
sans corriger le bug. Raison identique à chaque fois : la vérification
re-dérivait **l'hypothèse du clustering**, jamais **le rayon réellement dessiné
par le JSX**. Or c'est précisément l'écart entre les deux qui produisait le
chevauchement.

## Cause racine A — floors exprimés dans le mauvais espace d'unités

`ZoomableGroup` (react-simple-maps v3) rend
`<g transform="translate(x y) scale(k)">`. Tout ce qui est dessiné dedans est en
**unités locales** et apparaît **k fois plus grand à l'écran**.

Le composant faisait :

```tsx
Math.max(3,   bubbleRadius(...) / zoomScale)   // rayon visible
Math.max(0.5, 1 / zoomScale)                   // stroke
Math.max(9,   11 / zoomScale)                  // police badge
Math.max(4,   8 / zoomScale)                   // point spiderfy
MIN_HIT_RADIUS / zoomScale                     // zone de clic
```

Le plancher est appliqué **après** la division, donc en unités locales : un
`Math.max(3, …)` est en réalité un plancher de **3·k pixels écran**. Mesuré sur
une bulle typique (rayon de clic) :

| k | rayon de clic à l'écran | ce que le clustering suppose |
|---|---|---|
| 1 | 22 px | 22 px |
| 4 | 22 px | 22 px |
| 16 | 48 px | 22 px |
| 64 | 192 px | 22 px |
| 256 | 768 px | 22 px |

Le clustering garantit un écart de `22+22+6 = 50 px` entre centres. À k=16 les
disques se recouvrent donc de 46 px, 334 px à k=64, 1486 px à k=256. Un clic sur
un cluster zoome ×4 : **dès le deuxième clic l'utilisateur est dans le régime
cassé**. Comme la zone de clic invisible enflait elle aussi, les bulles voisines
devenaient littéralement inatteignables — le symptôme rapporté, mot pour mot.

## Cause racine B — rayon non plafonné pour un cluster

```ts
const ratio = Math.sqrt(total / maxTotal);   // pas de clamp
```

`maxTotal` est le maximum sur les **lieux individuels**, mais un cluster
**somme** ses membres. Mesuré avec `maxTotal = 10` :

| total du cluster | rayon | MAX_RADIUS |
|---|---|---|
| 40 | 34 px | 20 |
| 120 | 54 px | 20 |
| 300 | 83 px | 20 |

Et comme ce rayon est réinjecté dans la décision de clustering, un gros cluster
continue de « recouvrir » ses voisins et les avale : blob incontrôlé au zoom
monde. C'est la cause directe de « les ronds sont trop gros » à la vue par
défaut.

## Correctif

1. **`lib/geo/bubble-geometry.ts` (nouveau)** — géométrie extraite du composant
   pour être testable unitairement, ce qui manquait aux cycles 9/10/11 :
   - `bubbleRadius()` avec `Math.min(1, …)` — plafonne à `MAX_RADIUS` (cause B) ;
   - `tapRadius()` — **source de vérité unique** partagée par la décision de
     clustering ET le rendu, pour qu'ils ne puissent plus diverger ;
   - `toLocalUnits(screenPx, k)` — la seule conversion autorisée.
2. **`MarketMovementsMap.tsx`** — toute la géométrie est exprimée en pixels
   écran et convertie **exactement une fois** via un helper local `toLocal()`.
   Un bloc de commentaire « UNIT CONVENTION » interdit désormais explicitement
   de plancher une valeur déjà divisée par `k`.

Ni `MAX_RADIUS` (20) ni `MIN_HIT_RADIUS` (22) n'ont été touchés : plafonner le
rayon fait déjà passer le pire blob de 166 px à 40 px de diamètre. Retoucher ces
constantes en plus aurait été du réglage arbitraire par-dessus deux vrais bugs.

## Tests

`tests/bubble-geometry.test.ts` (7 tests) — et surtout : **chaque assertion a été
vérifiée rouge sur le code d'avant le correctif** avant d'être conservée.

Première tentative : le jeu de points synthétique (grille, 17 unités d'écart)
laissait l'assertion anti-chevauchement **verte sur le code cassé** — donc
inutile, exactement le mode d'échec des cycles 9/10. L'ancien bug n'apparaît que
pour une séparation projetée Δ telle que `50/k < Δ < 6` ; une grille large ne
peut jamais le déclencher. Remplacé par un jeu réaliste (hubs Côte d'Azur à
moins d'une unité, bande 3–6 unités, poids lourds au rayon plafonné, points
strictement coïncidents). Les trois assertions passent alors bien au rouge sur
l'ancien code.

Suite complète : **45/45 tests**, `next lint` 0/0, `tsc --noEmit` 0 erreur,
`next build` 0 erreur.

## Leçon

Sur une carte SVG zoomable, **une valeur en pixels et une valeur en unités
locales ne sont pas comparables** — un plancher posé du mauvais côté de la
division devient une valeur qui croît avec le zoom. Et un test de régression qui
n'a jamais été observé **rouge** ne prouve rien : il faut le rejouer contre le
code fautif, avec des données à la même échelle que les données réelles.
