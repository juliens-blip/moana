# 03 — Journal d'implémentation : qmd-rag-search

## Fait
- QMD 2.5.3 installé globalement (`D:\npm-global\qmd.cmd`), modèles GGUF locaux (no API key).
- Collections créées + contextes : `memory` (7), `moana-wiki` (5), `moana-archive` (1),
  `moana-tasks` (croissant). Journaux racine non indexés (lus au démarrage).
- MCP : serveur `qmd` (`cmd /c qmd mcp`) ajouté à `moana/.mcp.json` + activé dans
  `.claude/settings.local.json` → outil `mcp__qmd__query` pour les agents.
- Consigne QMD gravée dans les 4 agents du tunnel (× 2 copies `.claude/agents` +
  `agents_library`) : `epct`, `moana-epct`, `apex-workflow`, `test-code`.
- Doc : `CLAUDE.md` (routine + section « Recherche RAG — QMD » + étape EXPLORE) ;
  mémoire `agentic-tunnel` mise à jour + note `qmd-rag-search` + pointeur `MEMORY.md`.

## Notes / pièges rencontrés
- `collection add --pattern/--exclude` : **ignorés** en 2.5.3 (toujours `**/*.md`).
  → collections ciblées par dossier plutôt que par glob. `include/exclude` ne font que
  (dé)participer aux requêtes par défaut, pas un filtre de fichiers.
- Doublons `.claude/agents` == `agents_library` (61 md) volontairement hors index.
- `embed` télécharge les modèles au 1er run (long) — lancé en arrière-plan.

## Pivot BM25 (bloqueur embeddings)
- `qmd embed` **bloque** sur ce poste (CPU sans GPU, llama.cpp « 0 math cores ») : 0
  vecteur même sur 1 doc, deux runs tués. → décision : **mode BM25 `qmd search`**
  (aucun modèle requis, fonctionne parfaitement). `qmd query`/`vsearch` désactivés.
- Caveat ⚠️ ajouté dans les 8 blocs agents + `CLAUDE.md` ; bug consigné dans
  `journalbug.md` (2026-07-20) ; mémoire `qmd-rag-search` mise à jour.
- `qmd update` (ré-index FTS) OK → notes ajoutées après coup bien indexées.

## Tests (validation fonctionnelle — infra RAG, pas de code app)
- BM25 `qmd search` : retrouve tunnel, quirks YATCO, enrichissement KYC, adverse media —
  avec contextes de collection attachés et scores pertinents. ✓
- Scoping `-c memory` ✓ ; ré-index `qmd update` (3 nouveaux fichiers) ✓.
- Récupération `qmd get "#docid:from:count"` : source complète + n° de ligne ✓.
- Serveur MCP `qmd mcp` : démarre sans crash ✓.

## Déploiement / statut
- Local (poste dev) : index QMD hors dépôt (`D:/home/.cache/qmd/index.sqlite`). Rien à
  déployer sur AWS (outil de contexte pour l'agent, pas un backend Moana).
- À réactiver plus tard si GPU (CUDA/Vulkan) : `qmd embed --force` puis rétablir
  `qmd query`/`vsearch` dans les blocs agents.
