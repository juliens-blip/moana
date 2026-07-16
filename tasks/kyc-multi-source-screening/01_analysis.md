# Analyse — KYC multi-source screening

## Contexte

Le worker AWS sépare déjà la découverte SearXNG du crawl Crawl4AI. Il produit un résumé CRM de 3–4 phrases et conserve cinq sources maximum. Le crawl direct LinkedIn a été testé avec HTTP et Playwright : LinkedIn renvoie une page anti-bot, même lorsque le pré-contrôle `robots.txt` est désactivé. Les extraits publics SearXNG restent exploitables pour les titres et liens.

## Besoin

- Exploiter le domaine d’un email pour enrichir d’abord l’entreprise : site, équipe, registres, presse et activité.
- Ajouter un contrôle sanctions/PEP avec une source dédiée, sans transformer une correspondance homonyme en hit.
- Comparer plusieurs moteurs de scraping sans multiplier les dépendances ou contourner authentification/CAPTCHA.
- Mesurer fiabilité, latence, mémoire, coût, licences et qualité des sources avant intégration CRM.

## Pistes à tester

1. Crawl4AI : pages publiques d’entreprise et registres, avec filtrage SSRF, limites de pages et sources directes.
2. OpenSanctions/Yente : `/match` pour screening, `/search` uniquement pour exploration; vérifier clé/API, auto-hébergement et licence commerciale.
3. `linkedin_scraper` : uniquement avec session LinkedIn autorisée; tester l’expiration de session et les erreurs sans stocker de credentials.
4. `scrape-mcp` : vérifier MCP Inspector, schémas, limites et comportement sur pages JS/403; ne pas l’utiliser comme contournement LinkedIn.

## Contraintes

- Aucun secret dans le dépôt ou les rapports.
- Données publiques et traçables; pas de fusion d’homonymes sans signaux convergents.
- Le rapport reste une aide à la décision humaine, jamais une conclusion de conformité.
- Toute intégration commerciale OpenSanctions doit être validée au regard de sa licence de données.

## État

## Résultats des audits

- **Crawl4AI / entreprise** : le domaine professionnel est bien découvert, mais le worker ne fait actuellement qu’un crawl de la racine. Un test sur `nicolositrasporti.com` a trouvé une société, activité, adresse et P.IVA sur la page d’accueil, sans remplir le bloc entreprise; les liens same-host `Società`, `Sedi`, `Press`, `Core Business` et `Contatti` doivent être parcourus avec une limite de 3–5 pages.
- **Découverte** : les moteurs SearXNG peuvent être temporairement ralentis ou limités (Brave 429, Google challenge, DDG timeout). Il faut instrumenter les étapes et ne pas confondre échec de recherche et échec Crawl4AI.
- **OpenSanctions** : `GET /healthz` est public et répond 200; `/search` et `/match` répondent 401 sans clé. La documentation recommande `/match` pour le screening, pas `/search`. Le service hébergé nécessite une clé et une licence de données commerciale; le code Yente est MIT mais les données restent sous licence. L’auto-hébergement demande Elasticsearch/OpenSearch, au moins ~8 Go RAM/~60 Go disque et une licence/provisioning; le t3.small actuel est insuffisant.
- **LinkedIn** : `linkedin_scraper` nécessite une session authentifiée et ne constitue pas un fallback anonyme. `scrape-mcp` apporte un moteur hybride/MCP mais reste soumis aux mêmes protections et ajoute Node/Playwright; il n’est pas nécessaire dans le worker avant un test contractuel séparé.
- **LinkedIn public** : un GET AWS sur un profil public de test a répondu 200 avec JSON-LD/meta, tandis que Gaetano Nicolosi a répondu 999/authwall. La disponibilité dépend donc du profil et de l’IP; un 200 peut être parsé, un 999 doit rester `non trouvé`/ambigu.
- **MCP** : le clone `scrape-mcp` est MIT mais son build temporaire n’a pas été validé (installation npm interrompue et `tsc` absent). Il respecte `robots.txt` par défaut et n’apporte pas de solution LinkedIn.
- **Entreprise Nicolosi** : un crawl same-host limité expose `la Société`, `les Sedi`, `Press` et `Contatti`, avec activité, création, siège, téléphone, email et P.IVA. Ces pages sont plus fiables et plus utiles commercialement que le profil LinkedIn bloqué.

## Décision provisoire

Le premier gain fiable est le crawl same-host de l’entreprise liée au domaine email. OpenSanctions est bloqué jusqu’à obtention d’une clé/licence ou choix explicite d’un jeu de listes officielles auto-géré. LinkedIn reste un indice de recherche ou une source autorisée, jamais une preuve isolée.

## Sous-audit `pratik-dani/LinkedIn-Scraper`

Le dépôt annoncé est une application/client Open Source avec compilation npm et interface HTTP, nécessitant un compte LinkedIn valide. Il ne doit pas être confondu avec une API LinkedIn officielle ni avec un serveur MCP. L’audit vérifie les scripts réels, la licence, la présence d’un serveur HTTP/MCP, la gestion des cookies et le comportement sans token.

Audit exécuté dans `D:\temp\linkedin-scraper-pratik-clean` : le dépôt est Electron/Nextron, sous licence AGPL-3.0, sans SDK MCP ni serveur HTTP de worker. Il appelle les endpoints LinkedIn Voyager et conserve des cookies/session dans une base SQLite locale. `npm install --ignore-scripts` a réussi après activation de la CA système; le build a atteint Next mais échoue sur des dépendances MUI absentes puis sur des erreurs React/prérendu. Aucun token ni compte n’a été utilisé. Classement : `reject_as_worker`, éventuellement utilisable comme application opérateur locale après revue de licence et session.

## Sous-audit `joeyism/linkedin_scraper` (PyPI `linkedin-scraper` 3.1.2)

Installation isolée validée dans `D:\temp\linkedin-python-test\.venv` : `linkedin-scraper==3.1.2`, Playwright et Chromium. Les imports `BrowserManager`, `PersonScraper`, `CompanyScraper` et `JobSearchScraper` passent. Une navigation headless vers `/login` répond 200; la sauvegarde/recharge d’un contexte Playwright fonctionne (8 cookies de session publique). Un appel `PersonScraper` sans session authentifiée échoue proprement avec `ScrapingError: Not logged in`, et un fichier de session absent renvoie `FileNotFoundError`.

Classement : `fallback_authorized_session`, pas un moteur anonyme. L’utilisation nécessite une session créée manuellement (`wait_for_manual_login`), conservée hors Git/Supabase et renouvelée en cas d’expiration, avec faible volume et revue des conditions LinkedIn. Aucun identifiant, cookie ou compte n’a été utilisé pendant le test. Ne pas intégrer au worker tant qu’un test manuel autorisé n’a pas confirmé le profil cible et la stabilité de la session.
