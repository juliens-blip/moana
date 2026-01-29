#!/bin/bash
# =============================================================================
# Switch Orchestrator
# Change which LLM is the orchestrator (useful when Claude is out of limits)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config/orchestration.conf"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           Switch Orchestrator                                ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Current windows:"
echo "  0 = Claude"
echo "  1 = AMP"
echo "  3 = Antigravity"
echo "  4 = Codex"
echo ""

read -p "Enter new orchestrator window (1 for AMP, 3 for Antigravity): " NEW_ORCH

case $NEW_ORCH in
    1)
        ORCH_NAME="AMP"
        ;;
    3)
        ORCH_NAME="Antigravity"
        ;;
    4)
        ORCH_NAME="Codex"
        ;;
    *)
        echo "Invalid choice. Use 1, 3, or 4."
        exit 1
        ;;
esac

echo ""
echo "Switching orchestrator to $ORCH_NAME (Window $NEW_ORCH)..."

# Update CLAUDE.md
CURRENT_DATE=$(date '+%Y-%m-%d %H:%M:%S')
sed -i "s/\*\*Orchestrator\*\*: .*/\*\*Orchestrator\*\*: $ORCH_NAME/" "$CLAUDE_MD_PATH"

# Send orchestrator prompt to new orchestrator
ORCH_PROMPT="Tu es maintenant l'ORCHESTRATEUR. Lis $CLAUDE_MD_PATH section 'LLM Orchestration'. Distribue les tâches PENDING aux autres LLMs via: tmux send-keys -t moana-orchestration:X 'tâche' Enter. Windows: 0=Claude, 1=AMP, 3=Antigravity, 4=Codex. Mets à jour CLAUDE.md après chaque action."

tmux send-keys -t "$SESSION_NAME:$NEW_ORCH" "$ORCH_PROMPT" Enter

echo ""
echo "✅ $ORCH_NAME is now the orchestrator!"
echo ""
echo "Go to Window $NEW_ORCH to give tasks:"
echo "  tmux attach -t $SESSION_NAME"
echo "  Then: Ctrl+b then $NEW_ORCH"
echo ""

# Add message to CLAUDE.md
echo "| $CURRENT_DATE | System | SWITCH | - | COMPLETED | Orchestrator switched to $ORCH_NAME |" >> "$CLAUDE_MD_PATH"
