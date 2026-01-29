#!/usr/bin/env bash
# =============================================================================
# auto_handoff_to_amp.sh - Handoff automatique Claude → AMP avec chargement agent
# =============================================================================
# Usage:
#   ./auto_handoff_to_amp.sh [session]
# =============================================================================

set -e

SESSION="${1:-orchestration-$(basename $(pwd))}"
PROJECT_DIR="${2:-$(pwd)}"

# Détecter le projet depuis le nom de session si pas spécifié
if [[ "$PROJECT_DIR" == "$(pwd)" ]] && [[ "$SESSION" =~ ^orchestration-(.+)$ ]]; then
    PROJECT_NAME="${BASH_REMATCH[1]}"
    # Chercher le projet dans les emplacements courants
    for dir in "/home/julien/Documents/$PROJECT_NAME" "/home/julien/Documents/moana/$PROJECT_NAME" "$HOME/$PROJECT_NAME"; do
        if [[ -d "$dir" ]]; then
            PROJECT_DIR="$dir"
            break
        fi
    done
fi

HANDOFF_FILE="$PROJECT_DIR/HANDOFF_TO_AMP.md"
CLAUDE_MD="$PROJECT_DIR/CLAUDE.md"
ORCHESTRATOR_AGENT="/home/julien/Documents/moana/agents_library/agent-orchestrator-universal/universal-orchestrator.md"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  AUTO HANDOFF: Claude → AMP${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo ""

# 1. Récupérer le quota actuel
echo -e "${YELLOW}[1/5]${NC} Lecture du quota Claude..."
QUOTA=$(tmux capture-pane -t "$SESSION:claude" -p -S -50 2>/dev/null | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1)
QUOTA="${QUOTA:-95}"
echo "       Quota: ${QUOTA}%"

# 2. Capturer l'état des agents
echo -e "${YELLOW}[2/5]${NC} Capture de l'état des agents..."

ANTIGRAVITY_STATUS=$(tmux capture-pane -t "$SESSION:antigravity" -p 2>/dev/null | tail -5 | head -3 || echo "Non disponible")
CODEX_STATUS=$(tmux capture-pane -t "$SESSION:codex" -p 2>/dev/null | tail -5 | head -3 || echo "Non disponible")

# 3. Créer le fichier de handoff
echo -e "${YELLOW}[3/5]${NC} Création du fichier de handoff..."

cat > "$HANDOFF_FILE" << EOF
# HANDOFF ORCHESTRATION: Claude → AMP

**Date**: $(date '+%Y-%m-%d %H:%M:%S')
**Raison**: Quota session Claude à ${QUOTA}%
**Nouveau orchestrateur**: AMP
**Session tmux**: $SESSION

---

## ACTIONS IMMÉDIATES POUR AMP

1. **CHARGE L'AGENT ORCHESTRATEUR:**
   \`@$ORCHESTRATOR_AGENT\`

2. **LIS LE CONTEXTE PROJET:**
   \`cat $CLAUDE_MD\`

3. **VÉRIFIE LES AGENTS:**
   \`\`\`bash
   tmux capture-pane -t $SESSION:4 -p | tail -20  # Antigravity
   tmux capture-pane -t $SESSION:5 -p | tail -20  # Codex
   \`\`\`

---

## ÉTAT DES AGENTS AU MOMENT DU HANDOFF

### Antigravity (Window 4)
\`\`\`
$ANTIGRAVITY_STATUS
\`\`\`

### Codex (Window 5)
\`\`\`
$CODEX_STATUS
\`\`\`

---

## COMMANDES TMUX (RAPPEL)

\`\`\`bash
# Envoyer un message (Enter SANS quotes!)
tmux send-keys -t $SESSION:4 "ton prompt" Enter   # Antigravity
tmux send-keys -t $SESSION:5 "ton prompt" Enter   # Codex

# Vérifier un agent
tmux capture-pane -t $SESSION:N -p | tail -20

# Vérifier tous les agents
for w in 4 5; do echo "=== Window \$w ===" && tmux capture-pane -t $SESSION:\$w -p | tail -10; done
\`\`\`

---

## RESPONSABILITÉS DE L'ORCHESTRATEUR

1. Coordonner Antigravity (window 4) et Codex (window 5)
2. Distribuer les tâches restantes (voir CLAUDE.md)
3. Surveiller l'avancement (vérifier toutes les 2-3 min)
4. Appliquer la méthode Ralph si tests échouent
5. Mettre à jour CLAUDE.md avec la progression

---

**Généré automatiquement par quota_watchdog.sh**
EOF

echo "       Fichier créé: $HANDOFF_FILE"

# 4. Envoyer le message de handoff à AMP
echo -e "${YELLOW}[4/5]${NC} Envoi du handoff à AMP..."

# Message compact sur une seule ligne pour éviter problèmes tmux
HANDOFF_MSG="HANDOFF ORCHESTRATEUR: Claude (${QUOTA}% tokens) te transfère le contrôle. CHARGE IMMÉDIATEMENT: @${ORCHESTRATOR_AGENT} - Tu deviens orchestrateur principal. Session: ${SESSION}, Windows: 4=Antigravity, 5=Codex. Après chargement de l'agent, lis ${HANDOFF_FILE} puis CLAUDE.md section 'Tâches Restantes'. Commence maintenant."

tmux send-keys -t "$SESSION:amp" "$HANDOFF_MSG" Enter

echo "       Message envoyé à AMP"

# 5. Attendre et vérifier
echo -e "${YELLOW}[5/5]${NC} Vérification de la prise en charge (15s)..."
sleep 15

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  RÉPONSE AMP:${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}"
tmux capture-pane -t "$SESSION:amp" -p | tail -20

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  HANDOFF TERMINÉ${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "AMP est maintenant l'orchestrateur."
echo "Fichier de handoff: $HANDOFF_FILE"
echo ""
echo "Pour vérifier AMP:"
echo "  tmux attach -t $SESSION"
echo "  Ctrl+B puis 2 (fenêtre AMP)"
