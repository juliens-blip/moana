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
- **Cycle 14 (2026-08-18 21:48→22:50, `dev/software_factory`, hors moana)** —
  Cause racine des blocages `MOANA_SSH_KEY` récurrents trouvée : pas un secret
  absent mais `tmux.mode=interactive` (panes long-vivants, jamais rafraîchis) →
  fix relais `env.sh` (0600) sourcé avant chaque commande agent. Imports SSSF :
  `enforce_declared_writes` (diff réel vs `build.json.changes` déclaré),
  continuation de session Builder (`--resume`), venv Python canonique `.venv/`
  créé à la racine moana (corrige `wiki/Crawl4AI.md`, obsolète sur ce poste).
  Incident : clé `MOANA_SSH_KEY` affichée en clair dans la conversation lors
  d'un test bugué, historique tmux nettoyé, rotation refusée par l'utilisateur.

## Cycles récents (<18h)

### [2026-08-18 ~21:48] Cycle 14 — Software Factory (`dev/software_factory`, hors moana) : cause racine des blocages trouvée et corrigée
- **Fait** : Comparaison archi avec `super-simple-software-factory` (disler) à la demande
  de l'utilisateur, puis audit des ~40 dernières sessions factory. Cause racine du
  blocage `MOANA_SSH_KEY non défini` (répété ~8× depuis Cycle 11) identifiée : PAS un
  secret absent, mais `tmux.mode=interactive` — les panes d'agent sont des shells
  créés une fois par `tmux_factory.sh` et jamais rafraîchis ; `tmux set-environment -g`
  n'atteint que les panes créés après l'appel. Fix : `AgentRunner._write_env_relay`
  (workflows/adw_sdlc.py) écrit un fichier `env.sh` (0600, jamais tapé en clair dans le
  pane) sourcé avant chaque commande, avec les secrets à jour lus depuis `os.environ`.
  `MOANA_SSH_KEY` ajoutée à `secrets.required_env` de `team_backend.yaml` (absente
  jusqu'ici, donc invisible à `doctor`). Détection `STATE_MUTATION_DETECTED` assouplie :
  1 réparation auto. (restauration depuis le cache SHA-256 immuable) par contrat avant
  d'abandonner la sous-tâche — au lieu d'un abandon immédiat. Import ciblé de deux idées
  SSSF : gate `plan_intent_quality` (avertissement non bloquant sur `goal`/`intent`
  triviaux) et `workflows/envelope_types.py` (types Pydantic miroir, référence
  documentaire seule — `gate_checks.py` reste l'autorité d'exécution). Exemption
  `*.down.sql` du gate SQL destructif (DROP y est le comportement attendu). Prompt
  `backend/planner.md` clarifié pour éviter l'auto-escalade `SCOPE_ESCALATION_REQUIRED`
  sur un déploiement distant légitime (`op:"run"` + `remote:true` reste dans le scope).
- **⚠️ Incident** : `MOANA_SSH_KEY` affichée en clair dans la conversation lors d'un test
  de vérification bugué (`${VAR:-UNSET}` renvoie la valeur si définie, pas le mot
  "UNSET"). Historique du pane tmux nettoyé immédiatement. Utilisateur informé,
  rotation de clé refusée explicitement ("on s'en fou continue").
- **Tests** : compile OK (`py_compile`), gate `plan_intent_quality` vérifié
  (warning non bloquant), exemption `.down.sql` vérifiée (gate passe), relais env
  vérifié en conditions réelles sur le pane `Backend.2` (clé bien propagée).
- **Prochaine étape** : observer les prochaines sessions factory pour confirmer la
  disparition des blocages `MOANA_SSH_KEY` ; envisager de tuer/recréer la session tmux
  existante si un autre secret y a été ajouté après son démarrage.

### [2026-08-18 ~22:05] Cycle 14 (suite) — 2 imports SSSF supplémentaires : diff réel vs déclaré + continuation de session
- **Fait** : (1) `enforce_declared_writes` (workflows/adw_sdlc.py) — snapshot `git
  status` avant/après chaque appel Builder, comparé à `build.json.changes` déclaré.
  Un fichier nouvellement modifié/non-suivi et non déclaré est annulé automatiquement
  (`git checkout --`/suppression) ; un fichier déjà sale avant l'appel et toujours
  non déclaré n'est que signalé (pas d'annulation à l'aveugle d'un travail antérieur
  légitime). Implémente le principe SSSF « `writes:` est la frontière, `tools:` ne
  l'est pas ». (2) Continuation de session pour le Builder : `--session-id`/`--resume`
  côté providers `claude`/`claude_orchestrator` uniquement (seuls documentés sans
  ambiguïté création/reprise ; codex/agy/cline assignent leurs propres IDs, laissés
  en retry à froid par prudence). `builder` tourne sur `claude` dans les tiers
  medium/hard des 4 équipes → couvre la boucle Build⟲Test, la plus coûteuse.
- **Tests** : compile OK sur les 3 fichiers touchés ; `enforce_declared_writes` vérifié
  sur 3 cas (déclaré conservé, nouveau non-déclaré annulé, déjà-sale-avant signalé
  seulement) ; sélection de gabarit fresh/resume/fallback-silencieux vérifiée.
- **Prochaine étape** : observer un vrai run Builder en tier medium/hard pour confirmer
  que `--resume` fonctionne en conditions réelles (jamais testé avec un vrai appel
  `claude` payant durant cette session).

### [2026-08-18 ~22:50] Cycle 14 (suite) — venv Python canonique créé, cause d'échecs de tests trouvée
- **Fait** : aucun venv Python n'existait pour moana sur cette machine ; `python3`
  système (3.14) n'avait ni `apify_client`, ni `httpx`, ni `dotenv`, ni `litellm`,
  ni `crawl4ai`. `wiki/Crawl4AI.md` référençait encore un chemin Windows
  (`C:\Users\beatr\...`, `py -3.11`) — une autre machine, plus d'actualité ici (corrigé).
  Fix : `.venv/` créé à la racine (`sudo apt install python3.14-venv` requis,
  installé avec accord utilisateur), dépendances de `scripts/requirements-kyc.txt`
  + `pytest` installées, `.venv` ajouté au `.gitignore`. Côté factory : nouvelle
  propriété `Config.venv_python` (convention `<workspace>/.venv/bin/python3`,
  générique pour tout futur projet ciblé, pas seulement moana) ; `TestRunner`
  réécrit automatiquement tout `python3`/`python` de `test_commands` vers ce
  binaire ; les agents (Builder/Planner/Tester) en sont informés en tête de
  prompt (`_envelope_header`) avec consigne explicite de ne jamais en créer un
  autre — but : que l'agent et le moteur tournent sur le MÊME interpréteur.
- **Tests** : 77 tests backend + 2 tests rag collectés sans erreur d'import via
  `.venv/bin/python3 -m pytest --collect-only` ; substitution automatique
  `python3`→venv vérifiée en conditions réelles via `TestRunner.run_all()`.
- **Prochaine étape** : si l'équipe OSINT redevient active, vérifier `tests/osint`
  (dossier absent pour l'instant) collecte aussi proprement une fois créé.

### [2026-08-19 ~23:00] Cycle 15 — Audit complet factory + 1re tâche factory 100% réussie + trace SQLite
- **Fait** : audit de 72 sessions / 130 sous-tâches historiques. Trouvaille majeure :
  89 "blocked" (68%) affichés, mais 70/89 (79%) n'étaient que des sous-tâches sautées
  en cascade (dépendance amont non satisfaite, 0 appel LLM dépensé) comptées avec le
  même statut qu'un vrai blocage — le vrai taux de blocage réel était ~15-20, pas 89.
  Fix : nouveau statut `"skipped"` distinct dans `adw_sdlc.py`/`main.py sessions`.
  **Lancé une vraie tâche simple en direct** (`tests/backend/test_deploy_artifacts_shape.py`,
  session `20260819T200713-86cf03`) : **PASSED** de bout en bout (team_lead→planner→
  builder→test→tester), fichier réel vérifié correct. Le Tester a lui-même diagnostiqué
  qu'un smoke test distant préexistant (pas mon changement) faisait échouer la suite,
  et le Builder l'a corrigé en tentative 2 (skip gracieux si `MOANA_SSH_KEY` absent/
  invalide) — validation en conditions réelles de tous les fixes du Cycle 14
  (relais env, `enforce_declared_writes`, continuation de session, venv).
  **Ajout `workflows/trace_db.py`** : miroir SQLite (WAL) des runs — sessions + events
  (subtask_started/finished, agent_call par rôle/provider/statut/durée), additif au
  `manifest.jsonl` qui reste source de vérité. Nouvelle commande `main.py trace`
  (résumé par défaut, `--sql` pour requête libre). Import SSSF #3 (observabilité).
- **Tests** : wiring vérifié en conditions réelles (dry-run gratuit + vraie session
  passée) — sessions/events insérés et interrogeables correctement.
- **Prochaine étape** : la base ne couvre que les runs à partir de maintenant (pas de
  backfill des 72 sessions historiques) — normal, `main.py trace` restera clairsemé
  jusqu'à accumulation de nouveaux runs.

### [2026-08-20 ~00:40] Cycle 15 (suite) — tiering réel du run "easy" (24 min de la veille décortiquées)
- **Fait** : décomposition du run passed d'hier (24 min) par timestamp : team_lead
  62s, planner 54s, build1 29s, **tester1 772s (53% du total)**, build2 276s,
  tester2 251s. Deux causes trouvées, toutes deux confirmées par l'utilisateur.
  (1) `team_lead` n'était tiéré sur AUCUNE des 4 équipes — toujours `codex/gpt-5.6-sol`
  quel que soit `--tier`. Fix : bloc `tiers: {easy: deepseek/deepseek-v4-flash}` ajouté
  au `team_lead:` des 4 `team_*.yaml` ; `_team_lead()` (adw_sdlc.py) lit maintenant
  `tier_hint` pour choisir son propre modèle avant même d'avoir tranché le tier final.
  (2) Le gros du temps (772s) : `test_commands` de l'équipe fait TOUJOURS tourner toute
  la suite (`pytest tests/backend`, 86 tests), même pour un changement d'un seul
  fichier — un smoke test distant sans rapport a fait échouer le gate, forçant le
  Tester à un diagnostic long. Fix conservateur (PAS un scoping façon `ruff` — perte de
  couverture jugée trop risquée) : `gate_checks.scope_pytest_to_delta` ne restreint la
  suite d'équipe au delta QUE si le delta entier est composé de fichiers `tests/**` ;
  tout changement touchant un fichier hors `tests/` (ex. `workers/deploy.py`) garde la
  suite complète, sans perte de couverture de régression.
- **Tests** : 3 cas unitaires vérifiés (delta 100% test → scope ; delta non-test → suite
  complète inchangée ; delta mixte → suite complète inchangée).
- **Prochaine étape** : observer le prochain run `easy` en conditions réelles pour
  confirmer le gain de temps (team_lead + scoping pytest quand applicable).

### [2026-08-19 ~13:16→16:13] Cycle 15 — `yatco-global` : `.env` Docker Compose manquant sur l'hôte distant, scope backend trop étroit puis élargi
- **Fait** : `moana-yatco-ingest.service` échouait en prod avec
  `ConfigurationError: Missing configuration: NEXT_PUBLIC_SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY` (le `.env` Compose n'était jamais déployé sur
  l'hôte distant). `workers/deploy/deploy.py` étendu (`load_env_value`,
  `write_env_file`, `ENV_FILE_VARIABLES`, `ENV_FILE_REMOTE_PATH`) pour lire ces
  deux variables exclusivement depuis `os.environ`, les écrire dans un `.env`
  temporaire local 0600 puis le transférer vers
  `workers/docker/.env` sur `ubuntu@51.44.220.145`, sans jamais les journaliser
  (fichier local supprimé succès ou échec). `.dockerignore` ajouté à
  `DEPLOY_ARTIFACTS` ; `REQUIRED_UNITS` figé
  (`moana-yatco-collect.service`, `moana-yatco-ingest.service`,
  `moana-yatco-ingest.timer`). Nouveaux tests `tests/backend/test_deploy_env.py`
  (non commités).
- **Session Software Factory `20260819T131649-454095`** (13:16→13:21) :
  premier essai de déploiement prod routé à l'équipe backend, **bloqué en
  `BLOCKED_BY_SCOPE`** sur `T1` — `DEPLOY_ARTIFACTS` copie obligatoirement
  `scripts/yatco_collector.py` vers l'hôte distant alors que `scripts/**`
  était hors du `scope_paths` accordé à l'équipe backend
  (`authorized_scope_paths` limité à `workers/**`, `db/**`, `migrations/**`,
  `supabase/**`, `tests/backend/**`, `.dockerignore`, `.gitignore`,
  `requirements.txt`, `package.json`, `docker-compose.yml`) ; `reroute_required:
  true`, T2/T3 restés bloqués en cascade (dépendance).
- **Session Software Factory `20260819T141201-b98e8a`** (démarrée 14:12,
  routée 14:13, **encore en cours à 16:13** — pas de `summary.json`) :
  relancée avec le scope backend élargi explicitement à
  `scripts/yatco_collector.py` dans la requête ; aucun résultat final
  disponible à la clôture de ce cycle documentaire.
- **Tests** : suite backend locale au vert — `.venv/bin/python3 -m pytest
  tests/backend -q` → 71 passed, 6 skipped (2026-08-19).
- **Prochaine étape** : suivre l'issue de la session `20260819T141201-b98e8a`
  (déploiement prod réel + vérification SSH que `ConfigurationError` a
  disparu du journal `moana-yatco-ingest.service` + cycle d'ingestion complet
  exit 0) ; une fois confirmé, commiter les artefacts en attente
  (`.dockerignore`, `.mcp.json`, `workers/deploy/deploy.py`,
  `tests/backend/test_deploy_env.py`, `tests/backend/test_deploy_preflight.py`,
  `tests/backend/conftest.py`, `scripts/test_yatco_collector.py`).

### [2026-08-19 20:42→2026-08-20 01:13] Cycle 16 — `yatco-global` : health-check `deploy.py` réécrit (bug oneshot), déploiement prod toujours pas confirmé, suite de tests désynchronisée
- **Fait** : la session `20260819T141201-b98e8a` du Cycle 15 a fini par échouer en
  prod — `moana-yatco-ingest.service` (`Type=oneshot`) traite bien les données avec
  succès mais le health-check de `deploy.py` le déclarait en échec, car il sondait
  `ActiveEnterTimestamp`/`MainPID`, remis à vide dès qu'un oneshot termine (même en
  succès). Réécrit : `trigger_and_verify_unit` force un état frais
  (`reset-failed`→`start`) puis ne juge que sur `InvocationID`/`ExecMainStartTimestamp`
  (seuls signaux fiables pour ce type d'unité) et sur `systemctl is-failed` avec
  rc∈{0,1} attendu. `Settings.unit_start_timeout_s` (1200s) ajouté : `systemctl start`
  sur un oneshot bloque jusqu'à la fin réelle du worker, budget distinct des sondes
  courtes. `validate_external_id`/`ingest_listings` : une annonce dont le type n'est
  pas un `dict` part désormais en dead-letter (`invalid_listing_type`) au lieu de
  planter le lot (fix + test ajoutés, voir diff `workers/yatco_ingest_worker.py`).
- **Déploiements bloqués** : `20260819T204237-95d40f` bloqué (T1, 2 tentatives —
  déploiement prod hors scope du `plan.json`) ; `20260819T201106-1c3a21` échoué (T1,
  3 tentatives — health-check pré-fix qui déclarait le service en échec malgré un
  run réussi) ; `20260819T221907-d95ba9` et `20260819T231217-48414a` **jamais sortis
  de la phase `route`** (aucun `summary.json`, `manifest.jsonl` arrêté juste après
  `route` validé) — cause : bug de synchronisation tmux découvert en parallèle côté
  `dev/software_factory` (pane vidé avant exécution de la commande, `stdout.log`
  vide) et corrigé (`_confirm_started()`) vers 01:00, mais aucune session n'a encore
  été relancée depuis pour confirmer le déploiement du fix health-check sur EC2.
- **⚠️ Sécurité (à traiter)** : alerte factory — la clé privée `MOANA_SSH_KEY` est
  écrite en clair dans le fichier relais `env.sh` (0600, supprimé après usage, mais
  présent sur disque en clair le temps de l'appel) côté `dev/software_factory`, hors
  périmètre moana mais concerne directement ce secret ; à vérifier/durcir avant
  prochaine campagne de déploiement.
- **Tests** : suite backend locale actuellement **rouge** —
  `.venv/bin/python3 -m pytest tests/backend -q` → **75 passed, 6 skipped, 10 failed**.
  Les 10 échecs (`test_deploy_env.py`×2, `test_deploy_service_trigger.py`×8, ce
  dernier non commité) sont des mocks écrits avant la réécriture du health-check :
  ils simulent encore `ActiveEnterTimestamp`/`MainPID` au lieu de
  `InvocationID`/`ExecMainStartTimestamp` — régression de synchronisation test/code,
  pas un bug de `deploy.py` lui-même.
- **Prochaine étape** : mettre à jour les mocks de `test_deploy_service_trigger.py`/
  `test_deploy_env.py` sur les nouvelles propriétés `systemctl show`, revalider suite
  au vert, puis relancer un déploiement prod (scope explicitement élargi au
  hostname/production) pour confirmer en conditions réelles que le health-check
  oneshot ne déclare plus faussement `moana-yatco-ingest.service` en échec ;
  artefacts toujours non commités (voir liste Cycle 15 ci-dessus, + `deploy.py`
  santé oneshot et `test_deploy_service_trigger.py` en plus).


