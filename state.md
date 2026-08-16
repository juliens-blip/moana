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
- **Cycles 5–7 (2026-08-14)** — `yatco-global` : migrations Supabase
  (`yatco_global_listings`/`yatco_scrape_runs`, critères 72h/26m/2010 sans plancher
  prix), endpoint `GET /api/yatco-global`, collecteur OSINT `scripts/yatco_collector.py`,
  worker d'ingestion `workers/yatco_ingest_worker.py`, dashboard frontend
  (`components/yatco-global/`, `app/dashboard/yatco-global/`). Conteneurisation Docker
  bloquée par `.dockerignore` (whitelist stricte n'autorisant ni `workers/` ni
  `scripts/yatco_collector.py`) — root cause posée et fix routé mais non exécuté sur ce
  cycle. Tunnel formel jamais ouvert (pas de `tasks/yatco-global/`), rien commité ni
  déployé.

## Cycles récents (<18h)

### [2026-08-16 ~14:30] Cycle 8 — `yatco-global` : fix `.dockerignore` appliqué, validation Docker en attente
- **Fait (non commité)** : fix `.dockerignore` appliqué localement : ajout des negations
  `!workers/` et `!scripts/yatco_collector.py` pour allowlister les nouveaux chemins
  (confirmé Git diff). Conteneurs `Dockerfile.yatco-collector` et
  `Dockerfile.yatco-worker` prêts à la validation.
- **État réel** : tous les fichiers non tracés du tunnel `yatco-global` (Cycles 5–7)
  sont présents localement (`workers/`, `supabase/`, `tests/backend/`,
  `app/api/yatco-global/`, `app/dashboard/yatco-global/`, `components/yatco-global/`,
  `lib/supabase/yatco-global.ts`) ; rien n'a été stagé ni commité ; rien n'est déployé
  sur EC2. Tous les fichiers documentaires (state/log/bugs/journalbug) ont été mis à
  jour pour les Cycles 5–7.
- **Prochaine étape** : valider que les deux `docker build` réussissent avec le nouvel
  `.dockerignore` (leçon [[journalbug]] 2026-08-14 Docker). Une fois vert, décider du
  formalisme tunnel (`tasks/yatco-global/02_plan.md`) avant staging/commit/déploiement.

### [2026-08-16 ~21:30] Cycle 9 — `yatco-global` : Docker validé vert, wiki créée, tunnel formel toujours absent
- **Fait** : les deux `docker build` (`Dockerfile.yatco-collector`,
  `Dockerfile.yatco-worker`) réussissent avec le `.dockerignore` corrigé du Cycle 8
  (images de test construites puis supprimées) — le blocage Docker du 2026-08-14 est
  résolu. `wiki/YATCO-Global.md` créé (pipeline collecte/ingestion/timer/déploiement/
  rollback, sans duplication opérationnelle, source de vérité = scripts). Backlink
  ajouté dans `wiki/Architecture.md`. Smoke test `tests/rag/test_rag_scope_smoke.py`
  ajouté (résout un avertissement ruff E902 sur ce dossier).
- **Tests** : `python -m pytest tests/backend/ tests/rag/` → 58 passed / 6 skipped
  (local, hors réseau). `ruff check scripts/` : 26 avertissements mineurs non bloquants
  (alias `re.S`/`re.I`), inchangé depuis Cycle 6.
- **État réel** : toujours rien commité ni déployé sur EC2 (voir `git status`) ;
  aucun `tasks/yatco-global/` — le tunnel formel (EXPLORE/PLAN) n'a jamais été ouvert
  pour cet outil malgré plusieurs cycles de code et documentation.
- **Prochaine étape** : formaliser `tasks/yatco-global/01_analysis.md`/`02_plan.md`
  (a posteriori) avant tout staging/commit, puis déploiement EC2 (timer systemd +
  script de déploiement déjà documentés dans `wiki/YATCO-Global.md`).

### [2026-08-16 ~23:30] Cycle 10 — `yatco-global` : déploiement distant validé
- **Fait** : déploiement distant collecteur+worker validé sur ubuntu@51.44.220.145 via workers/deploy/. Timer systemd 24h ordonné (collecte puis ingestion) configuré et actif. Pages wiki/YATCO-Global.md et wiki/Architecture.md mises à jour. Réindexation QMD lexicale effectuée (reindex).
- **Tests** : smoke test distant validé (smoke) avec succès.
- **État réel** : collecteur+worker et timer systemd 24h opérationnels sur instance ubuntu@51.44.220.145.
- **Prochaine étape** : suivi de l'exécution automatique 24h et monitoring des métriques d'ingestion.


