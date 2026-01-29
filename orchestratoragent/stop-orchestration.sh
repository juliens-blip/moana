#!/bin/bash
# =============================================================================
# Stop Multi-LLM Orchestration System
# Gracefully shuts down all LLMs and the tmux session
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config/orchestration.conf"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Stopping Multi-LLM Orchestration System                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Update CLAUDE.md with shutdown status
if [[ -f "$CLAUDE_MD_PATH" ]]; then
    local current_date=$(date '+%Y-%m-%d %H:%M:%S')

    # Update status to STOPPED
    if grep -q "\*\*Status\*\*: ACTIVE" "$CLAUDE_MD_PATH"; then
        sed -i "s/\*\*Status\*\*: ACTIVE/\*\*Status\*\*: STOPPED ($current_date)/" "$CLAUDE_MD_PATH"
        echo -e "${GREEN}[OK]${NC} Updated CLAUDE.md with shutdown status"
    fi

    # Add shutdown log entry if table exists
    if grep -q "### Task Completion Log" "$CLAUDE_MD_PATH"; then
        # Add a log entry before the first data row
        sed -i "/^| Date | LLM | Task ID/a | $current_date | System | SHUTDOWN | - | COMPLETED | Orchestration system stopped |" "$CLAUDE_MD_PATH" 2>/dev/null || true
    fi
fi

# Kill tmux session
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${YELLOW}Terminating tmux session '$SESSION_NAME'...${NC}"
    tmux kill-session -t "$SESSION_NAME"
    echo -e "${GREEN}[OK]${NC} Tmux session terminated"
else
    echo -e "${YELLOW}[WARN]${NC} No active session '$SESSION_NAME' found"
fi

# Kill any orphaned antigravity proxy processes
if pgrep -f "antigravity-claude-proxy" > /dev/null 2>&1; then
    echo -e "${YELLOW}Killing orphaned antigravity proxy processes...${NC}"
    pkill -f "antigravity-claude-proxy" 2>/dev/null
    echo -e "${GREEN}[OK]${NC} Antigravity proxy processes killed"
fi

# Kill any orphaned claude processes started by this orchestration
# (Be careful not to kill user's manual claude sessions)
# We only kill those with the specific model flag from antigravity
if pgrep -f "claude.*claude-opus-4-5-thinking" > /dev/null 2>&1; then
    echo -e "${YELLOW}Killing antigravity claude client processes...${NC}"
    pkill -f "claude.*claude-opus-4-5-thinking" 2>/dev/null
    echo -e "${GREEN}[OK]${NC} Antigravity claude clients killed"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Orchestration System STOPPED                         ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "To restart, run:"
echo -e "  ${YELLOW}$SCRIPT_DIR/start-orchestration.sh${NC}"
