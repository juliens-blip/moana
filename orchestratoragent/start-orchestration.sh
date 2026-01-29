#!/bin/bash
# =============================================================================
# Multi-LLM Orchestration System for Moana Yachting
# Launches 4 LLMs: Claude, AMP, Antigravity (proxy+client), Codex
# =============================================================================

set -e

# Get script directory and load configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config/orchestration.conf"

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_DIR/orchestration.log"
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "${YELLOW}$@${NC}"; }
log_error() { log "ERROR" "${RED}$@${NC}"; }
log_success() { log "SUCCESS" "${GREEN}$@${NC}"; }

print_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║                                                                      ║"
    echo "║     🚤 MOANA YACHTING - Multi-LLM Orchestration System 🚤            ║"
    echo "║                                                                      ║"
    echo "║  ┌─────────────┬─────────────┬─────────────┬─────────────┐          ║"
    echo "║  │   Claude    │     AMP     │ Antigravity │    Codex    │          ║"
    echo "║  │ Orchestrator│   Worker    │   Worker    │   Worker    │          ║"
    echo "║  └─────────────┴─────────────┴─────────────┴─────────────┘          ║"
    echo "║                                                                      ║"
    echo "╚══════════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# =============================================================================
# PREREQUISITE CHECKS
# =============================================================================

check_prerequisites() {
    log_info "Checking prerequisites..."
    local missing=()

    # Check tmux
    if ! command -v tmux &> /dev/null; then
        missing+=("tmux")
    fi

    # Check claude
    if ! command -v claude &> /dev/null; then
        missing+=("claude")
    fi

    # Check amp
    if ! command -v amp &> /dev/null; then
        missing+=("amp")
    fi

    # Check codex
    if ! command -v codex &> /dev/null; then
        missing+=("codex")
    fi

    # Check antigravity-claude-proxy
    if ! command -v antigravity-claude-proxy &> /dev/null; then
        missing+=("antigravity-claude-proxy")
    fi

    # Check CLAUDE.md exists
    if [[ ! -f "$CLAUDE_MD_PATH" ]]; then
        log_error "CLAUDE.md not found at $CLAUDE_MD_PATH"
        exit 1
    fi

    if [[ ${#missing[@]} -gt 0 ]]; then
        log_error "Missing prerequisites: ${missing[*]}"
        echo ""
        echo -e "${YELLOW}Please install the missing tools:${NC}"
        for tool in "${missing[@]}"; do
            case $tool in
                tmux)
                    echo "  - tmux: sudo apt install tmux"
                    ;;
                claude)
                    echo "  - claude: npm install -g @anthropic-ai/claude-code"
                    ;;
                amp)
                    echo "  - amp: Install from Sourcegraph"
                    ;;
                codex)
                    echo "  - codex: npm install -g @openai/codex"
                    ;;
                antigravity-claude-proxy)
                    echo "  - antigravity-claude-proxy: npm install -g antigravity-claude-proxy"
                    ;;
            esac
        done
        exit 1
    fi

    log_success "All prerequisites satisfied"
}

# =============================================================================
# CLAUDE.MD SESSION UPDATE
# =============================================================================

update_claude_md_session() {
    log_info "Updating CLAUDE.md session status..."
    local current_date=$(date '+%Y-%m-%d %H:%M:%S')

    # Update session start time and status
    if grep -q "Session Started" "$CLAUDE_MD_PATH"; then
        sed -i "s/\*\*Session Started\*\*: .*/\*\*Session Started\*\*: $current_date/" "$CLAUDE_MD_PATH"
        sed -i "s/\*\*Status\*\*: .*/\*\*Status\*\*: ACTIVE/" "$CLAUDE_MD_PATH"
    fi

    log_success "CLAUDE.md session updated"
}

# =============================================================================
# TMUX SESSION SETUP - 5 SEPARATE WINDOWS
# =============================================================================

setup_tmux_session() {
    log_info "Setting up tmux session: $SESSION_NAME"

    # Kill existing session if present
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        log_warn "Existing session found. Killing it..."
        tmux kill-session -t "$SESSION_NAME"
        sleep 1
    fi

    # Create new session with Window 0: Claude Orchestrator
    tmux new-session -d -s "$SESSION_NAME" -n "0-Claude" -c "$PROJECT_DIR"

    # Window 1: AMP Worker
    tmux new-window -t "$SESSION_NAME" -n "1-AMP" -c "$PROJECT_DIR"

    # Window 2: Antigravity Proxy (MUST stay open)
    tmux new-window -t "$SESSION_NAME" -n "2-Proxy" -c "$PROJECT_DIR"

    # Window 3: Antigravity Client (connects to proxy)
    tmux new-window -t "$SESSION_NAME" -n "3-Antigravity" -c "$PROJECT_DIR"

    # Window 4: Codex Worker
    tmux new-window -t "$SESSION_NAME" -n "4-Codex" -c "$PROJECT_DIR"

    # Select first window
    tmux select-window -t "$SESSION_NAME:0"

    log_success "Tmux session created with 5 windows"
    echo ""
    echo -e "${BLUE}Windows created:${NC}"
    echo "  0-Claude      : Claude Code Orchestrator (--dangerously-skip-permissions)"
    echo "  1-AMP         : AMP Worker (--dangerously-allow-all)"
    echo "  2-Proxy       : Antigravity Claude Proxy (must stay open)"
    echo "  3-Antigravity : Antigravity Claude Client (extended thinking)"
    echo "  4-Codex       : Codex Worker (--dangerously-bypass-approvals-and-sandbox)"
    echo ""
}

# =============================================================================
# LLM LAUNCHERS
# =============================================================================

launch_antigravity_proxy() {
    log_info "Launching Antigravity Claude Proxy (Window 2)..."

    tmux send-keys -t "$SESSION_NAME:2" "echo -e '${MAGENTA}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo -e '${MAGENTA}     ANTIGRAVITY CLAUDE PROXY                      ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo -e '${MAGENTA}     Keep this window open!                        ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo -e '${MAGENTA}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo 'Starting proxy on port 8080...'" Enter
    tmux send-keys -t "$SESSION_NAME:2" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:2" "antigravity-claude-proxy start" Enter

    # Wait for proxy to start
    log_info "Waiting ${PROXY_STARTUP_WAIT}s for proxy to initialize..."
    sleep $PROXY_STARTUP_WAIT
    log_success "Antigravity Proxy launched"
}

launch_antigravity_client() {
    log_info "Launching Antigravity Claude Client (Window 3)..."

    local prompt_file="$PROMPTS_DIR/antigravity-worker.md"

    # Set environment variables first
    tmux send-keys -t "$SESSION_NAME:3" "echo -e '${MAGENTA}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo -e '${MAGENTA}     ANTIGRAVITY CLAUDE CLIENT (Extended Thinking) ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo -e '${MAGENTA}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo ''" Enter

    # Export environment variables
    tmux send-keys -t "$SESSION_NAME:3" "export ANTHROPIC_BASE_URL=\"http://localhost:8080\"" Enter
    tmux send-keys -t "$SESSION_NAME:3" "export ANTHROPIC_AUTH_TOKEN=\"test\"" Enter
    tmux send-keys -t "$SESSION_NAME:3" "export ANTHROPIC_MODEL=\"claude-opus-4-5-thinking\"" Enter

    tmux send-keys -t "$SESSION_NAME:3" "echo 'Environment configured:'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo '  ANTHROPIC_BASE_URL=http://localhost:8080'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo '  ANTHROPIC_MODEL=claude-opus-4-5-thinking'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo 'Launching Claude with extended thinking...'" Enter
    tmux send-keys -t "$SESSION_NAME:3" "echo ''" Enter

    # Wait a bit then launch Claude
    tmux send-keys -t "$SESSION_NAME:3" "sleep 2 && claude --dangerously-skip-permissions --model claude-opus-4-5-thinking" Enter

    # Wait for client to start
    sleep $ANTIGRAVITY_CLIENT_WAIT

    # Send initial prompt if file exists
    if [[ -f "$prompt_file" ]]; then
        log_info "Sending initial prompt to Antigravity..."
        local prompt=$(cat "$prompt_file")
        sleep 3
        tmux send-keys -t "$SESSION_NAME:3" "$prompt" Enter
    fi

    log_success "Antigravity Claude Client launched"
}

launch_claude_orchestrator() {
    log_info "Launching Claude Orchestrator (Window 0)..."

    local prompt_file="$PROMPTS_DIR/claude-orchestrator.md"

    tmux send-keys -t "$SESSION_NAME:0" "echo -e '${GREEN}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:0" "echo -e '${GREEN}     CLAUDE ORCHESTRATOR                           ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:0" "echo -e '${GREEN}     Main coordinator for all LLMs                 ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:0" "echo -e '${GREEN}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:0" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:0" "cd $PROJECT_DIR && claude --dangerously-skip-permissions" Enter

    # Wait for Claude to start
    sleep $LLM_STARTUP_WAIT

    # Send initial prompt if file exists
    if [[ -f "$prompt_file" ]]; then
        log_info "Sending initial prompt to Claude Orchestrator..."
        local prompt=$(cat "$prompt_file")
        sleep 2
        tmux send-keys -t "$SESSION_NAME:0" "$prompt" Enter
    fi

    log_success "Claude Orchestrator launched"
}

launch_amp() {
    log_info "Launching AMP Worker (Window 1)..."

    local prompt_file="$PROMPTS_DIR/amp-worker.md"

    tmux send-keys -t "$SESSION_NAME:1" "echo -e '${YELLOW}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:1" "echo -e '${YELLOW}     AMP WORKER                                    ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:1" "echo -e '${YELLOW}     Implementation tasks                          ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:1" "echo -e '${YELLOW}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:1" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:1" "cd $PROJECT_DIR && amp -m large --dangerously-allow-all" Enter

    sleep $LLM_STARTUP_WAIT

    # Send initial prompt if file exists
    if [[ -f "$prompt_file" ]]; then
        log_info "Sending initial prompt to AMP..."
        local prompt=$(cat "$prompt_file")
        sleep 2
        tmux send-keys -t "$SESSION_NAME:1" "$prompt" Enter
    fi

    log_success "AMP Worker launched"
}

launch_codex() {
    log_info "Launching Codex Worker (Window 4)..."

    local prompt_file="$PROMPTS_DIR/codex-worker.md"

    tmux send-keys -t "$SESSION_NAME:4" "echo -e '${BLUE}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:4" "echo -e '${BLUE}     CODEX WORKER                                  ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:4" "echo -e '${BLUE}     Code generation tasks                         ${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:4" "echo -e '${BLUE}═══════════════════════════════════════════════════${NC}'" Enter
    tmux send-keys -t "$SESSION_NAME:4" "echo ''" Enter
    tmux send-keys -t "$SESSION_NAME:4" "cd $PROJECT_DIR && codex --dangerously-bypass-approvals-and-sandbox" Enter

    sleep $LLM_STARTUP_WAIT

    # Send initial prompt if file exists
    if [[ -f "$prompt_file" ]]; then
        log_info "Sending initial prompt to Codex..."
        local prompt=$(cat "$prompt_file")
        sleep 2
        tmux send-keys -t "$SESSION_NAME:4" "$prompt" Enter
    fi

    log_success "Codex Worker launched"
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Create logs directory
    mkdir -p "$LOG_DIR"

    # Clear previous log
    echo "" > "$LOG_DIR/orchestration.log"

    print_banner

    log_info "Starting Multi-LLM Orchestration System..."
    log_info "Project directory: $PROJECT_DIR"
    log_info "Session name: $SESSION_NAME"
    echo ""

    # Run checks
    check_prerequisites

    # Update CLAUDE.md session
    update_claude_md_session

    # Setup tmux with 5 windows
    setup_tmux_session

    # Launch LLMs in order:
    # 1. Proxy first (must be running before client)
    # 2. Then all others
    echo -e "${CYAN}Launching LLMs...${NC}"
    echo ""

    launch_antigravity_proxy      # Window 2 - Must start first
    launch_claude_orchestrator    # Window 0
    launch_amp                    # Window 1
    launch_codex                  # Window 4
    launch_antigravity_client     # Window 3 - Must start after proxy

    echo ""
    log_success "All LLMs launched successfully!"
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         Orchestration System is now RUNNING!                 ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${CYAN}To attach to the tmux session:${NC}"
    echo -e "  ${YELLOW}tmux attach -t $SESSION_NAME${NC}"
    echo ""
    echo -e "${CYAN}Navigation shortcuts:${NC}"
    echo "  - Ctrl+b then 0-4    : Switch to window by number"
    echo "  - Ctrl+b then n      : Next window"
    echo "  - Ctrl+b then p      : Previous window"
    echo "  - Ctrl+b then d      : Detach from session"
    echo "  - Ctrl+b then w      : List all windows"
    echo ""
    echo -e "${CYAN}Windows:${NC}"
    echo "  0 = Claude Orchestrator"
    echo "  1 = AMP Worker"
    echo "  2 = Antigravity Proxy (keep open!)"
    echo "  3 = Antigravity Client"
    echo "  4 = Codex Worker"
    echo ""
    echo -e "${CYAN}To stop orchestration:${NC}"
    echo -e "  ${YELLOW}$SCRIPT_DIR/stop-orchestration.sh${NC}"
    echo ""

    # Ask to attach
    read -p "Attach to session now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        tmux attach -t "$SESSION_NAME"
    else
        echo ""
        echo "Session running in background. Use 'tmux attach -t $SESSION_NAME' to connect."
    fi
}

# Run main
main "$@"
