@C:\Users\beatr\.codex\RTK.md

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Graphify ou QMD — règle de décision

- **Graphify** : utiliser pour le code et les schémas actuels du dépôt — symboles,
  appels, dépendances, chemin entre modules, impact d'un changement et SQL.
- **QMD** : utiliser pour la mémoire persistante — décisions, exigences,
  journaux, bugs, plans APEX/EPCT, historique et contexte métier. Sur cette
  machine, rester en BM25 avec `qmd search`, puis récupérer la source avec
  `qmd get`/`qmd multi-get`.
- **Les deux** : pour un audit ou une feature, QMD donne l'intention et
  l'historique ; Graphify vérifie l'architecture et les relations présentes.
  Ne pas remplacer QMD par Graphify, ni Graphify par une lecture brute du code.
- Après une note durable : `qmd update`. Après une modification de code :
  `graphify update .`.
