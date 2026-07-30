# Journalbug — Bugs rencontrés au testing agent

But : référencer chaque bug détecté par l'agent `test-code` pour ne pas le
reproduire. Une ligne normalisée par bug. Quand le fichier grossit trop, résumer
les patterns récurrents dans « Leçons » et supprimer les lignes brutes anciennes.

Format : `[AAAA-MM-JJ] <tool> | symptôme | cause racine | fix | leçon`.

## Leçons (patterns récurrents)

- `apify_client` StoreListActor est un objet pydantic : accès par attribut
  (`a.name`, `a.title`, `a.stats.total_runs`), jamais `.get()`.
- Environnement local : SSL strict échoue (litellm, curl) → utiliser `curl -k` /
  UTF-8 file pour diagnostics ; jamais en prod.
- Tests worker KYC : lancer avec `py -3.11` + `PYTHONPATH="repo:repo/scripts"`
  (import sibling `apify_linkedin`), pas `python` (3.14 sans deps).
- Apify `.call(...)` : passer `timeout=timedelta(...)`, JAMAIS `timeout_secs=` (TypeError).
- Objet Apify `Run` = pydantic : `run.default_dataset_id` / `run.status` (jamais `run.get()`).

## Bugs bruts

- [2026-07-22] yatco-stats | `tsc --noEmit` échoue sur `yatco_vessel_id` et `YatcoListingStats` absents des contrats partagés | le WIP UI/API/service a été ajouté sans synchroniser `lib/types.ts` | compléter les contrats puis rejouer lint, type-check, build et tests fonctionnels | leçon : un nouveau schéma Supabase doit avoir son type partagé avant tout branchement UI.
- [2026-07-22] market-trends | composants présents mais route, navigation et exports absents ; `Tooltip.formatter` incompatible avec Recharts strict | feature interrompue après les artefacts d’analyse et de schéma | terminer le câblage page/service/exports/nav et typer le formatter nullable | leçon : vérifier la surface de navigation et le build avant de déclarer une feature livrée.
- [2026-07-22] cybersecurity | authentification par secret clair, cookie JSON forgeable, logs sensibles, routes debug et backup de credentials détectés | héritage de l’authentification provisoire | migrer vers hash/session signée, supprimer les diagnostics publics, faire tourner les credentials et protéger le webhook | leçon : aucune feature métier ne passe en production tant que le contrôle d’identité n’est pas cryptographiquement fiable.
- [2026-07-22] build | `next build` échouait au téléchargement de Montserrat/Lato avec erreur TLS et signalait un import legacy `getSession` | dépendance à Google Fonts pendant le build et shim d'auth ambigu dans les pages serveur | utiliser une pile de polices locale, importer l'auth signée directement et rejouer le build | leçon : le build de production ne doit pas dépendre d’une ressource distante non cachée et les imports serveur doivent pointer vers le module runtime réel.
- [2026-07-22] security-migration | exports broker, scripts d'import et tests contenaient encore des credentials ou mots de passe par défaut | anciens outils de migration conçus avant le durcissement de l'auth | supprimer l'export versionné, exiger des chemins/variables externes, hasher à l'import et refuser les valeurs bootstrap implicites | leçon : l'audit des secrets doit couvrir les scripts et sauvegardes, pas seulement les routes runtime.
- [2026-07-22] rls-brokers | le SQL historique ouvrait la table brokers au rôle `anon` pour contourner l'auth | le login applicatif utilisait auparavant une lecture Supabase directe | révoquer `anon`/`authenticated`, conserver l'accès `service_role` côté serveur et bloquer le script de désactivation RLS | leçon : un contournement de développement devient une faille dès qu'il est conservé comme procédure opérationnelle.
- [2026-07-22] crypto-test | le test inline `tsx -e` refusait le top-level `await` en sortie CommonJS | le harnais d'évaluation n'est pas ESM par défaut | encapsuler le test dans une IIFE async ; hash/scrypt et HMAC passent | leçon : distinguer un défaut du harnais de test d'un défaut du module testé.
- [2026-07-22] graphify-uv | `uv tool install "graphifyy[sql]" --force` ne pouvait pas remplacer l'environnement global Windows (`Accès refusé` sur `Scripts`) | un environnement Python global existant est verrouillé malgré des ACL utilisateur correctes | utiliser `uvx --from "graphifyy[sql]"` pour l'exécution reproductible et locale ; extraction SQL validée | leçon : préférer `uvx --from` quand un tool env Windows existant est verrouillé, plutôt que supprimer de force un environnement.
- [2026-07-22] yatco-automation-dependencies | `npm audit --omit=dev` signale Playwright 1.55.0 (high, certificat non vérifié pendant le téléchargement des navigateurs) et esbuild 0.28.0 (low, dev server Windows) | versions transitives du prototype opérationnel | épingler Playwright/image officielle 1.55.1 et forcer esbuild 0.28.1, régénérer le lockfile puis rejouer l'audit | leçon : la version du paquet Playwright et celle de son image doivent rester identiques et passer l'audit avant déploiement.
- [2026-07-22] yatco-automation-systemd | `systemd-analyze verify` refuse le lanceur après copie SCP (`Permission denied`) | Windows/SCP n'a pas conservé le bit exécutable Unix | l'installateur applique explicitement le mode `700` aux trois exécutables avant de poser l'unité ; vérification systemd ensuite verte | leçon : tout paquet de déploiement copié depuis Windows doit fixer ses modes côté Linux de façon idempotente.
- [2026-07-22] build-harness | `rtk next build` retourne code 1 après ~34 s avec `Errors: 0`, alors que `rtk proxy npm run build` termine vert en 161 s | faux négatif/timeout interne du filtre RTK sur ce build Next.js long | retenir la sortie brute et le vrai code de `npm run build` pour la validation de production | leçon : un résumé de wrapper sans diagnostic ne suffit pas à déclarer le build cassé.
- [2026-07-22] yatco-auth-ttl | la session BOSS renouvelée expire après environ 24 h, donc un scraper planifié seul toutes les 72 h échouerait dès le deuxième cycle | le stockage Playwright était traité comme un secret statique alors que le cookie applicatif est court | ajouter un keepalive isolé toutes les 4 h, persister atomiquement le storage state validé et partager un verrou avec le refresh 72 h | leçon : mesurer le TTL réel d'une session avant de choisir la fréquence d'un job authentifié.
- [2026-07-22] yatco-vessel-stats-race | le premier run EC2 retourne zéro ligne alors que la grille finit par se peupler | le sélecteur `tbody tr` validait immédiatement la ligne Kendo `k-no-data`, puis le parseur la filtrait avant le retour AJAX | attendre explicitement une ligne non `k-no-data` avec au moins huit cellules avant extraction | leçon : sur une grille Kendo, attendre la donnée utile et non la simple existence d'un `<tr>`.
- [2026-07-22] yatco-readiness-head | le probe annonçait `yatco_market_review_snapshots` disponible alors que l'insert PostgREST retourne `PGRST205` table absente du cache | une requête Supabase `HEAD` n'a pas validé la relation comme attendu | remplacer par un vrai `GET` borné à une ligne et conserver le comptage exact | leçon : un readiness check de schéma doit exercer le même chemin HTTP que le runtime.
- [2026-07-22] market-review-schema-live | le scrape Market Review est complet mais l'insert échoue car `public.yatco_market_review_snapshots` n'existe pas dans le schéma live | migration SQL présente dans le dépôt mais jamais appliquée | appliquer `scripts/market-review-schema.sql`, vérifier via GET borné puis rejouer uniquement le pipeline | leçon : la présence d'une migration locale n'est jamais une preuve de son application distante.
- [2026-07-22] yatco-retry-idempotency | un retry le même jour aurait ajouté une seconde série Market Pulse et dupliqué un snapshot Market Review | `scraped_at` à la milliseconde rendait chaque retry unique malgré des données identiques | ignorer les couples `vid/feed_type` déjà vus le même jour et le snapshot Market Review identique du jour ; deux retries live ensuite ignorés 33/33 sans insertion | leçon : tout job planifié doit définir la sémantique de retry avant activation du scheduler.
- [2026-07-24] market-trends-map-clustering | agent test-code a détecté que `maxTotal` (échelle de taille des bulles) était recalculé depuis le regroupement pixel-écran courant au lieu d'un maximum global fixe, causant une "pulsation" de taille des bulles à chaque pan/zoom | premier jet du clustering client a réutilisé `clusters` comme base de calcul au lieu de la liste `locations` complète passée en prop | recalculer `maxTotal` une seule fois sur `locations` (stable), indépendamment du clustering courant ; tsc/lint rejoués verts après correctif | leçon : toute métrique qui pilote une échelle visuelle doit rester dérivée d'un ensemble stable, jamais du résultat d'un algorithme réévalué à chaque frame/interaction.
- [2026-07-24] market-trends-map-clustering-v2 | retour utilisateur : la carte restait "mauvaise" après le premier correctif, bulles toujours superposées/inaccessibles | le clustering v1 fusionnait par un seuil de distance FIXE entre centres (26px), indépendant du rayon réel des bulles (jusqu'à 20-25px, plus après fusion) — deux grosses bulles proches mais pas assez pour le seuil fixe restaient non fusionnées tout en se chevauchant visuellement | remplacé par `clusterByOverlap` (union-find agglomératif à point fixe, seuil = somme des rayons réels des groupes + marge, recalculé après chaque fusion pour capter les cascades) ; spiderfy passé d'un cercle fixe à une spirale (angle doré) ; validé par script Node que position/rayon de clustering sont dans le même espace pixel-écran que le rendu | leçon : sur une carte à bulles proportionnelles (rayon variable selon le volume), un seuil de clustering ne peut JAMAIS être une distance fixe — il doit dépendre du rayon réel de chaque bulle, sinon deux grosses bulles se chevauchent sans jamais fusionner.
- [2026-07-25] market-trends-map-clustering-v3 | 3e retour utilisateur : carte toujours "mauvaise" malgré cycles 9/10 validés tout-vert (lint/tsc/build/tests) | cycles 9/10 validaient uniquement lint/tsc/build/tests unitaires — aucun ne rejouait la géométrie réelle à `MAX_ZOOM` ni le spiderfy à l'échelle, donc deux bugs géométriques invisibles au testing habituel : (A) `MAX_ZOOM=20` mathématiquement trop bas — aucune paire de hubs proches-mais-distincts (ex. Antibes/Monaco, 24km, besoin zoom≥75) ne pouvait jamais se séparer par zoom, tout tombait en spiderfy ; (B) `SPIDERFY_STEP_PX=26` insuffisant à l'échelle — spirale à angle doré ne garantissait pas 50px d'espacement pire-cas dès qu'un cluster dépassait ~4 membres (41.7px mesuré sur un cluster réel de 16), donc le spiderfy lui-même laissait des bulles superposées | `MAX_ZOOM` 20→256 (4 clics de `CLUSTER_ZOOM_FACTOR` depuis 1, couvre les hubs réels testés) ; `SPIDERFY_STEP_PX` 26→38 (marge ~22% au-dessus du minimum 34 trouvé par sweep N=2..50) ; script `_verify-cluster.ts` réparé (corruption octets nuls, cause : append Bash heredoc sur ce fichier — utiliser `Write`/`Edit` ou `Copy-Item`, jamais `>>` heredoc) et étendu avec un contrôle de séparation géographique réelle + un sweep de `SPIDERFY_STEP_PX` ; tous les passes verts après correctif | leçon : sur une carte à zoom borné, valider `MAX_ZOOM` et le pas de spiderfy contre de VRAIES distances géographiques et de VRAIES tailles de cluster, jamais seulement contre lint/tsc/build — un tunnel "tout vert" peut cacher un bug géométrique que seule une rejouée mathématique du rendu détecte.

- [2026-07-20] kyc-adverse-media | worker EC2 en crash-loop après deploy :
  `ModuleNotFoundError: No module named 'apify_adverse_media'` | `Dockerfile.kyc`
  COPY les modules scripts **un par un, par nom** (pas `scripts/`) → tout NOUVEAU
  module n'est jamais copié dans l'image | ajouter une ligne `COPY scripts/<module>.py`
  dans `Dockerfile.kyc` ET un `!scripts/<module>.py` dans `.dockerignore` (allowlist :
  `*` puis `!` par fichier nommé — sinon « not found » au build) | **leçon : tout
  nouvel outil worker qui ajoute un module `scripts/` DOIT mettre à jour DEUX fichiers,
  `Dockerfile.kyc` (COPY) ET `.dockerignore` (allowlist), à vérifier en phase DEPLOY.**
- [2026-07-20] qmd-rag-search | `qmd embed` bloque indéfiniment (0 vecteur même sur 1
  doc, sortie vide) | machine CPU sans GPU, llama.cpp init « 0 math cores » →
  chargement/inférence du modèle d'embedding hang | rester en **BM25 `qmd search`**
  (aucun modèle requis, fonctionne) ; `query`/`vsearch` désactivés côté agents |
  leçon : sur ce poste, RAG = BM25 uniquement ; vectoriel à réactiver seulement si
  GPU (CUDA/Vulkan) configuré, puis `qmd embed --force`.
- [2026-07-26] market-trends-map | bulles trop grosses et superposées, tous les
  bateaux pas cliquables (4e retour, après 3 cycles clôturés "tout vert") |
  DEUX causes : (A) espace d'unités — les floors étaient appliqués APRÈS la
  division par `k` (`Math.max(3, r/k)`), donc en unités locales dans
  `<g scale(k)>` : un plancher de 3 vaut 3·k px écran (rayon de clic 22px à
  k=1 mais 768px à k=256) alors que le clustering ne garantit que 50px entre
  centres ; (B) `bubbleRadius` sans clamp alors qu'un cluster somme ses
  membres et que `maxTotal` est le max par lieu (83px pour un total de 300 vs
  MAX_RADIUS=20), rayon réinjecté dans la décision de clustering → blob qui
  avale ses voisins | géométrie extraite dans `lib/geo/bubble-geometry.ts`
  (`bubbleRadius` clampé, `tapRadius` source de vérité unique clustering+rendu,
  `toLocalUnits`), conversion px→unités locales **exactement une fois** dans
  le composant | **leçon : (1) sur une carte SVG zoomable, ne JAMAIS plancher
  une valeur déjà divisée par le zoom — planchers en px écran puis conversion
  unique ; (2) un test de régression jamais observé ROUGE sur le code fautif
  ne prouve rien : ici la 1re version passait au vert sur le code cassé car la
  grille synthétique (17 unités) ne pouvait pas déclencher un bug qui n'existe
  que pour `50/k < Δ < 6` — c'est exactement ce qui a laissé passer les cycles
  9/10.**
