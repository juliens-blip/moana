#!/usr/bin/env bash
# =============================================================================
# quota_watchdog.sh - Surveillance quota Claude + Handoff automatique à 93%
# =============================================================================
# Usage:
#   ./quota_watchdog.sh [session] [threshold] [interval]
#   nohup ./quota_watchdog.sh orchestration-moana 93 30 &
# =============================================================================

set -e

SESSION="${1:-orchestration-$(basename $(pwd))}"
ALERT_THRESHOLD="${2:-93}"
CHECK_INTERVAL="${3:-30}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/claude_quota_watchdog_${SESSION}.log"
QUOTA_FILE="/tmp/claude_current_quota_${SESSION}"
HANDOFF_TRIGGERED="/tmp/claude_handoff_triggered_${SESSION}"
PID_FILE="/tmp/quota_watchdog_${SESSION}.pid"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_quota() {
    local content=$(tmux capture-pane -t "$SESSION:claude" -p -S -50 2>/dev/null)
    local quota=$(echo "$content" | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1)
    echo "$quota"
}

trigger_handoff() {
    local quota=$1

    # Éviter handoff multiple
    if [[ -f "$HANDOFF_TRIGGERED" ]]; then
        log "${YELLOW}Handoff déjà déclenché, skip${NC}"
        return
    fi

    log "${RED}═══════════════════════════════════════${NC}"
    log "${RED}  HANDOFF AUTOMATIQUE DÉCLENCHÉ!${NC}"
    log "${RED}  Quota: ${quota}% >= ${ALERT_THRESHOLD}%${NC}"
    log "${RED}═══════════════════════════════════════${NC}"

    # Marquer comme déclenché
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Quota: ${quota}%" > "$HANDOFF_TRIGGERED"

    # Notification desktop (si disponible)
    notify-send -u critical "Claude Handoff" "Quota ${quota}% - Transfert vers AMP!" 2>/dev/null || true

    # Exécuter le handoff
    if [[ -f "$SCRIPT_DIR/auto_handoff_to_amp.sh" ]]; then
        log "Exécution de auto_handoff_to_amp.sh..."
        bash "$SCRIPT_DIR/auto_handoff_to_amp.sh" "$SESSION"
    else
        log "${RED}ERREUR: auto_handoff_to_amp.sh non trouvé!${NC}"
        # Fallback: envoyer message direct à AMP
        tmux send-keys -t "$SESSION:amp" "HANDOFF URGENT: Claude à ${quota}%. Tu deviens orchestrateur. Charge @/home/julien/Documents/moana/agents_library/agent-orchestrator-universal/universal-orchestrator.md puis lis CLAUDE.md." Enter
    fi

    log "Handoff envoyé. Arrêt du watchdog."
    exit 0
}

cleanup() {
    log "Arrêt du watchdog..."
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Vérifier que la session existe
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${RED}Session tmux '$SESSION' non trouvée${NC}"
    exit 1
fi

# Enregistrer le PID
echo $$ > "$PID_FILE"

# Nettoyer les anciens fichiers de handoff
rm -f "$HANDOFF_TRIGGERED"

log "${CYAN}═══════════════════════════════════════${NC}"
log "${CYAN}  QUOTA WATCHDOG DÉMARRÉ${NC}"
log "${CYAN}═══════════════════════════════════════${NC}"
log "Session: $SESSION"
log "Seuil handoff: ${ALERT_THRESHOLD}%"
log "Intervalle: ${CHECK_INTERVAL}s"
log "PID: $$"
log "Log: $LOG_FILE"
log ""

while true; do
    QUOTA=$(get_quota)

    if [[ -n "$QUOTA" ]] && [[ "$QUOTA" =~ ^[0-9]+$ ]]; then
        echo "$QUOTA" > "$QUOTA_FILE"

        # Barre de progression
        BAR_WIDTH=20
        FILLED=$((QUOTA * BAR_WIDTH / 100))
        EMPTY=$((BAR_WIDTH - FILLED))
        BAR=$(printf "%${FILLED}s" | tr ' ' '█')$(printf "%${EMPTY}s" | tr ' ' '░')

        if [[ "$QUOTA" -ge "$ALERT_THRESHOLD" ]]; then
            log "${RED}[${BAR}] ${QUOTA}% - SEUIL ATTEINT!${NC}"
            trigger_handoff "$QUOTA"
        elif [[ "$QUOTA" -ge 85 ]]; then
            log "${YELLOW}[${BAR}] ${QUOTA}% - Critique${NC}"
        elif [[ "$QUOTA" -ge 75 ]]; then
            log "${YELLOW}[${BAR}] ${QUOTA}% - Élevé${NC}"
        else
            log "${GREEN}[${BAR}] ${QUOTA}% - OK${NC}"
        fi
    else
        log "${YELLOW}Quota non détecté (Claude inactif?)${NC}"
    fi

    sleep "$CHECK_INTERVAL"
done
