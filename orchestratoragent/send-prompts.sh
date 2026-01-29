#!/bin/bash
# =============================================================================
# Send prompts to all LLMs
# Run this AFTER LLMs are ready (after start-orchestration.sh)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config/orchestration.conf"

echo "Sending prompts to all LLMs..."
echo ""

# Simple one-line prompts that work with tmux send-keys
# Each LLM reads CLAUDE.md and their role file

# Claude Orchestrator (Window 0)
echo "→ Sending to Claude (Window 0)..."
tmux send-keys -t "$SESSION_NAME:0" "Tu es l'orchestrateur. Lis $CLAUDE_MD_PATH section 'LLM Orchestration' et distribue les tâches aux autres LLMs via: tmux send-keys -t moana-orchestration:1 'tâche' Enter (AMP), :3 (Antigravity), :4 (Codex). Toi tu fais les tâches complexes. Mets à jour CLAUDE.md après chaque action." Enter
sleep 2

# AMP Worker (Window 1)
echo "→ Sending to AMP (Window 1)..."
tmux send-keys -t "$SESSION_NAME:1" "Tu es AMP Worker. Projet: $PROJECT_DIR. Quand tu reçois une tâche, exécute-la. Quand tu as fini, mets à jour $CLAUDE_MD_PATH section Task Completion Log avec: date, AMP, tâche, durée, COMPLETED, fichiers modifiés. Puis vérifie s'il y a d'autres tâches pour toi dans CLAUDE.md." Enter
sleep 2

# Codex Worker (Window 4)
echo "→ Sending to Codex (Window 4)..."
tmux send-keys -t "$SESSION_NAME:4" "Tu es Codex Worker. Projet: $PROJECT_DIR. Quand tu reçois une tâche, exécute-la (types TypeScript, Zod, tests). Quand tu as fini, mets à jour $CLAUDE_MD_PATH section Task Completion Log. Puis vérifie s'il y a d'autres tâches pour toi dans CLAUDE.md." Enter
sleep 2

# Antigravity Client (Window 3)
echo "→ Sending to Antigravity (Window 3)..."
tmux send-keys -t "$SESSION_NAME:3" "Tu es Antigravity Worker (extended thinking). Projet: $PROJECT_DIR. Quand tu reçois une tâche d'analyse/architecture, utilise ta réflexion étendue. Quand tu as fini, mets à jour $CLAUDE_MD_PATH section Task Completion Log avec ton analyse. Puis vérifie s'il y a d'autres tâches pour toi." Enter
sleep 2

echo ""
echo "✅ All prompts sent!"
echo ""
echo "Now go to Window 0 (Claude) and give your task:"
echo "  Ctrl+b then 0"
echo ""
