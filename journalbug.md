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
