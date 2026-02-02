# Skill: Monitoring Quota & Handoff Claude/AMP

## Vue d'ensemble

Cette skill permet à Claude d'orchestrer une équipe de LLMs, de **surveiller son propre quota de session**, et de **transférer automatiquement l'orchestration à AMP** quand le quota atteint 93%.

**Capacités couvertes :**
1. Monitoring du quota de session Claude
2. Handoff automatique vers AMP à 93%
3. Reprise de l'orchestration par AMP
4. Retour à Claude après reset du quota

**Variables à adapter:**
- `$SESSION` : Nom de ta session tmux (ex: `orchestration-palm-oil-bot`)
- `$PROJECT_DIR` : Chemin vers ton projet

---

# PARTIE A : MONITORING DU QUOTA

## A.1 Où trouver le quota

Le quota de session Claude est affiché dans le **footer** de la fenêtre tmux :

```
You've used 93% of your session limit · resets 2pm (Europe/Paris)
```

**Important** : Cette info est côté serveur Anthropic, pas stockée localement.

## A.2 Vérification manuelle du quota

```bash
# Capturer le footer et extraire le pourcentage
tmux capture-pane -t $SESSION:claude -p | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1
```

## A.3 Script de vérification : `check_claude_quota.sh`

```bash
#!/bin/bash
# ============================================================================
# check_claude_quota.sh - Vérifie le quota de session Claude
# ============================================================================
# Usage: ./check_claude_quota.sh [session] [window] [alert_threshold]
# ============================================================================

SESSION="${1:-orchestration-$(basename $(pwd))}"
WINDOW="${2:-claude}"
ALERT_THRESHOLD="${3:-93}"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Fonction de capture du quota
get_quota() {
    local content=$(tmux capture-pane -t "$SESSION:$WINDOW" -p 2>/dev/null)
    local quota=$(echo "$content" | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1)
    echo "$quota"
}

QUOTA=$(get_quota)

if [[ -z "$QUOTA" ]] || ! [[ "$QUOTA" =~ ^[0-9]+$ ]]; then
    echo -e "${RED}Impossible de lire le quota${NC}"
    exit 1
fi

# Barre de progression
BAR_WIDTH=40
FILLED=$((QUOTA * BAR_WIDTH / 100))
EMPTY=$((BAR_WIDTH - FILLED))
BAR=$(printf "%${FILLED}s" | tr ' ' '#')$(printf "%${EMPTY}s" | tr ' ' '-')

# Couleur selon le niveau
if [[ "$QUOTA" -lt 50 ]]; then
    COLOR=$GREEN; STATUS="OK"
elif [[ "$QUOTA" -lt 75 ]]; then
    COLOR=$YELLOW; STATUS="Attention"
elif [[ "$QUOTA" -lt "$ALERT_THRESHOLD" ]]; then
    COLOR=$YELLOW; STATUS="Eleve"
else
    COLOR=$RED; STATUS="ALERTE - Handoff recommande"
fi

# Affichage
echo -e "${CYAN}======= CLAUDE SESSION QUOTA =======${NC}"
echo -e "Quota:  ${COLOR}${QUOTA}%${NC}"
echo -e "[${COLOR}${BAR}${NC}]"
echo -e "Status: ${COLOR}${STATUS}${NC}"
echo "====================================="

# Export pour utilisation programmatique
echo "QUOTA=$QUOTA"
echo "ALERT=$([[ $QUOTA -ge $ALERT_THRESHOLD ]] && echo "true" || echo "false")"

# Code de sortie
[[ "$QUOTA" -ge "$ALERT_THRESHOLD" ]] && exit 2 || exit 0
```

### Utilisation

```bash
# Vérification simple
./check_claude_quota.sh

# Avec paramètres personnalisés
./check_claude_quota.sh orchestration-moana claude 90

# Dans un script, récupérer le quota
QUOTA=$(./check_claude_quota.sh 2>/dev/null | grep "^QUOTA=" | cut -d= -f2)
echo "Quota actuel: $QUOTA%"
```

## A.4 Watchdog continu : `quota_watchdog.sh`

```bash
#!/bin/bash
# ============================================================================
# quota_watchdog.sh - Surveillance continue du quota avec alerte à 93%
# ============================================================================
# Usage: nohup ./quota_watchdog.sh [session] [window] [threshold] [interval] &
# ============================================================================

SESSION="${1:-orchestration-$(basename $(pwd))}"
WINDOW="${2:-claude}"
ALERT_THRESHOLD="${3:-93}"
CHECK_INTERVAL="${4:-30}"

LOG_FILE="/tmp/claude_quota_watchdog.log"
QUOTA_FILE="/tmp/claude_current_quota"
ALERT_TRIGGERED="/tmp/claude_quota_alert_triggered"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

get_quota() {
    tmux capture-pane -t "$SESSION:$WINDOW" -p 2>/dev/null | \
        grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1
}

send_alert() {
    local quota=$1

    # Éviter alertes répétées
    [[ -f "$ALERT_TRIGGERED" ]] && [[ "$(cat $ALERT_TRIGGERED)" == "$quota" ]] && return
    echo "$quota" > "$ALERT_TRIGGERED"

    log "ALERTE: Quota à ${quota}%!"

    # Notification desktop (si disponible)
    notify-send -u critical "Claude Quota" "Session à ${quota}%!" 2>/dev/null

    # Notifier AMP
    tmux send-keys -t "$SESSION:amp" \
        "ALERTE: Claude est à ${quota}%. Prépare-toi pour le handoff." Enter
}

log "Watchdog démarré (seuil: ${ALERT_THRESHOLD}%, intervalle: ${CHECK_INTERVAL}s)"

while true; do
    QUOTA=$(get_quota)

    if [[ -n "$QUOTA" ]] && [[ "$QUOTA" =~ ^[0-9]+$ ]]; then
        echo "$QUOTA" > "$QUOTA_FILE"

        if [[ "$QUOTA" -ge "$ALERT_THRESHOLD" ]]; then
            log "ALERTE ${QUOTA}%"
            send_alert "$QUOTA"
        else
            log "OK ${QUOTA}%"
        fi
    fi

    sleep "$CHECK_INTERVAL"
done
```

### Lancer le watchdog

```bash
# En premier plan (test)
./quota_watchdog.sh

# En background (production)
nohup ./quota_watchdog.sh > /tmp/watchdog.out 2>&1 &

# Vérifier qu'il tourne
ps aux | grep quota_watchdog

# Voir les logs
tail -f /tmp/claude_quota_watchdog.log

# Lire le quota actuel
cat /tmp/claude_current_quota
```

---

# PARTIE B : SEUILS DE QUOTA

| Quota | Status | Action |
|-------|--------|--------|
| < 50% | OK | Travail normal |
| 50-74% | Attention | Surveiller |
| 75-84% | Eleve | Éviter nouvelles grosses tâches |
| 85-92% | Critique | Terminer tâches en cours, préparer handoff |
| >= 93% | **ALERTE** | **HANDOFF IMMÉDIAT** |

---

# PARTIE C : HANDOFF VERS AMP

## C.1 Procédure de handoff complète

### Étape 1 : Vérifier le quota

```bash
./check_claude_quota.sh
# Si ALERT=true, continuer avec le handoff
```

### Étape 2 : Créer le fichier de handoff

Claude doit créer `HANDOFF_TO_AMP.md` dans le projet :

```markdown
# HANDOFF ORCHESTRATION: Claude -> AMP

**Date**: [timestamp]
**Raison**: Quota session Claude à XX%
**Nouveau orchestrateur**: AMP

---

## CONTEXTE

### Ce qui a été fait
1. [Tâche 1 complétée]
2. [Tâche 2 en cours - XX%]

### Status des agents

| Agent | Status | Tâche en cours |
|-------|--------|----------------|
| Antigravity | Actif | [description] |
| Codex | Actif | [description] |

---

## TÂCHES À REPRENDRE

| Priorité | Tâche | Description |
|----------|-------|-------------|
| HIGH | [tâche] | [description] |
| MED | [tâche] | [description] |

---

## FICHIERS À LIRE

- CLAUDE.md - Instructions du projet
- orchestratoragent/AGENT_RESPONSES.md - Réponses des agents

---

## COMMANDES UTILES

# Envoyer message à un agent
tmux send-keys -t $SESSION:<N> "<message>" Enter

# Voir sortie d'un agent
tmux capture-pane -t $SESSION:<N> -p | tail -30

# Windows: 4=AMP, 2=Antigravity, 5=Codex
```

### Étape 3 : Envoyer le message de handoff à AMP

```bash
tmux send-keys -t $SESSION:4 "HANDOFF ORCHESTRATION: Tu prends le relais comme orchestrateur.

ACTIONS IMMÉDIATES:
1. Lis le fichier de handoff: cat HANDOFF_TO_AMP.md
2. Lis les instructions du projet: cat CLAUDE.md
3. Vérifie le status des agents:
   tmux capture-pane -t $SESSION:2 -p | tail -20
   tmux capture-pane -t $SESSION:5 -p | tail -20
4. Reprends la coordination

Commence maintenant par lire HANDOFF_TO_AMP.md" Enter
```

### Étape 4 : Vérifier que AMP a pris le relais

```bash
sleep 15
tmux capture-pane -t $SESSION:4 -p | tail -30
```

## C.2 Script automatisé : `auto_handoff_to_amp.sh`

```bash
#!/bin/bash
# ============================================================================
# auto_handoff_to_amp.sh - Handoff automatique Claude -> AMP
# ============================================================================

SESSION="${1:-orchestration-$(basename $(pwd))}"
PROJECT_DIR="${2:-$(pwd)}"
HANDOFF_FILE="$PROJECT_DIR/HANDOFF_TO_AMP.md"

echo "======= AUTO HANDOFF CLAUDE -> AMP ======="

# 1. Vérifier quota
QUOTA=$(tmux capture-pane -t "$SESSION:claude" -p | grep -oE "used [0-9]+%" | grep -oE "[0-9]+" | tail -1)
echo "[1/5] Quota actuel: ${QUOTA:-inconnu}%"

# 2. Créer fichier de handoff
echo "[2/5] Création fichier de handoff..."
cat > "$HANDOFF_FILE" << EOF
# HANDOFF: Claude -> AMP

**Date**: $(date '+%Y-%m-%d %H:%M')
**Quota Claude**: ${QUOTA}%

## Actions immédiates
1. Lire ce fichier
2. Lire CLAUDE.md: cat $PROJECT_DIR/CLAUDE.md
3. Vérifier agents: tmux capture-pane -t $SESSION:<N> -p | tail -20
4. Reprendre coordination
EOF
echo "   Fichier créé: $HANDOFF_FILE"

# 3. Envoyer message à AMP
echo "[3/5] Notification à AMP..."
tmux send-keys -t "$SESSION:2" "HANDOFF: Tu prends le relais. Lis: cat $HANDOFF_FILE puis cat $PROJECT_DIR/CLAUDE.md" Enter

# 4. Attendre
echo "[4/5] Attente prise en charge (15s)..."
sleep 15

# 5. Vérifier
echo "[5/5] Vérification réponse AMP..."
tmux capture-pane -t "$SESSION:2" -p | tail -15

echo ""
echo "Handoff envoyé. Vérifier que AMP travaille."
```

---

# PARTIE D : GUIDE POUR AMP (NOUVEL ORCHESTRATEUR)

## D.1 À la réception du handoff

```bash
# 1. Lire le fichier de handoff
cat HANDOFF_TO_AMP.md

# 2. Lire les instructions du projet
cat CLAUDE.md

# 3. Lister les agents
tmux list-windows -t $SESSION

# 4. Vérifier chaque agent
for window in 4 5; do
    echo "=== Window $window ==="
    tmux capture-pane -t $SESSION:$window -p | tail -15
done
```

## D.2 Coordonner les agents

```bash
# Demander un status
tmux send-keys -t $SESSION:4 "Quel est ton avancement sur ta tâche actuelle ?" Enter

# Assigner une tâche
tmux send-keys -t $SESSION:5 "Lance les tests et rapporte les résultats" Enter

# Vérifier la réponse (après 30s)
sleep 30
tmux capture-pane -t $SESSION:5 -p | tail -20
```

## D.3 Vérifier si Claude peut reprendre

```bash
# Vérifier le quota de Claude
./check_claude_quota.sh

# Si quota < 50%, Claude peut reprendre
# Le quota se reset généralement à 14h (Europe/Paris)
```

## D.4 Rendre le contrôle à Claude

```bash
# 1. Créer fichier de retour
cat > HANDOFF_TO_CLAUDE.md << 'EOF'
# HANDOFF RETOUR: AMP -> Claude

**Date**: $(date)
**Raison**: Quota Claude réinitialisé

## Fait pendant le handoff
- [Actions réalisées]

## Status agents
- Antigravity: [status]
- Codex: [status]
EOF

# 2. Notifier Claude
tmux send-keys -t $SESSION:1 "RETOUR: Tu reprends l'orchestration. Lis HANDOFF_TO_CLAUDE.md" Enter
```

---

# PARTIE E : RÉFÉRENCE RAPIDE

## E.1 Commandes essentielles

```bash
# === QUOTA ===
# Vérifier quota manuellement
tmux capture-pane -t $SESSION:claude -p | grep -oE "used [0-9]+%"

# Script de vérification
./check_claude_quota.sh

# Lancer watchdog
nohup ./quota_watchdog.sh &

# Lire quota (si watchdog actif)
cat /tmp/claude_current_quota

# === HANDOFF ===
# Handoff automatique
./auto_handoff_to_amp.sh

# Vérifier si AMP a pris le relais
tmux capture-pane -t $SESSION:2 -p | tail -20
```

## E.2 Fichiers importants

| Fichier | Description |
|---------|-------------|
| `CLAUDE.md` | Instructions du projet |
| `HANDOFF_TO_AMP.md` | Fichier de handoff Claude->AMP |
| `HANDOFF_TO_CLAUDE.md` | Fichier de retour AMP->Claude |
| `/tmp/claude_current_quota` | Quota actuel (si watchdog) |
| `/tmp/claude_quota_watchdog.log` | Log du watchdog |

## E.3 Troubleshooting

| Problème | Solution |
|----------|----------|
| Quota non visible | `tmux capture-pane -p -S -100 \| grep used` |
| AMP ne répond pas au handoff | `tmux send-keys -t $SESSION:2 Enter` |
| Watchdog ne détecte pas le quota | Vérifier nom de session avec `tmux ls` |

---

**Version** : 2.0 (Universal)
**Basé sur** : Session du 22 janvier 2026
