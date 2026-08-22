# Journalbug — Bugs rencontrés au testing agent

But : référencer chaque bug détecté par l'agent `test-code` pour ne pas le
reproduire. Une ligne normalisée par bug. Quand le fichier grossit trop, résumer
les patterns récurrents dans « Leçons » et supprimer les lignes brutes anciennes.

Format : `[AAAA-MM-JJ] <tool> | symptôme | cause racine | fix | leçon`.

- **[2026-08-22, résolu]** serveur local/YATCO Global | actualisation affichait une
  déconnexion ou une erreur 500 | `ENOSPC` lors de l’écriture du cache webpack/Next
  (disque presque plein) | purge ciblée de `.next`, redémarrage de `npm run dev`,
  recompilation longue mais normale ; ne jamais supprimer les données Supabase.
- **[2026-08-22, résolu AWS]** flux live vide | le pager renvoyait `Login - BOSS`,
  cookie BOSS expiré avant le prochain rea​​uth | le cron était bien présent mais
  son intervalle de 27 h dépassait la durée réelle du cookie | login automatique
  relancé, conteneur `scrape-mcp` redémarré, intervalle réduit à 20 h ; le scraper
  détecte maintenant une page login au lieu de la convertir en liste vide.
- **[2026-08-22, résolu localement]** brochure en chargement continu/404 | lien
  `custompdf` non téléchargeable et proxy qui pouvait scanner 600 pages avant de
  générer le PDF | workflow remplacé par appel authentifié `quickpdf` direct, scan
  limité au secours, téléchargement S3 attendu ; test réel `%PDF-` de 6,86 Mo.
- **[2026-08-22, résolu]** actualisation rejetée avec `length_m=0` | zéro restauré
  depuis l’URL était envoyé au schéma strict | `0` est maintenant traité comme
  absence de filtre et omis de la requête API ; 25 tests frontend passent.

- **[2026-08-22, résolu]** YATCO Global live — le flux affichait 0 annonce ; le pager AWS renvoyait en réalité `Login - BOSS`, car `BOSSAuthCookie` avait expiré à 16:00. Le scraper détecte désormais la page de connexion et remonte une erreur explicite au lieu de masquer l’expiration comme une liste vide. Session renouvelée dans `/app/auth/yatcoboss.json` via le rea​​uth automatique AWS.
- **[2026-08-22, résolu AWS]** Le renouvellement automatique existait bien (`cron` horaire + `yatco-relogin.sh`) mais son intervalle était de 27 h, supérieur à la durée effective du cookie. La session expirait donc avant le prochain passage. Re-login exécuté avec succès à 17:47, conteneur `scrape-mcp` redémarré, intervalle réduit à 20 h.

- **[2026-08-22, résolu localement]** YATCO Global — le bouton brochure utilisait directement `/forsale/pdf/custompdf/`, qui est une page de configuration broker et renvoie 404 sans le workflow de l’interface. Vérifié dans les traces Playwright : le parcours fonctionnel est `quickpdf` → attente du filestore → URL S3. Le script local `scripts/yatco-boss-brochure.mjs` reproduit ce parcours avec la session BOSS AWS ; test réel validé avec un PDF `%PDF-` de 6,86 Mo. L’interface passe désormais par `/api/yatco-global/brochure` et ne stocke pas le document dans Supabase.

## Leçons (patterns récurrents)

- `apify_client` StoreListActor est un objet pydantic : accès par attribut
  (`a.name`, `a.title`, `a.stats.total_runs`), jamais `.get()`.
- Environnement local : SSL strict échoue (litellm, curl) → utiliser `curl -k` /
  UTF-8 file pour diagnostics ; jamais en prod.
- **[2026-08-18, corrigé]** Tests worker KYC : la leçon « `py -3.11` +
  `PYTHONPATH=...` » référençait une AUTRE machine (Windows, wiki/Crawl4AI.md
  citait encore `C:\Users\beatr\...`) — `py` n'existe pas sur ce poste Linux.
  Vrai fix : venv canonique créé à la racine du repo (`.venv/`, dépendances de
  `scripts/requirements-kyc.txt` + `pytest`), résolu automatiquement par la
  Software Factory pour tout `test_commands` déclarant `python3`/`python`
  (`Config.venv_python`, `dev/software_factory/workflows/adw_sdlc.py`) — plus
  besoin de `PYTHONPATH` manuel, `.venv/bin/python3 -m pytest tests/backend`
  suffit. Leçon : avant de reprendre une note d'environnement ancienne,
  vérifier qu'elle décrit CETTE machine, pas une précédente.
- Apify `.call(...)` : passer `timeout=timedelta(...)`, JAMAIS `timeout_secs=` (TypeError).
- Objet Apify `Run` = pydantic : `run.default_dataset_id` / `run.status` (jamais `run.get()`).
- Software Factory / orchestrateur : sans vérification préalable du blocage connu
  (ex. secret manquant), une session relancée redécompose la même tâche et se
  reheurte au même blocage sans progrès — vérifier `state.md`/mémoire pour un
  blocage déjà identifié avant de relancer une session sur la même tâche.
- **[2026-08-18, résolu] MOANA_SSH_KEY « non défini » récurrent (obs 664, 706,
  714, 722, S28-S45 et ~8 sessions supplémentaires 2026-08-14→18) : la vraie
  cause n'était PAS l'absence de la variable dans `.env`, mais le mode
  `tmux.mode=interactive` de la factory — les 4 panes d'agent par équipe sont
  des shells créés UNE FOIS par `tmux_factory.sh` et réutilisés pendant toute
  la durée de vie de la session (des jours). `tmux set-environment -g` ne
  touche que les panes créés APRÈS l'appel ; un pane déjà ouvert garde
  l'environnement du moment où la session tmux a démarré. Un secret ajouté à
  `.env` après coup restait donc invisible tant qu'on ne tuait pas toute la
  session tmux — d'où les relances répétées sans progrès malgré la clé
  « fournie ». Fix côté `dev/software_factory/workflows/adw_sdlc.py` : chaque
  appel d'agent en pane écrit désormais un relais `env.sh` (0600, supprimé en
  fin d'appel) avec les secrets à jour lus depuis `os.environ`, et le `source`
  avant la commande — jamais tapé en clair dans le pane. Leçon : pour tout
  outil qui garde un shell tmux long-vivant, ne JAMAIS supposer qu'un
  `set-environment` atteint un pane déjà ouvert ; revérifier à chaque run.

## Bugs bruts

- [2026-08-22] dashboard UI | le logo Moana apparaissait en très grand en
  arrière-plan, particulièrement sur YATCO Global | le layout dashboard
  appliquait une image JPEG 1600x800 en filigrane avec `background-repeat`,
  rendu dépendant du cache/CSS et visuellement envahissant | filigrane retiré
  du layout ; le logo reste uniquement dans le header | leçon : ne pas utiliser
  une image de marque pleine largeur comme background répété du dashboard.

- [2026-08-14→2026-08-16] yatco-global (conteneurisation Docker) | `docker build`
  échouait sur `workers/docker/Dockerfile.yatco-collector` et `Dockerfile.yatco-worker`
  (`COPY ... not found`), confirmé sur deux sessions Software Factory successives
  (`20260814T205236-114e94`, `20260814T211920-9cc86f`) | `.dockerignore` racine est
  une whitelist stricte (`*` puis `!` par fichier) qui n'autorisait ni `workers/` ni
  `scripts/yatco_collector.py` | négations `!workers/`, `!scripts/yatco_collector.py`
  ajoutées au `.dockerignore` (2026-08-16) ; **les deux `docker build` validés verts
  le 2026-08-16 ~21:30** | leçon : même pattern que le bug adverse-media du
  2026-07-20 (whitelist `.dockerignore` à mettre à jour à chaque nouveau module
  worker/scripts) — recontrôler `.dockerignore` en phase DEPLOY dès qu'un nouveau
  chemin `workers/`/`scripts/` apparaît.
- [2026-08-14] yatco-global (worker ingestion) | sous-tâche backend T3 (session
  Software Factory `20260814T193044-bcae56`) jamais exécutée, bloquée avant
  `plan.json` | l'Orchestrator a assigné la tâche à `scripts/` alors que le périmètre
  de l'équipe backend exclut ce dossier — conflit de scope entre routing et
  contrainte planner | table `workspace_scope` par équipe ajoutée à
  `prompts/orchestrator_system.md` (vérification des chemins avant écriture de
  `route.json`) + whitelist stricte retirée de `prompts/backend/planner.md`, dans le
  dépôt `software_factory` (hors `moana`) | leçon : la validation de périmètre
  fichiers doit se faire **à l'assignation** (Orchestrator), pas seulement au
  planning (Planner), sinon une tâche mal routée bloque silencieusement toute la
  session.
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
- [2026-08-19] yatco-global (déploiement prod, Software Factory) | session
  `20260819T131649-454095` bloquée en `BLOCKED_BY_SCOPE` sur `T1` (T2/T3 en
  cascade) | `DEPLOY_ARTIFACTS` de `deploy.py` copie obligatoirement
  `scripts/yatco_collector.py` vers l'hôte distant, mais `scripts/**` était
  hors du `scope_paths` accordé à l'équipe backend pour cette tâche | requête
  relancée (session `20260819T141201-b98e8a`) avec le scope backend élargi
  explicitement à `scripts/yatco_collector.py` ; issue en attente (pas de
  `summary.json` à 16:13) | leçon : quand un artefact de déploiement fixe
  (`DEPLOY_ARTIFACTS`) référence un chemin hors du périmètre habituel d'une
  équipe (ici `scripts/` pour l'équipe backend), le déclarer explicitement
  dans la requête de routage dès le premier essai plutôt que de découvrir le
  blocage après coup — cf. bug de routing similaire du 2026-08-14.
- [2026-08-17→2026-08-18, résolu] yatco-global (mode `check`/préflight `deploy.py`)
  | préflight réel échouait systématiquement contre l'hôte distant sur ~15 tentatives
  Software Factory (2026-08-17, 01h→23h32) sans progrès | `MOANA_SSH_KEY` absent du
  contexte local de session précédente, pas fourni ni escaladé | `MOANA_SSH_KEY` fourni
  et actif en environnement (2026-08-18 ~04:00) ; préflight validé, déploiement complété
  et services vérifiés | voir leçon « relances répétées » ci-dessus.
- [2026-08-19, résolu et confirmé en prod le 2026-08-20] yatco-global (`deploy.py`
  health-check) | `moana-yatco-ingest.service` (`Type=oneshot`) traite les données
  avec succès mais `deploy.py` le déclarait en échec de déploiement (session
  Software Factory `20260819T201106-1c3a21`, T1 échoué après 3 tentatives) | le
  health-check sondait `ActiveEnterTimestamp`/`MainPID`, remis à vide dès qu'un
  oneshot termine — même en succès | `trigger_and_verify_unit` réécrit : force un
  état frais (`reset-failed`→`start`) et juge sur `InvocationID`/
  `ExecMainStartTimestamp`, seuls signaux fiables pour ce type d'unité ; déployé et
  vérifié en production le 2026-08-20 (`production_yatco_ingest_verification.json` :
  `Result=success`, `files=694 written=4435 dead_letters=2`) | leçon : pour une
  unité `Type=oneshot` sans `RemainAfterExit`, ne jamais sonder
  `ActiveEnterTimestamp`/`MainPID` post-succès — ils sont remis à vide par design.
- [2026-08-19→2026-08-20, non résolu] yatco-global (suite backend) | après la
  réécriture du health-check `deploy.py` (ci-dessus), les tests locaux échouent :
  `test_deploy_env.py`, `test_deploy_service_trigger.py` (non commités) | les mocks
  `systemctl show` de ces tests simulent encore les anciennes propriétés
  `ActiveEnterTimestamp,MainPID` au lieu de `InvocationID,ExecMainStartTimestamp` —
  régression de synchronisation test/code, pas un bug fonctionnel de `deploy.py` |
  pas encore corrigé (`.venv/bin/python3 -m pytest tests/backend -q` → 83 passed,
  7 skipped, **12 failed** le 2026-08-20, en hausse depuis les 10 échecs initiaux) |
  leçon : après toute réécriture de sonde distante, grep les mocks de test qui
  hardcodent le nom exact des propriétés `systemctl show`, ils cassent
  silencieusement sans erreur de syntaxe.
- [2026-08-20, résolu] yatco-global (vue `yatco_selection_candidates`) | le
  dashboard 72h renvoyait 0 résultat malgré 4438 annonces en base | la vue
  filtrait sur `source_created_at`/`source_updated_at` — des dates PUBLIÉES PAR
  YATCO (`source_created_at` jamais rempli, `source_updated_at` = lastmod
  sitemap, quasi figé), pas nos dates d'ingestion | migration
  `20260820T1615__fix_yatco_selection_freshness_signal` bascule filtre+tri sur
  `first_seen_at`/`updated_at` ; `lib/supabase/yatco-global.ts` aligné ; vérifié en
  prod, 780 lignes désormais retournées | leçon : pour une source externe agrégée,
  toujours distinguer explicitement « date publiée par la source » de « date de
  notre propre ingestion » avant de filtrer sur la fraîcheur — la première peut
  être absente ou quasi statique sans que ce soit visible en base tant qu'on ne
  compare pas les deux.
- **[2026-08-19/20, à traiter] ⚠️ sécurité** — le relais `env.sh` introduit au Cycle 14
  (`dev/software_factory`, hors moana) pour propager les secrets aux panes tmux
  écrit `MOANA_SSH_KEY` en clair sur disque (0600, supprimé après l'appel, mais
  présent en clair pendant l'exécution) | pas encore durci (ex. named pipe / lecture
  unique) ; à vérifier avant la prochaine campagne de déploiement prod.
