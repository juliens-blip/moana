# 01 — Analyse (EXPLORE) : qmd-rag-search

## Besoin
L'utilisateur veut un **moteur de recherche pour la RAG Obsidian** (notes + mémoire
persistante) et que **tous** les agents du tunnel y passent dès qu'ils cherchent du
contexte / mémoire / Obsidian. Outil imposé : **QMD** (`@tobilu/qmd`).

## Exploration
- QMD 2.5.3 : recherche markdown locale (BM25 `search`, vectoriel `vsearch`, hybride
  `query` avec reranking). Modèles **GGUF locaux** (embeddinggemma-300M, Qwen3-Reranker-0.6B,
  query-expansion-1.7B) → **aucune clé API**. Index SQLite hors dépôt.
- Serveur MCP intégré : `qmd mcp` (stdio) → expose `mcp__qmd__query` aux agents.
- `collection add <path>` : pattern fixe `**/*.md` (les flags `--pattern`/`--exclude`
  sont ignorés en 2.5.3). `context add` attache un résumé humain par collection = **clé**
  du bon ranking (retourné avec les sous-documents).
- Vaults Obsidian présents : `moana/.obsidian` (tout le projet). Mémoire persistante :
  `C:/Users/beatr/.claude/projects/D--dev-moana/memory`.
- Fichiers md du repo : 125, dont 61 doublons de définitions d'agents
  (`.claude/agents` == `agents_library`) → **à ne pas indexer** (bruit/duplication RAG).
- Agents du tunnel à modifier : `epct.md`, `moana-epct.md`, `apex-workflow.md`,
  `test-code.md` (× 2 copies `.claude/agents` + `agents_library`).

## Décisions
- Indexer **la connaissance curée + la mémoire**, pas le code ni les défs d'agents :
  collections `memory`, `moana-wiki`, `moana-archive`, `moana-tasks`.
- Journaux racine (`state.md`/`log.md`/`journalbug.md`) : lus directement au démarrage
  (déjà dans la routine CLAUDE.md), pas besoin de les indexer sémantiquement.
- Brancher QMD via MCP (`moana/.mcp.json`) + graver la consigne dans les 4 agents,
  dans `CLAUDE.md` et dans la mémoire ([[qmd-rag-search]], [[agentic-tunnel]]).
