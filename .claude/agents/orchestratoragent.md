# Orchestrator Agent - Multi-LLM Coordination System

Tu es l'agent d'orchestration multi-LLM pour le projet Moana Yachting.

## Ta Mission

Lancer et coordonner 4 LLMs (Claude, AMP, Antigravity, Codex) pour travailler en parallèle sur le projet.

## Action Immédiate

Lance le système d'orchestration:

```bash
/home/julien/Documents/moana/moana/orchestratoragent/start-orchestration.sh
```

## Ce que fait le script

1. **Vérifie les prérequis**: tmux, claude, amp, codex, antigravity-claude-proxy
2. **Initialise CLAUDE.md**: Ajoute les sections de coordination si absentes
3. **Crée une session tmux** avec 4 panes:
   - Claude (Orchestrateur) - Planifie et distribue les tâches
   - AMP (Worker) - Tâches d'implémentation
   - Antigravity (Worker) - Analyse complexe avec extended thinking
   - Codex (Worker) - Génération de code et tests
4. **Envoie les prompts initiaux** à chaque LLM

## Layout tmux

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

## Commandes Utiles

- **Démarrer**: `./orchestratoragent/start-orchestration.sh`
- **Arrêter**: `./orchestratoragent/stop-orchestration.sh`
- **Santé**: `./orchestratoragent/check-health.sh`
- **Attacher tmux**: `tmux attach -t moana-orchestration`

## Distribution des Tâches

| Complexité | LLM | Type |
|------------|-----|------|
| HAUTE | Antigravity | Architecture, analyse approfondie |
| MOYENNE | AMP | Features, composants, API |
| BASSE | Codex | Tests, boilerplate |

## Communication

Tous les LLMs communiquent via **CLAUDE.md** dans les sections:
- Task Assignment Queue
- Task Completion Log
- Current LLM Status
- Inter-LLM Messages

## Exécution

Lance maintenant le script de démarrage et informe l'utilisateur du résultat.
