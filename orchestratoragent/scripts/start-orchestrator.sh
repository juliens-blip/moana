#!/usr/bin/env -S bash --norc --noprofile
# =============================================================================
# Multi-LLM Orchestrator Startup Script - UNIVERSAL VERSION
# =============================================================================
# Usage:
#   bash start-orchestrator.sh                    # Utilise le projet courant (pwd)
#   bash start-orchestrator.sh /chemin/projet    # Utilise le projet spécifié
#   bash start-orchestrator.sh --help            # Affiche l'aide
# =============================================================================

set -e  # Exit on error

# Charger l'environnement utilisateur (nvm, etc.) - silencieux
{
  # Charger nvm directement si disponible
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  [ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"

  # Charger le profil utilisateur
  [ -f "$HOME/.profile" ] && source "$HOME/.profile"
} &>/dev/null || true

# Aide
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  echo "Usage: $0 [OPTIONS] [PROJECT_DIR]"
  echo ""
  echo "Lance l'orchestrateur Multi-LLM pour un projet."
  echo ""
  echo "Options:"
  echo "  --orchestrator <llm>   LLM orchestrateur (claude|amp|antigravity|codex, défaut: claude)"
  echo ""
  echo "Arguments:"
  echo "  PROJECT_DIR   Chemin vers le projet (défaut: répertoire courant)"
  echo ""
  echo "Exemples:"
  echo "  $0                                        # Claude orchestre, projet courant"
  echo "  $0 --orchestrator amp /home/user/projet   # AMP orchestre"
  echo "  $0 --orchestrator codex                   # Codex orchestre, projet courant"
  echo ""
  echo "Prérequis: tmux, claude, amp, codex, antigravity-claude-proxy"
  exit 0
fi

# Parser les options
ORCHESTRATOR_LLM="claude"
while [[ "$1" == --* ]]; do
  case "$1" in
    --orchestrator)
      ORCHESTRATOR_LLM="$2"
      shift 2
      ;;
    *)
      echo "❌ Option inconnue: $1"
      exit 1
      ;;
  esac
done

# Valider le choix d'orchestrateur
case "$ORCHESTRATOR_LLM" in
  claude|amp|antigravity|codex) ;;
  *)
    echo "❌ Orchestrateur invalide: $ORCHESTRATOR_LLM (choix: claude, amp, antigravity, codex)"
    exit 1
    ;;
esac

# Déterminer le projet
if [ -n "$1" ]; then
  TARGET_PROJECT="$(cd "$1" && pwd)"
else
  TARGET_PROJECT="$(pwd)"
fi

# Vérifier que le répertoire existe
if [ ! -d "$TARGET_PROJECT" ]; then
  echo "❌ Répertoire projet introuvable: $TARGET_PROJECT"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config/orchestration.conf"

# Charger config de base (pour les commandes LLM et timeouts seulement)
if [ -f "$CONFIG_FILE" ]; then
  source "$CONFIG_FILE"
fi

# IMPORTANT: Override avec le projet cible (après avoir chargé la config)
PROJECT_DIR="$TARGET_PROJECT"
PROJECT_NAME="$(basename "$TARGET_PROJECT")"
CLAUDE_MD_PATH="$TARGET_PROJECT/CLAUDE.md"
SESSION_NAME="orchestration-$PROJECT_NAME"

# Chemin vers l'agent orchestrateur universel
ORCHESTRATOR_AGENT="/home/julien/Documents/moana/agents_library/agent-orchestrator-universal/universal-orchestrator.md"

# Valeurs par défaut si pas de config
CLAUDE_CMD="${CLAUDE_CMD:-claude --dangerously-skip-permissions}"
AMP_CMD="${AMP_CMD:-amp -m large --dangerously-allow-all}"
CODEX_CMD="${CODEX_CMD:-codex --dangerously-bypass-approvals-and-sandbox}"
ANTIGRAVITY_PROXY_CMD="${ANTIGRAVITY_PROXY_CMD:-antigravity-claude-proxy start}"
AMP_AUTH_ENV_VAR="${AMP_AUTH_ENV_VAR:-SRC_ACCESS_TOKEN}"
AMP_PRIMARY_TOKEN="${AMP_PRIMARY_TOKEN:-}"
AMP_SECONDARY_TOKEN="${AMP_SECONDARY_TOKEN:-}"
LLM_STARTUP_WAIT="${LLM_STARTUP_WAIT:-10}"
PROXY_STARTUP_WAIT="${PROXY_STARTUP_WAIT:-8}"
ANTIGRAVITY_CLIENT_WAIT="${ANTIGRAVITY_CLIENT_WAIT:-12}"

echo "🚀 Démarrage Orchestrateur Multi-LLM v2026 - UNIVERSAL"
echo "─────────────────────────────────────────────────────"
echo "📁 Projet: $PROJECT_DIR"
echo "📋 Session: $SESSION_NAME"
echo "🎯 Orchestrateur: $ORCHESTRATOR_LLM"
echo ""

# 0. Synchroniser agents_library dans le projet
AGENTS_LIB_SOURCE="/home/julien/Documents/moana/agents_library"
if [ -d "$AGENTS_LIB_SOURCE" ]; then
  if [ ! -d "$PROJECT_DIR/agents_library" ]; then
    echo "📦 Copie agents_library dans le projet..."
    cp -r "$AGENTS_LIB_SOURCE" "$PROJECT_DIR/agents_library"
    echo "✅ agents_library copiée"
  else
    echo "🔄 Synchronisation agents_library..."
    rsync -a --update "$AGENTS_LIB_SOURCE/" "$PROJECT_DIR/agents_library/"
    echo "✅ agents_library synchronisée"
  fi
else
  echo "⚠️  agents_library source non trouvée: $AGENTS_LIB_SOURCE"
fi

# 1. Vérifier CLAUDE.md existe
if [ ! -f "$CLAUDE_MD_PATH" ]; then
  echo "⚠️  CLAUDE.md manquant - Création automatique..."
  cat > "$CLAUDE_MD_PATH" <<EOF
# Mémoire Projet - $PROJECT_NAME

## 📋 État Global
- **Tâche principale:** [À définir]
- **Progression:** 0%
- **Orchestrateur actuel:** Claude
- **Tokens Claude:** 0/200000 (0%)
- **Projet:** $PROJECT_DIR

## Task Assignment Queue
| ID | Task | Assigned To | Priority | Status | Created |
|----|------|-------------|----------|--------|---------|

## Inter-LLM Messages
| From | To | Message | Time |
|------|----|---------|------|

## Task Completion Log
| Date | LLM | Task ID | Duration | Status | Notes |
|------|-----|---------|----------|--------|-------|
EOF
  echo "✅ CLAUDE.md créé à $CLAUDE_MD_PATH"
fi

# 2. Créer session tmux si inexistante
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
  echo "ℹ️  Session tmux '$SESSION_NAME' déjà active"
  read -p "Voulez-vous la recréer ? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Arrêt de la session existante..."
    tmux kill-session -t "$SESSION_NAME"
  else
    echo "✅ Utilisation de la session existante"
    exit 0
  fi
fi

echo "📦 Création session tmux '$SESSION_NAME'..."
tmux new-session -d -s "$SESSION_NAME" -n main

# Créer fenêtres pour chaque LLM (ordre: proxy/antigravity en 1/2)
tmux new-window -t "$SESSION_NAME" -n antigravity-proxy
tmux new-window -t "$SESSION_NAME" -n antigravity
tmux new-window -t "$SESSION_NAME" -n claude
tmux new-window -t "$SESSION_NAME" -n amp
tmux new-window -t "$SESSION_NAME" -n amp-2
tmux new-window -t "$SESSION_NAME" -n codex

echo "✅ Session tmux créée"

# 3. Démarrer Antigravity Proxy (global, partagé entre projets)
# Le proxy écoute sur port 8080 - un seul suffit pour tous les projets
if lsof -i :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
  PROXY_PID=$(lsof -i :8080 -sTCP:LISTEN -t 2>/dev/null | head -1)
  echo "🌐 Proxy Antigravity déjà actif (PID: $PROXY_PID, port 8080)"
  echo "   Réutilisation du proxy existant (partagé entre projets)"
  tmux send-keys -t "$SESSION_NAME:antigravity-proxy" "echo 'Proxy déjà actif sur port 8080 (PID: $PROXY_PID). Partagé avec d autres sessions.'" C-m
else
  echo "🌐 Démarrage Antigravity Proxy (global, port 8080)..."
  tmux send-keys -t "$SESSION_NAME:antigravity-proxy" "$ANTIGRAVITY_PROXY_CMD" C-m
  echo "   Attente ${PROXY_STARTUP_WAIT}s pour le proxy..."
  sleep $PROXY_STARTUP_WAIT

  # Vérifier que le proxy a bien démarré
  if lsof -i :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "   ✅ Proxy démarré sur port 8080"
  else
    echo "   ⚠️  Proxy potentiellement pas encore prêt (vérifier manuellement)"
  fi
fi

# 4. Démarrer Claude Orchestrator
echo "🧠 Démarrage Claude (Orchestrator)..."
tmux send-keys -t "$SESSION_NAME:claude" "cd $PROJECT_DIR" C-m
tmux send-keys -t "$SESSION_NAME:claude" "$CLAUDE_CMD" C-m
echo "   Attente ${LLM_STARTUP_WAIT}s..."
sleep $LLM_STARTUP_WAIT

# 4b. Construire la liste des fenêtres des AUTRES LLMs (pas l'orchestrateur)
WINDOW_LIST=""
for llm_name in claude amp antigravity codex; do
  if [ "$llm_name" != "$ORCHESTRATOR_LLM" ]; then
    case "$llm_name" in
      claude)      WINDOW_LIST="$WINDOW_LIST 3=Claude" ;;
      amp)         WINDOW_LIST="$WINDOW_LIST 4=AMP" ;;
      antigravity) WINDOW_LIST="$WINDOW_LIST 2=Antigravity" ;;
      codex)       WINDOW_LIST="$WINDOW_LIST 6=Codex" ;;
    esac
  fi
done

# Déterminer la fenêtre de l'orchestrateur
case "$ORCHESTRATOR_LLM" in
  claude)      ORCH_WINDOW="claude" ;;
  amp)         ORCH_WINDOW="amp" ;;
  antigravity) ORCH_WINDOW="antigravity" ;;
  codex)       ORCH_WINDOW="codex" ;;
esac

# Chemin local (dans le projet) vers l'agent
LOCAL_AGENT="$PROJECT_DIR/agents_library/agent-orchestrator-universal/universal-orchestrator.md"
LOCAL_SKILL_COMM="$PROJECT_DIR/agents_library/agent-orchestrator-universal/skills/communication-inter-agents.md"
LOCAL_SKILL_QUOTA="$PROJECT_DIR/agents_library/agent-orchestrator-universal/skills/quota-monitoring-handoff.md"
LOCAL_SKILL_TASKS="$PROJECT_DIR/agents_library/agent-orchestrator-universal/skills/task-distribution-memory-sync.md"

echo "📋 Envoi du rôle d'orchestrateur à $ORCHESTRATOR_LLM (fenêtre: $ORCH_WINDOW)..."

# Prompt qui charge l'agent, les skills, et lance la boucle continue
tmux send-keys -t "$SESSION_NAME:$ORCH_WINDOW" "Tu es ORCHESTRATEUR PRINCIPAL. Charge ces agents et skills: @$LOCAL_AGENT @$LOCAL_SKILL_COMM @$LOCAL_SKILL_QUOTA @$LOCAL_SKILL_TASKS - Session tmux: $SESSION_NAME, Fenêtres LLMs:$WINDOW_LIST. Tu coordonnes ET tu travailles toi-même. Lis CLAUDE.md puis lance la BOUCLE CONTINUE: décomposer les tâches, distribuer aux LLMs + t'auto-assigner du travail, poll CLAUDE.md toutes les 80s, redistribuer immédiatement quand un LLM termine, et une fois toutes les features faites déléguer les tests automatiquement. Ne t'arrête PAS entre les batches. Rapport final uniquement quand tout est terminé et testé." Enter
echo "   Attente 8s pour chargement des agents et skills..."
sleep 8

# 5. Démarrer Amp
echo "⚡ Démarrage Amp..."
tmux send-keys -t "$SESSION_NAME:amp" "cd $PROJECT_DIR" C-m
if [ -n "${AMP_TOKENS:-}" ]; then
  # shellcheck disable=SC2206
  AMP_TOKENS_ARRAY=(${AMP_TOKENS})
  if [ -n "${AMP_TOKENS_ARRAY[0]:-}" ]; then
    tmux send-keys -t "$SESSION_NAME:amp" "export ${AMP_AUTH_ENV_VAR}=\"${AMP_TOKENS_ARRAY[0]}\"" C-m
  fi
  if [ -n "${AMP_TOKENS_ARRAY[1]:-}" ]; then
    tmux send-keys -t "$SESSION_NAME:amp-2" "cd $PROJECT_DIR" C-m
    tmux send-keys -t "$SESSION_NAME:amp-2" "export ${AMP_AUTH_ENV_VAR}=\"${AMP_TOKENS_ARRAY[1]}\"" C-m
  fi
elif [ -n "${AMP_PRIMARY_TOKEN:-}" ]; then
  tmux send-keys -t "$SESSION_NAME:amp" "export ${AMP_AUTH_ENV_VAR}=\"${AMP_PRIMARY_TOKEN}\"" C-m
elif [ -n "${AMP_SECONDARY_TOKEN:-}" ]; then
  tmux send-keys -t "$SESSION_NAME:amp" "export ${AMP_AUTH_ENV_VAR}=\"${AMP_SECONDARY_TOKEN}\"" C-m
fi
tmux send-keys -t "$SESSION_NAME:amp" "$AMP_CMD" C-m
if tmux list-windows -t "$SESSION_NAME" | grep -q "amp-2"; then
  tmux send-keys -t "$SESSION_NAME:amp-2" "$AMP_CMD" C-m
fi
echo "   Attente ${LLM_STARTUP_WAIT}s..."
sleep $LLM_STARTUP_WAIT

# 6. Démarrer Antigravity (connecté au proxy)
echo "🚀 Démarrage Antigravity..."
tmux send-keys -t "$SESSION_NAME:antigravity" "cd $PROJECT_DIR" C-m
tmux send-keys -t "$SESSION_NAME:antigravity" "export ANTHROPIC_BASE_URL=\"http://localhost:8080\"" C-m
tmux send-keys -t "$SESSION_NAME:antigravity" "export ANTHROPIC_AUTH_TOKEN=\"test\"" C-m
tmux send-keys -t "$SESSION_NAME:antigravity" "export ANTHROPIC_MODEL=\"claude-opus-4-5-thinking\"" C-m
tmux send-keys -t "$SESSION_NAME:antigravity" "claude --dangerously-skip-permissions --model claude-opus-4-5-thinking" C-m
echo "   Attente ${ANTIGRAVITY_CLIENT_WAIT}s..."
sleep $ANTIGRAVITY_CLIENT_WAIT

# 7. Démarrer Codex
echo "💻 Démarrage Codex..."
tmux send-keys -t "$SESSION_NAME:codex" "cd $PROJECT_DIR" C-m
tmux send-keys -t "$SESSION_NAME:codex" "$CODEX_CMD" C-m
echo "   Attente ${LLM_STARTUP_WAIT}s..."
sleep $LLM_STARTUP_WAIT

# 8. Démarrer le watchdog quota en background
echo "👁️  Démarrage du watchdog quota (handoff auto à 93%)..."
WATCHDOG_SCRIPT="$SCRIPT_DIR/quota_watchdog.sh"
if [ -f "$WATCHDOG_SCRIPT" ]; then
  chmod +x "$WATCHDOG_SCRIPT"
  nohup bash "$WATCHDOG_SCRIPT" "$SESSION_NAME" 93 30 > /tmp/quota_watchdog_${SESSION_NAME}.out 2>&1 &
  WATCHDOG_PID=$!
  echo "   Watchdog PID: $WATCHDOG_PID"
  echo "   Log: /tmp/claude_quota_watchdog_${SESSION_NAME}.log"
else
  echo "   ⚠️  Watchdog non trouvé: $WATCHDOG_SCRIPT"
fi

# 9. Démarrer le watchdog AMP (switch automatique si out of limits)
AMP_WATCHDOG_SCRIPT="$SCRIPT_DIR/amp_limit_watchdog.sh"
if [ -f "$AMP_WATCHDOG_SCRIPT" ] && [ -n "${AMP_SECONDARY_TOKEN:-}" ]; then
  chmod +x "$AMP_WATCHDOG_SCRIPT"
  nohup bash "$AMP_WATCHDOG_SCRIPT" "$SESSION_NAME" "$CONFIG_FILE" "amp" 20 > /tmp/amp_watchdog_${SESSION_NAME}.out 2>&1 &
  AMP_WATCHDOG_PID=$!
  echo "👁️  Watchdog AMP: Actif (switch automatique si out of limits)"
  echo "   Watchdog PID: $AMP_WATCHDOG_PID"
  echo "   Log: /tmp/amp_limit_watchdog_${SESSION_NAME}.log"
elif [ -f "$AMP_WATCHDOG_SCRIPT" ]; then
  echo "👁️  Watchdog AMP: désactivé (AMP_SECONDARY_TOKEN non défini)"
else
  echo "   ⚠️  Watchdog AMP non trouvé: $AMP_WATCHDOG_SCRIPT"
fi

echo ""
echo "✅ Tous les LLMs sont démarrés !"
echo ""
echo "📋 Session tmux: $SESSION_NAME"
echo "   - Fenêtre 'antigravity-proxy': Proxy Antigravity"
echo "   - Fenêtre 'antigravity':       Antigravity (tâches moyennes)"
echo "   - Fenêtre 'claude':            Claude Orchestrator"
echo "   - Fenêtre 'amp':               Amp (compte 1)"
echo "   - Fenêtre 'amp-2':             Amp (compte 2)"
echo "   - Fenêtre 'codex':             Codex (tâches simples)"
echo ""
echo "👁️  Watchdog quota: Actif (handoff auto à 93%)"
echo "   - Log: tail -f /tmp/claude_quota_watchdog_${SESSION_NAME}.log"
echo "   - Quota actuel: cat /tmp/claude_current_quota_${SESSION_NAME}"
echo ""
echo "🔍 Pour attacher à la session:"
echo "   tmux attach -t $SESSION_NAME"
echo ""
echo "🛑 Pour arrêter l'orchestrateur:"
echo "   bash orchestratoragent/scripts/stop-orchestrator.sh"
echo ""
echo "🎯 Prêt pour orchestration !"
