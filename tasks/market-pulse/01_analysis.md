# 01 — Analyse (EXPLORE) : market-pulse

## Besoin (backlog `tasks/README.md` #4)
Remonter les feeds MLS YATCO (nouveaux listings, modifiés, vendus sur 5 jours) pour
repérer des **comparables** (comps) et des **baisses de prix** sur le marché — pas
la flotte Moana elle-même (déjà couvert par [[fleet-content-audit]] / section
« Listings YATCO »), mais ce qui bouge chez les concurrents dans le même segment.

## Recall RAG (QMD, BM25)
- `moana-boss-business-data-tour` : les feeds existent et ont déjà été vus une fois
  le 2026-07-16 — Search module → « Other For Sale Searches » → NEW (`useractionid=75`,
  46 listings), MODIFIED (`76`, 257 listings, ex. CALYPSO €35.9M→€29.5M -18%), SOLD
  (`77`, 5 listings). MLS-wide, tous brokers, fenêtre glissante 5 jours.
- URL d'accès (code-bearing, cf. [[yatco-boss-scraping-quirks]]) :
  `https://www.yatcoboss.com/search/home/?code=L3NlYXJjaC9zZWFyY2gvc2VhcmNoY2F0ZWdvcnkvLC9zZWFyY2gvc2VhcmNoL3Jlc3VsdHNfdjIvP2ZyZXNoU2VhcmNoPVRydWU=`
  (même code que la Search MLS-wide déjà utilisée pour Tool #3).

## Vérification live (2026-07-21)
- Les 3 boutons (`useractionid="75"/"76"/"77"`) fonctionnent en `interact` sur cette
  URL (pas besoin de la séquence 756→767 propre à Insight Analytics — c'est une autre
  section de l'app, Search, déjà déverrouillée le 16/07).
- **Chaque ligne de résultat est une carte HTML riche** (pas un Kendo grid) : nom,
  `data-vesselid` (= vID, dans `button[data-vesselid=...]` et le lien VIEW DETAILS
  `?vID=...&FromSearch=1`), MLS#, builder, année, catégorie, LOA, prix (texte brut,
  devises variables), localisation, broker(s) + contact(s), teaser descriptif,
  **`Sold Date`** (feed Sold uniquement, en rouge).
- **`<div class="HistoryText">` = la vraie trouvaille** : texte littéral du changement
  ("Country was Greece changed to Italy.", "Status was In Process changed to Active.",
  "Status was Active changed to Sold.") — **et donc aussi, quand pertinent, "Price was
  €X changed to €Y."** (vu dans l'exemple CALYPSO du 16/07). **Pas besoin de stocker
  nos propres snapshots pour calculer une baisse de prix : BOSS fournit le delta
  directement dans ce champ.** Parsing : regex sur `Price was ([^ ]+) changed to ([^.]+)`.
- **Limite trouvée (nouvelle)** : chaque feed annonce un **vrai total** (ex. "Modified
  Vessel Search Results - (190 Listings Found)" testé ce jour — le nombre varie
  jour/jour, 257 le 16/07 vs 190 aujourd'hui, cohérent avec une fenêtre glissante) mais
  **seules les ~12 premières lignes se rendent** dans le DOM sans scroll/pagination
  supplémentaire trouvée. Testé `scrollIntoView` + `press End` + `blockResources:false` :
  aucune ligne de plus n'apparaît. Pas de marqueur de pagination Kendo classique (pas de
  `k-pager`, pas de "load more"), donc mécanisme non identifié (lazy-load JS interne
  probable). **Non résolu — décision produit ci-dessous plutôt que de creuser plus.**
- Tri par défaut = "Largest" (plus gros bateaux d'abord) — **avantage** : la flotte
  Moana est concentrée sur le segment 27-85m (luxe/superyacht, cf. [[fleet-content-audit]]
  25 listings actifs scrapés), donc les ~12 premières lignes (triées par taille) sont
  déjà le segment le plus pertinent pour des comps Moana, pas un échantillon aléatoire.

## Décision de périmètre (v1, sans re-demander à l'utilisateur — appel de jugement)
Plutôt que de perdre du temps à percer la pagination/lazy-load (bloqueur du même type
que la grille Fleet Manager déjà rencontrée), **v1 capture le haut de classement par
taille de chaque feed** (New / Modified / Sold), qui correspond déjà au segment où
Moana vend. Chaque ligne est parsée avec son `HistoryText` (si présent) → détection
automatique des baisses de prix sans logique de diff maison. Pagination complète =
amélioration v2 si le besoin se confirme (comme le passage 25→34 vessels pour l'outil #3).

## Modèle de données
Aucune table existante ne couvre ça (`grep` sur `market_pulse|comps|price_drop` → rien).
Nouvelle table, MLS-wide (pas de lien direct à `listings` — ce sont des bateaux
d'autres brokers, pas la flotte Moana).

## Architecture (identique à fleet-content-audit)
- Scraping LOCAL uniquement (scrape-mcp + cookies BOSS vivent sur ce poste, pas AWS —
  contrainte déjà actée). Script standalone réutilisable dans
  `D:\dev\scrape-mcp\scripts\` (comme `fleet-audit-scrape.mjs`).
- Ingestion Supabase via script `tsx` (comme `sync-yatco-fleet-listings.ts`).
- Nouvelle section app (lecture seule, pas de CRUD).

## Suite
Écrire `02_plan.md` (schéma table, script scraper 3-feeds, ingestion, UI), puis coder.
