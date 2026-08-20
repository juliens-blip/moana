# Journal

## 2026-08-20

[2026-08-20] `yatco-global` : health-check `deploy.py` réécrit pour les unités `Type=oneshot`, suite de tests désynchronisée | `workers/deploy/deploy.py`, `workers/yatco_ingest_worker.py`, `tests/backend/test_yatco_ingest_worker.py`, `tests/backend/test_yatco_remote_smoke.py` (non commités), `state.md`, `bugs.md`, `journalbug.md` | `moana-yatco-ingest.service` traitait les données avec succès mais le health-check le déclarait en échec (sondait `ActiveEnterTimestamp`/`MainPID`, remis à vide par un oneshot terminé) ; `trigger_and_verify_unit` juge désormais sur `InvocationID`/`ExecMainStartTimestamp` ; `ingest_listings` met en dead-letter toute annonce dont le type n'est pas un `dict` ; 4 sessions Software Factory sur le déploiement prod bloquées/échouées/stallées (scope, health-check pré-fix, bug de synchronisation tmux côté factory) ; suite backend locale à 75 passed/6 skipped/**10 failed** (mocks `test_deploy_env.py`/`test_deploy_service_trigger.py` non mis à jour sur les nouvelles propriétés `systemctl show`)

## 2026-08-19

[2026-08-19] `yatco-global` : `.env` Compose manquant en prod corrigé dans `deploy.py`, scope backend élargi après blocage Software Factory | `workers/deploy/deploy.py` (non commité), `state.md`, `bugs.md`, `journalbug.md` | `moana-yatco-ingest.service` échouait avec `ConfigurationError` (Supabase env manquantes) ; `deploy.py` étendu pour transférer un `.env` Compose temporaire 0600 vers l'hôte distant sans journaliser les secrets ; session Software Factory `20260819T131649-454095` bloquée en `BLOCKED_BY_SCOPE` (`scripts/yatco_collector.py` hors périmètre backend), relancée avec scope élargi (`20260819T141201-b98e8a`, en cours) ; suite backend locale 71 passed/6 skipped

## 2026-08-18

[2026-08-18] `yatco-global` : déploiement complété et vérifié, blocage SSH résolu | `state.md`, `bugs.md`, `journalbug.md` | Cycle 13 rapid-fire (00:12–04:20) : préflight validé, unités systemd actives sur ubuntu@51.44.220.145, smoke tests et pytest backend complétés ; `MOANA_SSH_KEY` fourni et actif ; service collecteur + ingestion + timer opérationnels ; artefacts en attente de commit (`.dockerignore`, `.mcp.json`, `workers/deploy/deploy.py` mode `check` + tests)

## 2026-08-17

[2026-08-17] `yatco-global` : blocage `MOANA_SSH_KEY` persistant, `.mcp.json` reconfiguré | `.mcp.json`, `state.md`, `bugs.md`, `journalbug.md` | ~15 tentatives d'orchestration Software Factory dans la journée (01h→23h32) redécomposent la même tâche de déploiement et se reheurtent systématiquement à l'absence de `MOANA_SSH_KEY` en local, sans progrès ni escalade ; leçon consignée dans `journalbug.md` ; `.mcp.json` reconfiguré (env `qmd` explicite, serveur `memory` ajouté, `context7`/`shadcn` retirés) ; aucun nouveau code livré, suite backend toujours verte (65 passed/6 skipped)

[2026-08-17] `yatco-global` : artefacts de déploiement et dashboard restauré, commités et poussés | `workers/deploy/`, `supabase/apply_migration.py`, `supabase/check_connection.py`, `supabase/migrations/`, `app/dashboard/market-pulse/`, `app/dashboard/market-trends/`, `app/dashboard/yatco-global/`, `app/dashboard/listings-yatco/`, `components/listings/`, `components/yatco-global/`, `components/layout/Header.tsx` | Commits `418573d`→`b4513c3` poussés sur `origin/main` : scripts d'application de migrations Supabase, migrations `yatco_global_listings` avec `down.sql` idempotents, dashboard restauré (market pulse, market trends, audit flotte YATCO)

[2026-08-17] `yatco-global` : mode `check`/préflight ajouté à `deploy.py`, blocage `MOANA_SSH_KEY` confirmé | `workers/deploy/deploy.py`, `tests/backend/test_deploy_preflight.py`, `tests/backend/conftest.py` (non commités) | Ajout de `REQUIRED_UNITS`/`check_local_units`/`check_ssh_connection`/`run_check` pour valider clé SSH, connexion et unités systemd sans exposer de secret ; tests déterministes (clé SSH factice injectée par variable d'environnement) ; suite backend 65 passed/6 skipped ; préflight réel contre l'hôte distant toujours bloqué par l'absence de `MOANA_SSH_KEY` en environnement local, et écart identifié entre un plan référençant `moana-yatco-ingest.service` et les noms d'unités réels

## 2026-08-16

[2026-08-16] `yatco-global` : déploiement distant validé sur ubuntu@51.44.220.145 | `state.md`, `log.md`, `workers/deploy/` | Déploiement distant du collecteur et worker validé sur ubuntu@51.44.220.145 via workers/deploy/ ; timer systemd 24h (collecte puis ingestion) configuré ; smoke test distant validé ; wiki à jour et réindexation QMD lexicale effectuée (reindex) ; sans recopie d'artefacts.


[2026-08-16] `yatco-global` : validation Docker verte, documentation wiki créée | `state.md`, `bugs.md`, `journalbug.md`, `wiki/YATCO-Global.md`, `wiki/Architecture.md`, `tests/rag/test_rag_scope_smoke.py` | Les deux `docker build` (`Dockerfile.yatco-collector`, `Dockerfile.yatco-worker`) réussissent avec le `.dockerignore` corrigé du Cycle 8 — bug Docker passé à `#fix #done` ; page wiki de bout en bout créée (collecte/ingestion/timer/déploiement/rollback) avec backlink depuis `Architecture.md` ; tests backend+rag 58 passed/6 skipped ; toujours rien commité ni déployé sur EC2, `tasks/yatco-global/` (EXPLORE/PLAN) toujours absent

[2026-08-16] Audit et mise à jour de la documentation du tunnel agentique | `state.md`, `bugs.md`, `log.md` | Cycle 8 ajouté (2026-08-16) ; fix `.dockerignore` confirmé appliqué localement (allowliste `workers/` et `scripts/yatco_collector.py`) ; bug Docker passé de `#blocked` à `#in-progress` ; tous les fichiers non tracés du tunnel `yatco-global` confirmés présents, rien commité ni déployé ; validation Docker et formalisme `tasks/yatco-global/` restent prochaines étapes

## 2026-08-15

[2026-08-15] `yatco-global` : worker d'ingestion et dashboard frontend livrés, conteneurisation Docker toujours bloquée | `workers/yatco_ingest_worker.py`, `workers/docker/` (Dockerfiles collector/worker + compose), `components/yatco-global/`, `app/dashboard/yatco-global/` | Sessions Software Factory `20260814T205236-114e94` et `20260814T211920-9cc86f` (done) : worker et section dashboard 72h/delta prix passés ; `docker build` échoue toujours (`.dockerignore` racine n'allowliste pas `workers/`) — session correctrice `20260814T232658-b9643e` routée mais non exécutée (bug consigné dans `journalbug.md`) ; tests backend locaux 57 passed/3 skipped ; rien commité ni déployé

## 2026-08-14

[2026-08-14] Documentation de l’infrastructure RAG/MCP Memory | `rag_mcp_memory.md`, serveur MCP local, SQLite WAL, configurations multi-LLMs et timer systemd | Architecture, tests de concurrence et limite Claude documentés

[2026-08-14] Nouveau serveur MCP `memory` (graphe conceptuel) branché au projet | `.mcp.json` (serveur `memory` ajouté, env `HOME`/`PATH` ajouté sur tous les serveurs), `memory/README.md`, `memory/graph.db` | Graphe SQLite WAL servi par `software_factory/memory_server.py`, complémentaire à QMD (BM25) qui reste la recherche RAG de référence ; changement non commité

[2026-08-14] Ébauche outil `yatco-global` (listings YATCO mondiaux dédupliqués) | `supabase/migrations/20260814T0031__yatco_global_listings*.sql`, `app/api/yatco-global/route.ts`, `lib/supabase/yatco-global.ts`, `lib/types.ts`, `lib/validations.ts`, `tests/backend/` | Endpoint `GET /api/yatco-global` filtrable prix/fraîcheur/pays avec pagination ; tests backend 20/21 OK (1 skip, DB live non configurée en local) ; pas de dossier `tasks/` ni commit — tunnel agentique non tracé formellement, rien déployé

[2026-08-14] Critères de sélection `yatco-global` corrigés + collecteur OSINT ajouté | `supabase/migrations/20260814T1930__replace_yatco_selection_criteria*.sql`, `scripts/yatco_collector.py`, `scripts/test_yatco_collector.py`, `scripts/fixtures/` | Critères en vigueur : fenêtre glissante 72h créa/modif, longueur > 26 m, année ≥ 2010, aucun plancher de prix (remplace 24h/prix>2M$) ; collecteur paginé avec throttling et reprise sur erreur ; tests backend 47 passed/3 skipped ; worker d'ingestion idempotent bloqué au routing (voir `journalbug.md`) puis relancé (session Software Factory `20260814T202649-c0bd78`, non exécutée à ce stade) ; rien commité ni déployé

## 2026-08-13

[2026-08-13] Correction du serveur MCP `qmd` sous Linux | `.mcp.json` (commit `e83e8b1`) | Commande `cmd /c qmd mcp` (syntaxe Windows) invalide sous Linux, remplacée par le binaire direct `qmd`

## Historique condensé

De décembre 2025 à février 2026 : migration Airtable vers Supabase, ajout du CRM leads, des listes « à suivre » et « chantier », puis mise en place d’outils d’orchestration multi-agents. Détails utiles dans [[Legacy]].

De juillet 2026 (15 au 18) : bascule KYC vers un pipeline déterministe puis un worker asynchrone (Vercel → Crawl4AI/EC2) ; LinkedIn migré vers Apify après échecs proxy/session ; filtrage OpenSanctions par lead ; résumé exécutif KYC en template structuré ; exploration BOSS/YATCO via scrape-mcp (Search MLS, Insight Analytics, stats par bateau) ; mise en place du tunnel agentique (`state.md`/`journalbug.md`/`tasks/`) et outil #1 `kyc-company-enrichment` déployé EC2. Détails dans l'historique git et la mémoire QMD.
