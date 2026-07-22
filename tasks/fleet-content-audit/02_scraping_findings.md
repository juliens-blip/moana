# 02 — Findings scraping BOSS (EXPLORE, 2026-07-21)

Auth scrape-mcp restaurée (re-login + reconnect). Exploration du Fleet Manager pour
sourcer l'audit de contenu. Conclusion : **la grille flotte de BOSS n'est PAS
scrappable en headless** — bloqueur réel, documenté dans [[yatco-boss-scraping-quirks]].

## Ce qui marche
- `/forsale/home/` (browser engine + `waitForSelector`) rend le shell + le menu.
- Clic `button[useractionid="2"]` (« YACHTS FOR SALE ») → charge le panneau « My Fleet »
  avec le **résumé de statut** (Actifs **61**, In Process 5, Expirés 45, Retirés 45,
  Off-Market 16, Vendus 3) et l'**en-tête de grille avec une colonne « Listing Quality »**
  (score natif de complétude BOSS — exactement la métrique d'audit cible).
- **Les 34 IDs de vessels For-Sale** sont récupérables (input print-queue de `/forsale/home/`) :
  251789, 452830, 446464, 234905, 249777, 408534, 452474, 405716, 452238, 447237,
  410291, 453208, 453271, 408374, 450532, 445812, 453844, 444047, 415727, 453473,
  453730, 411863, 310296, 305391, 309272, 451563, 298670, 360613, 415945, 466948,
  446860, 452977, 412781, 453356.

## Ce qui NE marche PAS
- Les **lignes de la grille Kendo ne se peuplent jamais** en headless (`tbody tr[data-uid]`
  timeout à 45 s, même `blockResources:false`). Le gridread est un POST Kendo authentifié
  non rejouable via scrape/interact (GET).
- Partiel `/forsale/manage/mylistings/` et gridread devinés → **404** (SPA AJAX-only).
- Public `yatco.com/yacht/<vID>/` → **ne résout pas** (besoin du slug `/yacht/<slug>-<id>/` ;
  ID nu → article de blog CMS).

## Conséquence pour le plan
La métrique idéale (« Listing Quality » + photos/vidéo/specs par listing) existe mais
n'est pas automatisable via scrape-mcp headless. Options pour débloquer la feature :
- **A.** Ingest semi-manuel : l'utilisateur exporte la flotte depuis BOSS (rendu OK dans
  SON navigateur) → on ingère dans Supabase → section + audit. Fiable, pas « live ».
- **B.** Trouver un rapport BOSS GET-accessible listant les listings + qualité (à explorer
  côté Insight Analytics — R&D scraping incertaine).
- **C.** Auditer via les pages publiques yatco.com (compter photos/vidéo) — nécessite
  d'abord le mapping vID→slug public (non résolu).
- **D.** MVP sans scraping profond : section listant les 34 listings (vIDs connus) + lien
  vers leur page BOSS + audit amorcé (ex. FOUZ sans photos) enrichi au fil de l'eau.

→ Décision produit requise (voir présentation à l'utilisateur).

## ✅ BREAKTHROUGH (R&D suite, 2026-07-21) — pipeline qui MARCHE
Le rapport **Insight Analytics « Active Listings Report »** rend, lui, sa grille Kendo
en headless (contrairement au Fleet Manager). Chemin `interact` sur `/insights/home/` :
clic `useractionid=756` (FLEET/INVENTORY) → clic `useractionid=767` → grille
`#MyListingsActive_Grid` remplie = **25 listings actifs**.

Par ligne on récupère : **vID** (dans le href du bouton photo
`/search/vesseldetails/viewlisting/?vID=<vID>`), **présence de photo de couverture**
(thumbnail S3 `.../ForSale/Vessel/Photo/<vID>/...`), MLS#, nom, prix, builder, année,
broker, LOA, statut, type. `vID` ≠ MLS# (ATLANTIS vID 466987 / MLS 483638).

Limites : l'endpoint read est POST-only (interact obligatoire, pas de GET). Le contenu
profond par bateau (nb de photos, vidéo, specs complètes) est sur
`/search/vesseldetails/viewlisting/?vID=<vID>` (SPA, interact aussi) → **v2**.

**Conséquence** : MVP faisable = ingérer les 25 listings actifs + signal « photo de
couverture » via le rapport, dans Supabase, et exposer une section app « Listings YATCO »
+ audit (listings sans photo / champs manquants). Deep-content = v2.

Note archi : scrape-mcp + cookies BOSS vivent en LOCAL (D:/dev/scrape-mcp), pas sur AWS →
l'ingestion YATCO tourne côté local (via Claude/scrape-mcp), pousse dans Supabase ;
l'app (Vercel) lit Supabase. Pas de scraping headless BOSS depuis AWS.

## ✅ BREAKTHROUGH #2 (2026-07-21) — deep per-vessel audit CONFIRMED
Le bouton photo de chaque ligne (`button[href="/search/vesseldetails/viewlisting/?vID=<vID>"]`)
n'est PAS un lien classique : cliqué **depuis la page Active Listings Report** (même session
interact, à la suite des clics 756→767), il déclenche une **navigation JS interne** et le panneau
« Vessel Listing - <NAME> » se charge **inline sur la même page**, avec le détail complet :
- **Photos** : toutes les images `large_*.png/jpg` (BOLD = 3 photos) → nb de photos = signal direct.
- **Description** ("About <NAME>") : présente ou « No description available » → signal complétude.
- **Hull & Deck**, **Engine Information** (par moteur), **Basic Info**, **Dimensions**,
  **Speed/Capacity/Weight**, **Broker's Message**, **Modified Date**, **Days On Market**.
- Pas de section vidéo visible pour BOLD (vID 414188) — à vérifier sur un autre vessel avant de
  conclure que la vidéo n'est jamais exposée ici (le menu d'action séparé "Videos" existe sur les
  pages Search — voir [[yatco-boss-scraping-quirks]] note 2026-07-16 — donc la vidéo est peut-être
  ailleurs, pas dans ce panneau).

Test fait sur BOLD (vID=414188) : `interact` sur `/insights/home/`, séquence
click 756 → wait → click 767 → wait grid → click `button[href=".../?vID=414188"]` → wait 3s →
le markdown retourné contient tout le détail ci-dessus dans la même réponse.

**Conséquence pour le plan** : l'audit profond par bateau EST automatisable. Pipeline par vessel :
1 seul appel `interact` (la séquence de clics + le clic photo du vessel ciblé) par vID, réutilisant
la même page Active Listings Report à chaque fois (25 vIDs actifs connus depuis BREAKTHROUGH #1).
Coût : ~25 appels interact (~18s chacun observé) pour les 25 listings actifs. Les 34 vessels totaux
(incl. non-actifs) restent à couvrir séparément si besoin (IDs connus depuis la section précédente,
mais certains sont Expired/Withdrawn/Sold — statut différent, priorité = actifs d'abord).
