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

[2026-07-16] Ajout d’une capacité de clic/interaction au MCP scrape-mcp | `D:\dev\scrape-mcp\src\engines\browser.ts`, `src\tools\interact.ts`, `src\index.ts`, mémoire du projet | Nouvel outil `interact` (Playwright click/fill/select/press/wait) pour débloquer les modules AJAX de BOSS (Search, Insight Analytics, Vessel Stats) restés vides sous simple scraping

[2026-07-16] Découverte de l’URL de recherche MLS complète de BOSS | mémoire du projet (`yatco-boss-scraping-quirks.md`) | Le module Search fonctionne en `scrape` simple via l’URL exacte du lien de nav (`?code=` en base64) sans clic; 6372 annonces réelles accessibles, filtre prix/localisation encore non résolu

[2026-07-16] Correction d’un bug de scrape-mcp qui masquait de vrais menus sur BOSS | `D:\dev\scrape-mcp\src\processing\content-cleaner.ts`, mémoire et bugs du projet | `button` retiré de la liste de suppression; les menus « vides » (Search Category, Insight Analytics, actions d’annonce) contenaient en réalité de vrais boutons cliquables (Listing History, Photos, etc.), confirmé par capture d’écran

[2026-07-16] Localisation du rapport BOSS des impressions/vues publiques par bateau | `content-cleaner.ts` (retrait de `form`), mémoire du projet | Insight Analytics → Fleet/Inventory → "YATCO.com Vessel Statistics Report" expose Impressions/Detail Views/Phone Clicks/Gallery Views/Leads par bateau; filtre Office/Broker requis, pas encore rempli

[2026-07-16] Extraction réussie des stats d'impressions par bateau (7 derniers jours) | mémoire du projet (`scrape-mcp-interact-tool.md`) | Filtre Kendo "Office" rempli via clic + flèche-bas/entrée (le clic direct sur l'option échouait); 20 bateaux avec impressions/vues/leads récupérés pour Moana Yachting

[2026-07-16] Préparation du worker KYC sur VPS AWS | `Dockerfile.kyc`, `compose.kyc.yml`, backend KYC, fiche CRM, worker et mémoire | Vercel enqueue sans crawler; traitement Crawl4AI/Chromium asynchrone, suivi automatique et reprise des tâches interrompues

[2026-07-16] Déploiement du worker KYC AWS | EC2 Ubuntu 26.04, Docker, PR #3, Supabase et Vercel | Crawl Chromium et connexion queue validés; worker permanent actif sans port public, déploiement Vercel réussi

[2026-07-16] Correction découverte KYC AWS | worker, Compose, SearXNG, tests et mémoire | Métamoteur privé gratuit validé sur EC2; 3 sources Crawl4AI pour le test Gaetano Nicolosi, homonymes conservés séparément

[2026-07-16] Tour complet des données disponibles dans YATCO BOSS | mémoire du projet (`moana-boss-business-data-tour.md`) | 173 annonces historiques cataloguées, pipeline CRM à 0 sur toutes les étapes avancées (226 leads jamais qualifiés), 34 salons nautiques disponibles mais aucun bateau Moana inscrit, benchmarks marché 5 ans récupérés

[2026-07-16] Extraction des flux de marché MLS en temps quasi-réel (Search) | mémoire du projet (`moana-boss-business-data-tour.md`) | 257 annonces modifiées, 46 nouvelles (dont 2 de Moana), 5 ventes mondiales sur 5 jours, dernières 5 jours, tous courtiers confondus

[2026-07-17] Adaptateur LinkedIn authentifié ajouté au worker KYC | `scripts/linkedin_compat.py`, `scripts/kyc_worker.py`, `compose.kyc.yml`, dépendance et tests | Session optionnelle montée en lecture seule, un profil/job, détection rate-limit stricte; aucun secret ajouté au dépôt
[2026-07-17] Test LinkedIn réel Gaetano Nicolosi | profil `gaetano-nicolosi-22211433`, session locale | HTTP 999; fallback public conservé, aucun contournement supplémentaire
[2026-07-17] Test LinkedIn réel Foulques de Raigniac | profil `foulques`, session locale | HTTP 999; profil public trouvé mais accès authentifié bloqué, fallback conservé
[2026-07-17] Test Crawl4AI recherche OpenSanctions | URL publique `/search/?q=Gaetano+Nicolosi`, venv local | `robots.txt` refuse le crawl; aucun contournement, SearXNG/API conservés

[2026-07-17] Proxy Webshare pour LinkedIn testé et documenté | `scripts/linkedin_compat.py`, `scripts/kyc_worker.py`, `Dockerfile.kyc`, `.dockerignore`, `tasks/kyc-multi-source-screening/proxy.md`, PR #6/#7 | Routage proxy vérifié fonctionnel (IP de sortie confirmée) mais HTTP 999 persiste sur LinkedIn; deux bugs de déploiement préexistants corrigés au passage; piste proxy abandonnée au profit d'Apify

[2026-07-17] LinkedIn migré vers Apify (`harvestapi/linkedin-profile-search-by-name`) | `scripts/apify_linkedin.py` (nouveau), suppression de `scripts/linkedin_compat.py` et `linkedin-scraper`, `kyc_worker.py`, `Dockerfile.kyc`, `.dockerignore`, `compose.kyc.yml`, `tests/test_kyc_worker.py`, `wiki/KYC-OSINT.md`, `tasks/kyc-multi-source-screening/proxy.md` | Recherche par nom sans session/proxy à gérer; testé en local sur Gaetano Nicolosi (profil retrouvé, $0.004/recherche mode Short); déploiement EC2 pas encore fait

[2026-07-18] Filtrage sanctions OpenSanctions par lead, carte distincte du KYC | `scripts/opensanctions-schema.sql`, `lib/sanctions/types.ts`, `lib/supabase/sanctions.ts`, `app/api/leads/[id]/sanctions/route.ts`, `lib/supabase/leads.ts`, `app/api/leads/yatco/route.ts`, `lib/types.ts`, `components/leads/LeadDetailModal.tsx`, `.env.local` | Appel synchrone à l'API Screening payante d'OpenSanctions (0,10 €/requête) après chaque nouveau lead, licence CC BY-NC du bulk export écartée car usage commercial (screening clients); vocabulaire prudent hérité du KYC, clé `OPENSANCTIONS_API_KEY` restant à fournir par l'utilisateur

[2026-07-18] Résumé exécutif KYC LinkedIn allégé et enrichi | `scripts/apify_linkedin.py`, `scripts/kyc_worker.py`, `tests/test_kyc_worker.py`, `tasks/kyc-multi-source-screening/cahier-des-charges-linkedin.md` | Ligne « Sanctions et PEP non conclusifs… » routinière retirée (conservée uniquement si sanctions_db/pep_db trouve une correspondance) ; localisation LinkedIn et extrait du "about" ajoutés à la ligne d'activité ; testé en réel sur Daniel Weitmann (about) et Gaetano Nicolosi (localisation), 25 tests unitaires OK

[2026-07-18] Correction collision URL LinkedIn par sous-domaine pays | `scripts/kyc_worker.py` (`canonical_url`), `tests/test_kyc_worker.py` | `it.linkedin.com`/`fr.linkedin.com` (chemins `/in/`) normalisés vers `www.linkedin.com` ; le profil enrichi Apify et un snippet SearXNG du même profil fusionnent au lieu de concourir, la source riche l'emporte

[2026-07-18] Résumé exécutif KYC en template structuré (Métier / Entreprise / Rôle et missions / Localisation) | `scripts/apify_linkedin.py`, `scripts/kyc_worker.py`, `components/leads/LeadDetailModal.tsx`, `tests/test_kyc_worker.py` | `currentPosition` (titre, entreprise, description) émis en lignes préfixées `Métier:`/`Entreprise:`/`Missions:` ; résumé reconstruit en champs distincts sous la ligne d'attribution (garde-fou homonyme conservé) ; cap résumé 4→8 (backend `normalize_report` et modal) ; 28 tests unitaires OK

## Historique condensé

De décembre 2025 à février 2026 : migration Airtable vers Supabase, ajout du CRM leads, des listes « à suivre » et « chantier », puis mise en place d’outils d’orchestration multi-agents. Détails utiles dans [[Legacy]].
