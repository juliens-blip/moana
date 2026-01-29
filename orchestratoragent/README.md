# Multi-LLM Orchestration System

Système d'orchestration pour coordonner 4 LLMs (Claude, AMP, Antigravity, Codex) sur le projet Moana Yachting.

## Architecture

```
orchestratoragent/
├── start-orchestration.sh      # Lance le système complet
├── stop-orchestration.sh       # Arrête proprement le système
├── check-health.sh             # Vérifie l'état du système
├── config/
│   └── orchestration.conf      # Configuration centralisée
├── prompts/
│   ├── claude-orchestrator.md  # Prompt initial pour Claude
│   ├── amp-worker.md           # Prompt initial pour AMP
│   ├── antigravity-worker.md   # Prompt initial pour Antigravity
│   └── codex-worker.md         # Prompt initial pour Codex
├── logs/                       # Logs d'exécution
└── README.md                   # Cette documentation
```

## Prérequis

Avant d'utiliser le système, assurez-vous d'avoir installé:

- **tmux**: `sudo apt install tmux`
- **claude**: `npm install -g @anthropic-ai/claude-code`
- **amp**: Installation via Sourcegraph
- **codex**: `npm install -g @openai/codex`
- **antigravity-claude-proxy**: `npm install -g antigravity-claude-proxy`

## Utilisation

### Démarrer l'orchestration

```bash
cd /home/julien/Documents/moana/moana/orchestratoragent
./start-orchestration.sh
```

Le script:
1. Vérifie les prérequis
2. Initialise les sections orchestration dans CLAUDE.md
3. Crée une session tmux avec 4 panes
4. Lance chaque LLM avec son prompt initial

### Layout tmux

```
Window 0 (main):
┌─────────────────┬─────────────────┐
│ Claude          │ AMP             │
│ (Orchestrateur) │ (Worker)        │
├─────────────────┼─────────────────┤
│ Antigravity     │ Codex           │
│ (Proxy)         │ (Worker)        │
└─────────────────┴─────────────────┘

Window 1: Antigravity Claude Client
```

### Navigation tmux

- `Ctrl+b` puis flèches: Naviguer entre les panes
- `Ctrl+b` puis `0`/`1`: Changer de window
- `Ctrl+b` puis `d`: Détacher la session
- `Ctrl+b` puis `z`: Zoom sur le pane courant

### Vérifier l'état

```bash
./check-health.sh
```

### Arrêter l'orchestration

```bash
./stop-orchestration.sh
```

## Rôles des LLMs

| LLM | Rôle | Commande |
|-----|------|----------|
| **Claude** | Orchestrateur - Planifie et distribue les tâches | `claude` |
| **AMP** | Worker - Tâches d'implémentation moyenne complexité | `amp -m large --dangerously-allow-all` |
| **Antigravity** | Worker - Analyse complexe avec extended thinking | Via proxy + `claude --model claude-opus-4-5-thinking` |
| **Codex** | Worker - Génération de code, tests | `codex --dangerously-bypass-approvals-and-sandbox` |

## Communication via CLAUDE.md

Tous les LLMs communiquent via le fichier `CLAUDE.md`. Les sections clés:

### Task Assignment Queue
Tableau des tâches assignées par l'orchestrateur.

### Task Completion Log
Historique des tâches complétées avec date, durée, et notes.

### Current LLM Status
État actuel de chaque LLM (IDLE, IN_PROGRESS, etc.).

### Inter-LLM Messages
Messages directs entre LLMs pour coordination.

## Distribution des Tâches

L'orchestrateur Claude assigne les tâches selon leur complexité:

| Complexité | Assigné à | Exemples |
|------------|-----------|----------|
| HAUTE | Antigravity | Architecture, optimisation, analyse approfondie |
| MOYENNE | AMP | Features, composants UI, API routes |
| BASSE | Codex | Tests unitaires, boilerplate, refactoring |

## Format de Mise à Jour

### Pour assigner une tâche:
```markdown
### [TASK-XXX] Titre
- **Assigned To**: [LLM]
- **Priority**: HIGH/MEDIUM/LOW
- **Status**: PENDING
- **Description**: ...
- **Files Involved**: ...
- **Date**: YYYY-MM-DD HH:MM
```

### Pour compléter une tâche:
```markdown
### [TASK-XXX] COMPLETED
- **Completed By**: [LLM]
- **Date**: YYYY-MM-DD HH:MM
- **Duration**: X minutes
- **Changes Made**: ...
- **Files Modified**: ...
```

## Configuration

Modifiez `config/orchestration.conf` pour personnaliser:
- Nom de la session tmux
- Chemins des fichiers
- Commandes des LLMs
- Timeouts

## Dépannage

### Le proxy antigravity ne répond pas
```bash
# Vérifier le processus
pgrep -f antigravity-claude-proxy

# Redémarrer manuellement
antigravity-claude-proxy start
```

### Un LLM est bloqué
1. Sélectionner le pane: `Ctrl+b` puis flèche
2. Envoyer Ctrl+C pour interrompre
3. Relancer la commande manuellement

### Session tmux perdue
```bash
# Lister les sessions
tmux ls

# Rattacher
tmux attach -t moana-orchestration
```

## Logs

Les logs sont stockés dans `logs/`:
- `orchestration.log`: Log principal du système

Pour suivre les logs en temps réel:
```bash
tail -f logs/orchestration.log
```
