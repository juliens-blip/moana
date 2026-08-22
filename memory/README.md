# Mémoire conceptuelle Moana

Cette mémoire est strictement propre au projet Moana. Elle contient des
entités, observations et relations conceptuelles : décisions, bugs résolus et
leçons techniques. Les journaux Markdown restent la source de vérité de l'état
courant ; QMD reste le fallback de recherche local.

Le graphe est servi par `software_factory/memory_server.py` via MCP stdio et
stocké dans `graph.db` en mode WAL. `graph.json` est conservé uniquement comme
sauvegarde de migration historique.
Ne jamais y stocker de secret, token, dump ou donnée personnelle brute.
