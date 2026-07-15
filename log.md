# Journal

## 2026-07-15

[2026-07-15] Audit de la documentation et de l’état réel du dépôt | Racine, `docs/`, `tasks/`, routes et modules Supabase lus | Plan de consolidation validé

[2026-07-15] Création de la mémoire compacte | `index.md`, `bugs.md`, `wiki/*`, `archive/Legacy.md`, `raw/` | Point d’entrée Obsidian et connaissance stable

[2026-07-15] Installation et validation de Crawl4AI 0.9.2 | Python 3.11 utilisateur, Playwright/Patchright | Setup, doctor et crawl Markdown réussis sans dépendance projet

[2026-07-15] Création de la mémoire Crawl4AI | `wiki/Crawl4AI.md`, `index.md`, `log.md` | Fichier dédié justifié par le runtime Python 3.11 et le workflow de collecte vers `raw/`

[2026-07-15] Ajout du cahier KYC/OSINT yacht et de l’objectif CRM Supabase | `wiki/KYC-OSINT.md`, `wiki/Crawl4AI.md`, `wiki/Decisions.md`, `wiki/Roadmap.md`, `index.md` | Contrat JSON, règles anti-hallucination et future intégration mémorisés

[2026-07-15] Création du schéma KYC Supabase sans exécution distante | `scripts/kyc-enrichment-schema.sql`, `wiki/KYC-OSINT.md`, `wiki/Decisions.md`, `wiki/Roadmap.md` | Historique JSON, queue automatique par lead et RLS serveur uniquement

[2026-07-15] Implémentation du worker KYC asynchrone | `scripts/kyc_worker.py`, `scripts/requirements-kyc.txt`, `tests/test_kyc_worker.py`, mémoire wiki | Claim Supabase, crawl borné, synthèse LiteLLM, validation prudente et persistance JSON

[2026-07-15] Validation locale du worker sans données réelles | 5 tests unitaires, compilation Python, dry-run `example.com` | Tests réussis; configuration Supabase/LLM locale encore absente

[2026-07-15] Réduction des consignes et de l’accueil | `CLAUDE.md`, `README.md` | Règles sous 150 lignes, aucun secret documenté

[2026-07-15] Fusion des anciennes notes d’architecture et de migration | `docs/*.md`, rapports et guides racine → `wiki/*`, `archive/Legacy.md` | Ancien état Airtable séparé de l’état Supabase

[2026-07-15] Fusion de l’historique des tâches | `tasks/*/*.md` → `wiki/Decisions.md`, `wiki/Roadmap.md`, `archive/Legacy.md` | Plans et journaux redondants retirés

[2026-07-15] Suppression des rapports de tests, correctifs, handoff et sauvegardes fusionnés | Sources listées dans `archive/Legacy.md` | Forte baisse du volume documentaire actif

[2026-07-15] Suppression des logs et dumps sans valeur durable | Logs racine, `test-results/test-summary.txt` | `raw/` laissé vide

[2026-07-15] Activation du KYC déterministe Vercel sans LLM | Backend leads, `/api/leads/[id]/kyc`, fiche CRM, tests et wiki | Nouveau lead contrôlé automatiquement; résumé prudent stocké dans Supabase et visible avec la demande

[2026-07-15] Stabilisation de la collecte KYC Vercel | `lib/kyc/deterministic.ts`, tests et mémoire KYC | Mojeek retiré; sources structurées, filtre exact, requêtes séquentielles et panne fournisseur visible

[2026-07-16] Activation de Crawl4AI dans Vercel | `api/kyc-crawl.py`, worker Python, backend KYC, configuration Vercel, tests et wiki | Collecte HTTP bornée sans Render ni LLM obligatoire; rapport sourcé stocké dans Supabase

[2026-07-16] Correction de l’authentification KYC inter-fonctions | Endpoint Python, appel Node, tests et bugs | Jeton interne dérivé dans un en-tête privé; suppression du 401 transformé en 500 côté CRM

[2026-07-16] Correction du routage KYC Vercel | `lib/supabase/kyc.ts`, bugs et log | Alias Production prioritaire; évite le 401 de protection sur l’URL unique du déploiement

[2026-07-16] Affichage du dossier KYC détaillé et classement prudent des homonymes | Fiche client, worker, tests et mémoire KYC | Profil, entreprise, contrôles et sources cliquables; proximité yachting priorisée sans confirmer l’identité

## Historique condensé

De décembre 2025 à février 2026 : migration Airtable vers Supabase, ajout du CRM leads, des listes « à suivre » et « chantier », puis mise en place d’outils d’orchestration multi-agents. Détails utiles dans [[Legacy]].
