# 06 — Fix MAX_ZOOM insuffisant + spiderfy qui se chevauche encore

## Contexte (pourquoi ce cycle existe)

Retour utilisateur (3e fois) : la carte reste mauvaise, bulles superposées,
impossible de sélectionner tous les bateaux d'une zone. Cycles 9 et 10
(`journalbug.md`) ont chacun clôturé "tout vert" (lint/tsc/build/tests) sans
que le bug réel soit couvert — leur vérif ne testait jamais le comportement
à `MAX_ZOOM` réel ni le spiderfy à l'échelle. Leçon du cycle 10 :

> « sur une carte à bulles proportionnelles, un seuil de clustering ne peut
> JAMAIS être une distance fixe — il doit dépendre du rayon réel de chaque
> bulle. »

Le principe s'applique ici à un niveau différent : ce cycle-ci, le
clustering (`clusterByOverlap`) est correct (re-vérifié, 0 chevauchement à
tous les zooms testés). Le bug est en aval, dans les DEUX constantes qui
pilotent le comportement une fois qu'un cluster existe :

1. `MAX_ZOOM` — jamais vérifié contre de vraies distances géographiques.
2. `SPIDERFY_STEP_PX` — jamais vérifié contre le nombre réel de membres
   d'un cluster dense.

Comme cycle 9/10, l'erreur méthodologique commune était de valider par
lint/tsc/build (qui ne peuvent pas détecter un chevauchement géométrique)
plutôt que par un script qui rejoue la géométrie réelle. Ce cycle corrige
ça : `tasks/market-trends-map/_verify-cluster.ts` a été réparé (corruption
octets nuls due à un append Bash) et étendu avec deux nouveaux contrôles
géométriques avant tout correctif.

## Root cause A — MAX_ZOOM=20 mathématiquement insuffisant

Avec `geoEqualEarth().fitSize([800,420])`, ~2.222 px/degré-longitude à
l'équateur à zoom 1. Distance en px à un zoom Z ≈ distance_km_en_degrés ×
2.222 × Z. Pour séparer deux points de 50px (seuil de non-chevauchement
mini) :

| Paire réelle          | distance | zoom requis | MAX_ZOOM actuel |
|------------------------|----------|-------------|------------------|
| Antibes ↔ Cannes        | ~9 km    | ≥ 209.1     | 20 (insuffisant) |
| Antibes ↔ Monaco        | ~24 km   | ≥ 75.1      | 20 (insuffisant) |
| Fort Lauderdale ↔ Miami | ~5 km    | ≥ 412.8     | 20 (insuffisant) |

Conséquence : aucune paire de hubs yachting proches-mais-distincts ne peut
JAMAIS se séparer par zoom avant de heurter le plafond — contredit
l'exigence #3 ("high zoom = clean separation"). Elles tombent toutes
systématiquement en spiderfy, y compris des villes clairement distinctes
(Antibes/Monaco à 24km).

**Fix** : relever `MAX_ZOOM` de 20 à **256**. Choix : `256 = 4^4` = exactement
4 clics sur `CLUSTER_ZOOM_FACTOR=4` depuis `MIN_ZOOM=1`, donc toujours
atteignable en un nombre de clics raisonnable. Ça couvre Antibes/Cannes (209)
et Antibes/Monaco (75) par zoom réel, et ne laisse au spiderfy que les cas
génuinement extrêmes (ex. Ft. Lauderdale/Miami à 413, doublons exacts) — ce
qui est le comportement standard attendu de tout outil de clustering de
carte (Leaflet.markercluster, Mapbox GL) : le spiderfy gère le dernier mile
des points quasi-coïncidents, pas la séparation normale ville-à-ville.

## Root cause B — SPIDERFY_STEP_PX=26 insuffisant à l'échelle

Le spiderfy (spirale à angle doré, `legPx = stepPx * sqrt(i+1)`) doit
garantir un espacement pair-à-pair pire-cas ≥ `2*MIN_HIT_RADIUS +
CLUSTER_GAP_PX = 50px`, sinon deux zones spiderfiées se chevauchent encore
→ viole directement l'invariant dur "aucun bateau jamais caché".

Sweep effectué sur N=2..50 membres (dataset réel actuel : jusqu'à 16
membres dans un cluster de doublons) :

| SPIDERFY_STEP_PX | espacement pire-cas | résultat |
|---|---|---|
| 26 (actuel) | 41.7px | FAIL |
| 30 | 48.1px | FAIL |
| 34 | 54.5px | OK (minimum testé qui passe) |
| **38** | **60.9px** | **OK — marge de sécurité choisie** |
| 42 | 67.3px | OK |

**Fix** : relever `SPIDERFY_STEP_PX` de 26 à **38** (marge ~22% au-dessus du
minimum 34 testé, pour absorber d'éventuels clusters plus denses que ceux du
dataset synthétique actuel).

## Étapes

1. Modifier `components/listings/MarketMovementsMap.tsx` :
   `MAX_ZOOM = 256`, `SPIDERFY_STEP_PX = 38`. Aucun autre changement — le
   clustering (`clusterByOverlap`) et le rendu restent inchangés, déjà
   vérifiés corrects.
2. Rejouer `npx tsx tasks/market-trends-map/_verify-cluster.ts` → 0 échec
   sur les 4 passes + les 2 contrôles géométriques ajoutés ce cycle.
3. Logger ce cycle dans `journalbug.md` (2 bugs : MAX_ZOOM, SPIDERFY_STEP_PX).
4. Agent `test-code` (lint, `tsc --noEmit`, build, tests unitaires,
   tests fonctionnels) — obligatoire, ne modifie jamais le code.
5. Si tout vert : mettre à jour `state.md`, commit + push (autorisation
   utilisateur déjà donnée, conditionnée à zéro bug connu restant).
