#!/usr/bin/env bash
set -euo pipefail

SESSION="${1:-orchestration-$(basename "$(pwd)")}"
PROJECT_DIR="${2:-$(pwd)}"
HANDOFF_FILE="${3:-$PROJECT_DIR/HANDOFF_TO_AMP.md}"
AMP_WINDOW="${4:-1}"

quota=$(tmux capture-pane -t "$SESSION:claude" -p 2>/dev/null | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1 || true)

cat > "$HANDOFF_FILE" << EOF
# HANDOFF SUMMARY

**Date:** $(date '+%Y-%m-%d %H:%M')
**From:** Claude
**To:** AMP
**Reason:** quota reached (${quota:-unknown}%)

## Actions
1) Read this file
2) Read $PROJECT_DIR/CLAUDE.md
3) Check workers via tmux
EOF

tmux send-keys -t "$SESSION:$AMP_WINDOW" "HANDOFF: you are the new orchestrator. Read $HANDOFF_FILE and $PROJECT_DIR/CLAUDE.md" Enter

echo "Handoff message sent to window $AMP_WINDOW"

