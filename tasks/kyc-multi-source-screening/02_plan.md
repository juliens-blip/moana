# Plan — KYC multi-source screening

## Phase 1 — Tests isolés

- Tester Crawl4AI sur domaine email, page contact, about/team, sitemap et registre lié; ajouter une BFS same-host de 3–5 pages avant tout adaptateur externe.
- Tester OpenSanctions/Yente avec noms connus, homonymes, personne + pays/entreprise et entreprise seule. Sans clé, documenter `401` et ne pas scraper l’interface web comme API.
- Tester `linkedin_scraper` sans session puis avec une session explicitement autorisée si l’utilisateur la fournit; mesurer erreurs et absence de données.
- Installer `scrape-mcp` dans un environnement temporaire; valider les six outils, schémas MCP, timeouts, 403/429 et limites.
- Tester `pratik-dani/LinkedIn-Scraper` dans `D:\temp` : clone, `npm install`, `npm run build`, inspection des scripts, smoke test sans token et mesure du processus.

## Phase 2 — Comparaison

Pour chaque moteur : précision d’attribution, sources directes, latence p50/p95, mémoire, taux d’échec, coût, licence et niveau de maintenance. Les résultats seront classés `usable`, `fallback` ou `reject`.

Résultat initial : Crawl4AI `usable` pour sites d’entreprise après BFS same-host; SearXNG `fallback` pour extraits; OpenSanctions `blocked_pending_license`; LinkedIn scraper et scrape-mcp `reject_as_anonymous_fallback`.

Le parallélisme actuel double les requêtes SearXNG et peut saturer ses moteurs. Les recherches doivent être sérialisées ou protégées par un sémaphore global, avec métriques par étape. Les résultats PDF peuvent être conservés comme extraits de recherche bornés, même si Crawl4AI ne les ouvre pas.

Le dépôt `pratik-dani/LinkedIn-Scraper` est classé `reject_as_worker` : installation des dépendances réussie dans un clone propre, build non reproductible sans corriger ses peer-dependencies et son prérendu React, absence de protocole MCP/HTTP documenté, session LinkedIn locale obligatoire. Aucun acteur distant ni proxy payant n’a été déclenché pendant l’audit.

## Phase 3 — Architecture cible

1. Résoudre le domaine email et l’entreprise potentielle.
2. Crawl4AI sur sources publiques d’entreprise et registres.
3. OpenSanctions/Yente sur personne et entreprise avec seuils prudents, uniquement après clé/licence; conserver `id`, score, explications, datasets et URLs sources.
4. SearXNG pour découverte et extraits publics, sans les présenter comme crawl complet.
5. LinkedIn uniquement comme source autorisée ou indice de recherche; jamais comme preuve isolée.
6. Normaliser les preuves dans le contrat KYC existant, avec cinq sources maximum et résumé CRM de quatre phrases.

## Phase 4 — Implémentation contrôlée

- Produire un rapport de tests reproductible.
- Ajouter les adaptateurs validés derrière des timeouts et feature flags.
- Ajouter d’abord `company_domain_bfs` : same-host uniquement, liens contact/about/team/legal/press, 3–5 pages, déduplication et extraction de faits entreprise.
- Ajouter les extraits SearXNG/PDF comme preuves `other` ou `company_website` sans prétendre qu’ils ont été crawlés.
- Ajouter tests unitaires, contractuels MCP, sécurité SSRF, homonymes et non-régression.
- Déployer d’abord en dry-run AWS, puis fusionner uniquement après validation humaine.
