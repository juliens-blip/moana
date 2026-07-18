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

## Bugs bruts

_(aucun pour l'instant)_
