#!/usr/bin/env -S bash --norc --noprofile
# =============================================================================
# Multi-LLM Orchestrator Shutdown Script - UNIVERSAL VERSION
# =============================================================================
# Usage:
#   bash stop-orchestrator.sh                    # Arrête le projet courant
#   bash stop-orchestrator.sh /chemin/projet    # Arrête le projet spécifié
#   bash stop-orchestrator.sh orchestration-xxx  # Arrête la session spécifiée
# =============================================================================

# Déterminer la session à arrêter
if [ -n "$1" ]; then
  if [[ "$1" == orchestration-* ]]; then
    # Argument est déjà un nom de session
    SESSION_NAME="$1"
  elif [ -d "$1" ]; then
    # Argument est un chemin de projet
    PROJECT_NAME="$(basename "$1")"
    SESSION_NAME="orchestration-$PROJECT_NAME"
  else
    echo "❌ Argument invalide: $1"
    echo "   Utilisez un chemin de projet ou un nom de session (orchestration-xxx)"
    exit 1
  fi
else
  # Utiliser le projet courant
  PROJECT_NAME="$(basename "$(pwd)")"
  SESSION_NAME="orchestration-$PROJECT_NAME"
fi

echo "🛑 Arrêt Orchestrateur Multi-LLM"
echo "─────────────────────────────────"
echo "📋 Session: $SESSION_NAME"
echo ""

# 1. Arrêter le watchdog quota
echo "👁️  Arrêt du watchdog quota..."
PID_FILE="/tmp/quota_watchdog_${SESSION_NAME}.pid"
if [ -f "$PID_FILE" ]; then
  WATCHDOG_PID=$(cat "$PID_FILE")
  if kill -0 "$WATCHDOG_PID" 2>/dev/null; then
    kill "$WATCHDOG_PID" 2>/dev/null
    echo "   Watchdog arrêté (PID: $WATCHDOG_PID)"
  else
    echo "   Watchdog déjà arrêté"
  fi
  rm -f "$PID_FILE"
else
  # Chercher par nom de processus
  pkill -f "quota_watchdog.sh.*$SESSION_NAME" 2>/dev/null && echo "   Watchdog arrêté" || echo "   Aucun watchdog actif"
fi

# Nettoyer les fichiers temporaires
rm -f "/tmp/claude_quota_watchdog_${SESSION_NAME}.log"
rm -f "/tmp/claude_current_quota_${SESSION_NAME}"
rm -f "/tmp/claude_handoff_triggered_${SESSION_NAME}"
rm -f "/tmp/quota_watchdog_${SESSION_NAME}.out"

# 2. Arrêter la session tmux
echo ""
echo "🔪 Arrêt de la session tmux..."
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  tmux kill-session -t "$SESSION_NAME"
  echo "   Session '$SESSION_NAME' arrêtée"
else
  echo "   Aucune session '$SESSION_NAME' active"
fi

# 3. Proxy Antigravity (global, partagé)
# Vérifier si d'autres sessions orchestration utilisent encore le proxy
OTHER_SESSIONS=$(tmux ls 2>/dev/null | grep -c "^orchestration-" || true)
if [ "$OTHER_SESSIONS" -gt 0 ]; then
  echo ""
  echo "🌐 Proxy Antigravity: conservé ($OTHER_SESSIONS autre(s) session(s) active(s))"
else
  if lsof -i :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo ""
    read -p "🌐 Arrêter le proxy Antigravity (port 8080) ? Aucune autre session active. (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      PROXY_PID=$(lsof -i :8080 -sTCP:LISTEN -t 2>/dev/null | head -1)
      kill "$PROXY_PID" 2>/dev/null && echo "   Proxy arrêté (PID: $PROXY_PID)" || echo "   Impossible d'arrêter le proxy"
    else
      echo "   Proxy conservé"
    fi
  fi
fi

# 4. Nettoyer les fichiers de handoff si dans un projet
if [ -n "$PROJECT_DIR" ]; then
  rm -f "$PROJECT_DIR/HANDOFF_TO_AMP.md" 2>/dev/null
  rm -f "$PROJECT_DIR/HANDOFF_TO_CLAUDE.md" 2>/dev/null
fi

echo ""
echo "✅ Orchestrateur arrêté"
echo ""
echo "Pour relancer:"
echo "   bash orchestratoragent/scripts/start-orchestrator.sh"
