# State — Journal de bord du tunnel agentique

Règle : une entrée par cycle (~6h de travail). On ne garde que les **18 dernières
heures** (≈3 cycles). Les cycles plus anciens sont fondus dans la ligne « Résumé
glissant » ci-dessous, puis supprimés — pour ne pas coûter de contexte.
Format d'entrée : `[AAAA-MM-JJ HH:MM] <tool/phase> | fait | tests | prochaine étape`.

## Résumé glissant (>18h)

- **Cycle 1 (2026-07-18)** — Tunnel agentique gravé ([[agentic-tunnel]]), `state.md`/
  `journalbug.md`/`CLAUDE.md` unifié/`tasks/README.md` créés. **Outil #1
  `kyc-company-enrichment`** (acteur `harvestapi/linkedin-company`, flag
  `APIFY_COMPANY_ENRICH`) : 35/35 tests, live OK, **déployé EC2** (PR #17, flag ON).
- **Cycle 2 (2026-07-20)** — QMD (BM25 local) installé et branché au tunnel (MCP `qmd`,
  collections memory/wiki/archive/tasks, [[qmd-rag-search]]). `qmd embed` indisponible
  (CPU sans GPU) → BM25 uniquement, `query`/`vsearch` désactivés.
- **Cycle 3 (2026-07-20)** — **Outil #2 `kyc-adverse-media`** (négative news AML, acteur
  `regdata/adverse-media-screener`) : 45/45 tests, déployé EC2, flag
  `APIFY_ADVERSE_MEDIA` OFF par défaut (~$0.14/lead).
- **Cycle 4 (2026-07-20)** — Adverse-media conditionné au contenu LinkedIn (≥600 car.)
  puis **activé ON** sur EC2 (47/47 tests). Outil #3 `fleet-content-audit` : EXPLORE fait
  (`tasks/fleet-content-audit/01_analysis.md`), **bloqué sur scrape-mcp déconnecté**,
  jamais repris depuis (pas de `02_plan.md`).
- **2026-08-13** — Fix MCP `qmd` : commande `cmd /c qmd mcp` (syntaxe Windows) invalide
  sous Linux → binaire direct dans `.mcp.json` (commit `e83e8b1`).
- **Cycles 5–9 (2026-08-14 → 2026-08-16)** — `yatco-global` : migrations Supabase,
  endpoint `GET /api/yatco-global`, collecteur OSINT, worker d'ingestion, dashboard
  frontend. Blocage Docker (`.dockerignore` whitelist stricte) diagnostiqué puis
  résolu (négations `!workers/`, `!scripts/yatco_collector.py`) — deux `docker build`
  validés verts le 2026-08-16. `wiki/YATCO-Global.md` créé. Tunnel formel
  (`tasks/yatco-global/`) jamais ouvert malgré plusieurs cycles de code.
- **Cycle 10 (2026-08-16 ~23:30)** — Déploiement distant collecteur+worker validé sur
  `ubuntu@51.44.220.145` via `workers/deploy/`, timer systemd 24h actif, smoke test
  distant OK, wiki à jour.
- **Cycle 11 (2026-08-17 ~01:06)** — Artefacts de déploiement + dashboard restauré
  commités et poussés (`418573d`→`b4513c3`) ; mode `check`/préflight ajouté à
  `deploy.py` (non commité) avec tests dédiés (65 passed/6 skipped) ; blocage
  `MOANA_SSH_KEY` absent en local identifié, ainsi qu'un écart plan/code sur les noms
  d'unités systemd réels.
- **Cycle 13 (2026-08-18 ~04:20)** — Déploiement distant complété sur
  `ubuntu@51.44.220.145` et vérifié (unités systemd actives, smoke test, suite
  backend 65+ passed) après résolution du blocage `MOANA_SSH_KEY` (fourni et
  validé) ; artefacts (`.dockerignore`, `.mcp.json`, `deploy.py` mode `check`,
  tests dédiés) restés non commités.
- **Cycle 15 (2026-08-19)** — Audit de 72 sessions Software Factory (89
  "blocked" en fait 70 "skipped" en cascade, nouveau statut dédié) ; 1re tâche
  factory simple validée de bout en bout + trace SQLite (`workflows/trace_db.py`) ;
  tiering réel décortiqué (`team_lead` non tiéré, suite pytest 772s/53% du run)
  → `team_lead` tiéré sur les 4 équipes, `scope_pytest_to_delta` limite la suite
  au delta si 100% `tests/**`. Côté `yatco-global` : `.env` Compose manquant en
  prod (`ConfigurationError`) corrigé dans `deploy.py` (transfert 0600 sans
  journalisation) ; session Software Factory bloquée en `BLOCKED_BY_SCOPE`
  (`scripts/yatco_collector.py` hors périmètre backend) puis relancée avec
  scope élargi (`20260819T141201-b98e8a`).
- **Cycle 16 (2026-08-19 20:42→2026-08-20 01:13)** — Health-check `deploy.py`
  réécrit pour les unités `Type=oneshot` (jugeait à tort
  `moana-yatco-ingest.service` en échec, sondait `ActiveEnterTimestamp`/
  `MainPID` remis à vide en fin de run réussi → bascule sur `InvocationID`/
  `ExecMainStartTimestamp`) ; `ingest_listings` met en dead-letter les annonces
  au type non-`dict`. 4 sessions Software Factory de déploiement prod
  bloquées/stallées (scope, health-check pré-fix, bug de sync tmux côté
  factory, corrigé en parallèle). Suite backend rouge (75 passed/6 skipped/
  10 failed, mocks `systemctl` désynchronisés) ; rien confirmé en prod à ce
  stade, artefacts non commités (confirmé et corrigé au Cycle 17).
- **Cycle 14 (2026-08-18 21:48→22:50, `dev/software_factory`, hors moana)** —
  Cause racine des blocages `MOANA_SSH_KEY` récurrents trouvée : pas un secret
  absent mais `tmux.mode=interactive` (panes long-vivants, jamais rafraîchis) →
  fix relais `env.sh` (0600) sourcé avant chaque commande agent. Imports SSSF :
  `enforce_declared_writes` (diff réel vs `build.json.changes` déclaré),
  continuation de session Builder (`--resume`), venv Python canonique `.venv/`
  créé à la racine moana (corrige `wiki/Crawl4AI.md`, obsolète sur ce poste).
  Incident : clé `MOANA_SSH_KEY` affichée en clair dans la conversation lors
  d'un test bugué, historique tmux nettoyé, rotation refusée par l'utilisateur.
- **Cycle 17 (2026-08-20 21:35→23:11)** — Health-check `deploy.py` + fix `.env`
  Compose (Cycles 15-16) confirmés en production (`Result=success`,
  `files=694 written=4435 dead_letters=2`). Bug trouvé et corrigé le même jour :
  la vue `yatco_selection_candidates` filtrait sur les dates publiées par
  YATCO (`source_created_at`/`source_updated_at`, quasi figées) au lieu de nos
  dates d'ingestion → 0 lignes retournées malgré 4438 annonces en base ;
  migration `20260820T1615` bascule sur `first_seen_at`/`updated_at`, 780
  lignes vérifiées en prod. Migration d'index `yacht_global_listings`
  (`20260820T2135`) créée mais pas encore appliquée en prod ni commitée. Suite
  backend locale toujours rouge (83 passed/7 skipped/12 failed, mocks
  `systemctl show` désynchronisés depuis Cycle 16, non corrigés).

## Cycles récents (<18h)

### [2026-08-20 21:35→2026-08-21 23:52] Cycle 18 — `yatco-global` : filtres/tri sur `yacht_global_listings`, bug de sync URL↔API trouvé et corrigé
- **Fait** : filtres (année de construction, longueur, zone géographique, prix
  min/max) + tri par défaut (plus récent d'abord) ajoutés à
  `app/dashboard/yatco-global/page.tsx`, `app/api/yatco-global/route.ts`,
  `lib/validations.ts`. Plusieurs sessions Software Factory sur la même
  demande (`20260820T213502`, `20260821T130636`, `20260821T135535` — toutes
  bloquées en tentative, T1 API validé mais T2 UI jamais passé proprement) :
  la synchronisation URL↔API ne reconstruisait les query params qu'à partir
  des filtres YATCO Global connus, perdant `sort`/`category`/autres déjà
  présents. Bug lié trouvé en test manuel : une valeur `length_m=0` restaurée
  depuis l'URL était envoyée telle quelle au schéma strict de validation et
  rejetée — corrigé en traitant `0` comme absence de filtre (omis de la
  requête API), fix appliqué directement (hors factory).
- **Tests** : `tests/frontend/yatco-global.test.ts` — 25 tests passent.
- **Prochaine étape** : appliquer la migration d'index `20260820T2135` en
  prod ; commiter `lib/validations.ts`, `lib/types.ts`,
  `app/api/yatco-global/route.ts`, `app/dashboard/yatco-global/page.tsx`,
  `tests/frontend/yatco-global.test.ts`.

### [2026-08-21 22:55→2026-08-22 ~20:00] Cycle 19 — `yatco-global` : bascule d'architecture vers un flux BOSS live à la demande, favoris persistés, brochure corrigée
- **Fait** : **pivot d'architecture** — le dashboard n'affiche plus les
  annonces via la table `yatco_global_listings` alimentée en continu par le
  collecteur/worker/timer systemd (déployés aux Cycles 5-17), mais interroge
  YATCO BOSS **à la demande** via bouton « Actualiser le flux live »
  (`lib/yatco-boss/live.ts`, SSH vers `ubuntu@51.44.220.145` où tourne
  `scrape-mcp`). Migration `20260822T0900__yatco_live_favorites_only` : ajoute
  `listing_snapshot` JSONB aux favoris, rend `listing_id` nullable, **supprime
  toutes les annonces non favorites de `yatco_global_listings`** — cette table
  ne sert plus qu'à conserver les favoris (avec snapshot pour affichage hors
  ligne), plus le flux complet. Favoris ajoutés en amont (migration
  `20260821T0900`) : tables `yatco_global_favorites`/`_favorite_history`,
  `lib/supabase/yatco-favorites.ts`, `/api/yatco-global/favorites` (+
  `[dedupKey]`). Brochure : bouton appelait `/forsale/pdf/custompdf/` (page de
  config broker, 404 hors interface) — remplacé par le workflow authentifié
  `quickpdf` → attente filestore → URL S3
  (`scripts/yatco-boss-brochure.mjs`, `/api/yatco-global/brochure`), testé
  avec un vrai PDF 6,86 Mo. Auth BOSS : cookie expirait avant le prochain
  cron de réauthentification (intervalle 27h > durée réelle du cookie) →
  intervalle réduit à 20h, scraper détecte maintenant une page de login au
  lieu de la convertir en liste vide. Filigrane logo Moana retiré du layout
  dashboard (`app/dashboard/layout.tsx`) — rendu envahissant/dépendant du
  cache. Procédure locale documentée pour `ENOSPC`/500 au dev (purge ciblée
  `.next`, jamais Supabase).
- **Tests** : détails bugs/tests dans `journalbug.md` (2026-08-22).
- **Question ouverte** : le timer systemd d'ingestion (collecteur+worker,
  Cycles 10-17) tourne-t-il encore sur EC2 ? Il devient redondant avec le flux
  live à la demande — décider s'il faut le désactiver ou le garder comme
  fallback avant de committer/déployer ce pivot.
- **Prochaine étape** : commiter les artefacts en attente (`lib/yatco-boss/`,
  `lib/supabase/yatco-favorites.ts`, `app/api/yatco-global/favorites/`,
  `app/api/yatco-global/brochure/`, migrations `20260821T0900`/`20260822T0900`,
  scripts `probe_auth.mjs`/`sync_yatco_boss_global.py`/
  `yatco-boss-brochure.mjs`/`yatco-boss-global-live.mjs`/
  `backfill_yatco_details.py`) ; trancher la question ci-dessus.

### [2026-08-21→2026-08-22, `dev/software_factory`, hors moana] Cycle 20 — Refactor factory après bascule orchestrateur GPT Sol (crashs fréquents)
- **Fait** : passage de l'orchestrateur à GPT Sol a provoqué crashs/perf
  dégradée ; diagnostic + fix de 4 causes racines : gate de verdict de test
  incohérent avec le résultat réel (`gate_test_verdict` outrepassé par le
  résultat brut `TestRunner`, filtrage des échecs sur commande de test
  optionnelle), boucle de réparation JSON, budgets de tentatives par tier,
  verrouillage de session. `notes` maxLength relevé de 600 à 1500 caractères
  (tronquait les diagnostics du Tester). Même schéma que le Cycle 14 : le
  vrai correctif est côté outillage factory, pas côté moana.
- **Tests** : 26 tests factory passent après refactor (suite dédiée, hors
  moana).
- **Prochaine étape** : observer que le prochain run réel confirme
  l'absence de régression (fait au Cycle 21, run commission calculator).

### [2026-08-22 19:41→19:52] Cycle 21 — Outil `commission` livré au dashboard via la factory (1er run bloqué par le bug de gate du Cycle 20, 2e run vert)
- **Fait** : nouvel outil `/dashboard/outils/commission` (calculateur de
  commission de courtage : prix de vente, taux de commission %, taux de TVA
  %) — `lib/commission.ts`, `app/dashboard/outils/commission/page.tsx`, lien
  nav desktop+mobile dans `components/layout/Header.tsx`. 1er run factory
  (`20260822T190208-cb18d7`, 927s, 3 tentatives) : le calcul de taux corrigé
  dès la tentative 2 (tests/typage/lint/build tous verts) mais **rejeté par
  le gate** à cause d'une commande de test optionnelle mal formée + notes
  tronquées à 600 caractères — root-cause identique aux fixes du Cycle 20.
  2e run (`20260822T194722-b2b11f`) après ces fixes : **passe en 1 tentative,
  278s**. `package.json` : script `"test": "tsx"` ajouté (attendu par le gate
  frontend de la factory).
- **Tests** : `tests/frontend/commission.test.ts` — 7/7 passent ; `tsc
  --noEmit` propre.
- **Prochaine étape** : commiter `lib/commission.ts`,
  `app/dashboard/outils/commission/`, `tests/frontend/commission.test.ts`,
  diff `Header.tsx`/`package.json`.

