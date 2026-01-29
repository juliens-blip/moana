#!/bin/bash
# =============================================================================
# Health Check for Multi-LLM Orchestration System
# Verifies that all components are running correctly
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config/orchestration.conf"

echo -e "${CYAN}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     Multi-LLM Orchestration Health Check                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

HEALTHY=true

# =============================================================================
# CHECK TMUX SESSION
# =============================================================================

echo -e "${BLUE}Checking tmux session...${NC}"

if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo -e "${GREEN}[OK]${NC} Tmux session '$SESSION_NAME' is active"

    # List windows
    echo ""
    echo "Windows:"
    tmux list-windows -t "$SESSION_NAME" -F "  - #{window_index}: #{window_name}" 2>/dev/null

    # List panes in main window
    echo ""
    echo "Panes in main window:"
    tmux list-panes -t "$SESSION_NAME:0" -F "  - Pane #{pane_index}: #{pane_current_command} (#{pane_width}x#{pane_height})" 2>/dev/null
else
    echo -e "${RED}[FAIL]${NC} Tmux session '$SESSION_NAME' not found"
    HEALTHY=false
fi

# =============================================================================
# CHECK ANTIGRAVITY PROXY
# =============================================================================

echo ""
echo -e "${BLUE}Checking Antigravity Proxy...${NC}"

if pgrep -f "antigravity-claude-proxy" > /dev/null 2>&1; then
    echo -e "${GREEN}[OK]${NC} Antigravity proxy process is running"

    # Check if port is responding
    if curl -s --connect-timeout 2 "$ANTIGRAVITY_PROXY_URL" > /dev/null 2>&1; then
        echo -e "${GREEN}[OK]${NC} Proxy port 8080 is responding"
    else
        echo -e "${YELLOW}[WARN]${NC} Proxy port 8080 not responding (may be normal)"
    fi
else
    echo -e "${YELLOW}[WARN]${NC} Antigravity proxy process not detected"
fi

# =============================================================================
# CHECK CLAUDE.MD
# =============================================================================

echo ""
echo -e "${BLUE}Checking CLAUDE.md...${NC}"

if [[ -f "$CLAUDE_MD_PATH" ]]; then
    echo -e "${GREEN}[OK]${NC} CLAUDE.md exists"

    # Check for orchestration section
    if grep -q "## LLM Orchestration" "$CLAUDE_MD_PATH"; then
        echo -e "${GREEN}[OK]${NC} Orchestration section present"

        # Get current status
        STATUS=$(grep "\*\*Status\*\*:" "$CLAUDE_MD_PATH" | head -1 | sed 's/.*\*\*Status\*\*: //')
        echo -e "     Status: ${CYAN}$STATUS${NC}"

        # Get session start time
        START_TIME=$(grep "\*\*Session Started\*\*:" "$CLAUDE_MD_PATH" | head -1 | sed 's/.*\*\*Session Started\*\*: //')
        echo -e "     Started: ${CYAN}$START_TIME${NC}"
    else
        echo -e "${YELLOW}[WARN]${NC} Orchestration section not found in CLAUDE.md"
    fi
else
    echo -e "${RED}[FAIL]${NC} CLAUDE.md not found at $CLAUDE_MD_PATH"
    HEALTHY=false
fi

# =============================================================================
# CHECK LOG FILES
# =============================================================================

echo ""
echo -e "${BLUE}Checking logs...${NC}"

if [[ -d "$LOG_DIR" ]]; then
    echo -e "${GREEN}[OK]${NC} Logs directory exists"

    # Check orchestration log
    if [[ -f "$LOG_DIR/orchestration.log" ]]; then
        LOG_LINES=$(wc -l < "$LOG_DIR/orchestration.log")
        echo -e "${GREEN}[OK]${NC} Orchestration log: $LOG_LINES lines"

        # Show last 3 log entries
        echo ""
        echo "Last 3 log entries:"
        tail -3 "$LOG_DIR/orchestration.log" | sed 's/^/  /'
    else
        echo -e "${YELLOW}[WARN]${NC} Orchestration log not found"
    fi
else
    echo -e "${YELLOW}[WARN]${NC} Logs directory not found"
fi

# =============================================================================
# CHECK LLM PROCESSES
# =============================================================================

echo ""
echo -e "${BLUE}Checking LLM processes...${NC}"

# Claude
CLAUDE_COUNT=$(pgrep -fc "^claude" 2>/dev/null || echo "0")
echo -e "  Claude processes: ${CYAN}$CLAUDE_COUNT${NC}"

# AMP
AMP_COUNT=$(pgrep -fc "amp" 2>/dev/null || echo "0")
echo -e "  AMP processes: ${CYAN}$AMP_COUNT${NC}"

# Codex
CODEX_COUNT=$(pgrep -fc "codex" 2>/dev/null || echo "0")
echo -e "  Codex processes: ${CYAN}$CODEX_COUNT${NC}"

# =============================================================================
# SUMMARY
# =============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"

if $HEALTHY; then
    echo -e "${GREEN}Health check: PASSED${NC}"
    echo ""
    echo "All critical components are operational."
else
    echo -e "${RED}Health check: FAILED${NC}"
    echo ""
    echo "Some critical components are not running."
    echo "Try restarting with: $SCRIPT_DIR/start-orchestration.sh"
fi

echo "═══════════════════════════════════════════════════════════════"
