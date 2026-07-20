# 02 — Plan (PLAN/apex) : qmd-rag-search

Étapes ordonnées (aucune n'écrit du code applicatif — infra RAG + doc uniquement).

1. **Installer QMD** — `npm install -g @tobilu/qmd`, vérifier `qmd --version`.
2. **Créer les collections** (markdown curé + mémoire) :
   - `memory` → `C:/Users/beatr/.claude/projects/D--dev-moana/memory`
   - `moana-wiki` → `moana/wiki` · `moana-archive` → `moana/archive`
   - `moana-tasks` → `moana/tasks`
3. **Contextes** — `qmd context add qmd://<coll> "<résumé>"` pour chaque collection
   (feature clé de ranking).
4. **Embeddings** — `qmd embed` (télécharge les modèles au 1er run).
5. **MCP** — ajouter le serveur `qmd` (`cmd /c qmd mcp`) dans `moana/.mcp.json` et
   l'activer dans `.claude/settings.local.json`.
6. **Câbler les agents** — insérer le bloc « Recherche de contexte — QMD (OBLIGATOIRE) »
   dans `epct.md`, `moana-epct.md`, `apex-workflow.md`, `test-code.md` (× 2 copies).
7. **Documenter** — `CLAUDE.md` (routine démarrage + section Recherche RAG + étape
   EXPLORE), mémoire `agentic-tunnel` + nouvelle note `qmd-rag-search`, `MEMORY.md`.
8. **TESTER** (obligatoire) — agent `test-code` : vérifier que `qmd query`/`search`/`get`
   renvoient bien des docs des collections attendues, plusieurs requêtes (mémoire,
   tunnel, quirks scraping), et non-régression (index non muté à tort).
9. **state.md / log.md** — consigner le cycle.

## Critères de succès
- `qmd query` retrouve une note connue (ex. le tunnel agentique, un quirk YATCO) et
  `qmd get` renvoie la source complète.
- Les 4 agents (× 2) contiennent le bloc QMD ; MCP `qmd` déclaré.
- Zéro fichier applicatif/WIP touché ; index hors dépôt.
