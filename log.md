# Journal

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
