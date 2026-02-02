# Skill: Communication Inter-Agents via Tmux

## Vue d'ensemble

Cette skill permet à un agent orchestrateur (Claude) de communiquer avec d'autres agents LLM (AMP, Codex, Antigravity, etc.) qui tournent dans des fenêtres tmux séparées.

**Cas d'usage** : Coordination multi-agents, distribution de tâches, vérification de statut, synchronisation.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Tmux                              │
│  "orchestration-<PROJECT_NAME>"                             │
├─────────────────────────────────────────────────────────────┤
│  Window 0: main        │  bash (scripts utilitaires)        │
│  Window 1: antigravity-proxy │  Proxy Antigravity           │
│  Window 2: antigravity │  Claude via proxy                  │
│  Window 3: claude      │  Claude Code (orchestrateur)       │
│  Window 4: amp         │  AMP CLI                           │
│  Window 5: codex       │  OpenAI Codex                      │
└─────────────────────────────────────────────────────────────┘
```

**Variables à adapter:**
- `$SESSION` : Le nom de ta session tmux (ex: `orchestration-palm-oil-bot`, `orchestration-moana`)
- `$PROJECT_DIR` : Le chemin vers ton projet

---

## Étape 1 : Découverte de la session Tmux

### Lister les sessions disponibles

```bash
tmux list-sessions
```

### Lister les fenêtres d'une session

```bash
tmux list-windows -t $SESSION
```

**Sortie exemple** :
```
0: main (1 panes) [80x24] @0
1: antigravity-proxy (1 panes) [80x24] @1
2: antigravity (1 panes) [80x24] @2
3: claude* (1 panes) [206x23] @3 (active)
4: amp (1 panes) [80x24] @4
5: codex- (1 panes) [206x23] @5
```

### Lister les panes avec les commandes en cours

```bash
tmux list-panes -t $SESSION -a -F "#{window_name} pane #{pane_index}: #{pane_current_command}"
```

---

## Étape 2 : Envoyer un message à un agent

### Syntaxe de base

```bash
tmux send-keys -t $SESSION:<window> "<message>" Enter
```

**IMPORTANT:** `Enter` doit être SANS guillemets (c'est la touche, pas du texte)

### Paramètres

| Paramètre | Description |
|-----------|-------------|
| `-t` | Target : spécifie la session et la fenêtre |
| `<session>` | Nom de la session tmux |
| `<window>` | Nom ou index de la fenêtre (préférer index: 2, 4, 5) |
| `Enter` | Simule la touche Entrée pour soumettre |

### Exemples concrets

```bash
# Envoyer à AMP (window 4)
tmux send-keys -t $SESSION:4 "Crée le fichier X avec les fonctions A, B, C" Enter

# Envoyer à Antigravity (window 2)
tmux send-keys -t $SESSION:2 "Analyse l'architecture du module Y" Enter

# Envoyer à Codex (window 5)
tmux send-keys -t $SESSION:5 "Génère les tests pour le fichier Z" Enter
```

### Envoi en deux temps (si message non soumis)

```bash
# 1. Écrire le message dans le buffer
tmux send-keys -t $SESSION:2 "Mon message"

# 2. Soumettre avec Enter séparément
tmux send-keys -t $SESSION:2 Enter
```

### Échappement des caractères spéciaux

```bash
# Les caractères !, \, $ doivent être échappés
tmux send-keys -t $SESSION:4 "Bonjour \!" Enter

# Utiliser des guillemets simples pour éviter l'expansion shell
tmux send-keys -t $SESSION:4 'Message avec $variable' Enter
```

---

## Étape 3 : Vérifier la réponse d'un agent

### Capturer le contenu d'une fenêtre

```bash
tmux capture-pane -t $SESSION:<window> -p | tail -<n>
```

### Paramètres

| Paramètre | Description |
|-----------|-------------|
| `-p` | Print : affiche le contenu capturé sur stdout |
| `tail -n` | Affiche les n dernières lignes |

### Exemples

```bash
# Voir les 30 dernières lignes de la fenêtre AMP
tmux capture-pane -t $SESSION:2 -p | tail -30

# Voir les 20 dernières lignes d'Antigravity
tmux capture-pane -t $SESSION:4 -p | tail -20

# Vérifier tous les agents en parallèle
for window in 2 4 5; do
  echo "=== Window $window ==="
  tmux capture-pane -t $SESSION:$window -p | tail -15
done
```

### Attendre avant de vérifier

Les agents ont besoin de temps pour traiter et répondre :

```bash
# Attendre 5-10 secondes puis vérifier
sleep 5
tmux capture-pane -t $SESSION:2 -p | tail -20
```

### Signes que l'agent travaille

- `• Working (Xs • esc to interrupt)`
- `• Explored`
- `• Read(file.rs)`
- Changement de contenu entre captures

### Signes que le message n'est PAS soumis

- `↵ send` visible à côté du prompt
- Prompt visible mais pas de "Working"
- Même contenu après 10 secondes

---

## Étape 4 : Communication via fichier partagé

### Pourquoi un fichier partagé ?

- Certains agents n'ont pas de commande `/memory`
- Permet une trace persistante des échanges
- Facilite la vérification par l'orchestrateur
- Historique consultable

### Fichier de réponses standardisé

**Chemin** : `orchestratoragent/AGENT_RESPONSES.md` ou `CLAUDE.md`

### Demander à un agent d'écrire dans le fichier

```bash
tmux send-keys -t $SESSION:2 \
  "Écris dans CLAUDE.md section 'Task Completion Log' avec ton nom (AMP), l'heure et le résultat." Enter
```

---

## Étape 5 : Boucle de communication complète

### Algorithme

```
1. DÉCOUVERTE
   └─ Lister sessions et fenêtres tmux
   └─ Identifier les agents actifs

2. ENVOI MESSAGE
   └─ Pour chaque agent:
       └─ tmux send-keys -t session:N "message" Enter

3. ATTENTE
   └─ sleep 5-15 (selon complexité du message)

4. VÉRIFICATION
   └─ Pour chaque agent:
       └─ tmux capture-pane -t session:N -p | tail -n
   └─ Vérifier signes de travail ("Working", etc.)

5. SI PAS DE RÉPONSE
   └─ Renvoyer Enter (soumettre message en attente)
   └─ Retour à étape 3

6. REDISTRIBUTION
   └─ Si agent terminé → nouvelle tâche
   └─ Retour à étape 2
```

### Script bash de communication

```bash
#!/bin/bash
# Script: communicate_with_agents.sh

SESSION="${1:-orchestration-$(basename $(pwd))}"
AGENTS=(2 4 5)  # AMP, Antigravity, Codex

# Fonction: envoyer message à tous les agents
send_to_all() {
    local message="$1"
    for agent in "${AGENTS[@]}"; do
        echo "Envoi à window $agent: $message"
        tmux send-keys -t "$SESSION:$agent" "$message" Enter
    done
}

# Fonction: vérifier les réponses
check_responses() {
    for agent in "${AGENTS[@]}"; do
        echo "=== Window $agent ==="
        tmux capture-pane -t "$SESSION:$agent" -p | tail -15
        echo ""
    done
}

# Fonction: soumettre messages en attente
submit_pending() {
    for agent in "${AGENTS[@]}"; do
        tmux send-keys -t "$SESSION:$agent" Enter
    done
}

# Exemple d'utilisation
# send_to_all "Crée le fichier X.rs avec les fonctions A, B, C"
# sleep 10
# check_responses
```

---

## Troubleshooting

### Problème : Message non soumis

**Symptôme** : Le message apparaît dans le buffer mais l'agent ne répond pas.

**Solution** : Envoyer Enter séparément
```bash
tmux send-keys -t $SESSION:4 Enter
```

### Problème : Mauvais nom de fenêtre

**Symptôme** : `can't find window: codex-`

**Solution** : Utiliser le numéro de fenêtre au lieu du nom
```bash
# MAUVAIS
tmux send-keys -t $SESSION:codex- "..."

# BON
tmux send-keys -t $SESSION:5 "..."
```

### Problème : Agent n'a pas /memory

**Solution** : Demander d'écrire dans un fichier partagé
```bash
tmux send-keys -t $SESSION:2 \
  "Écris dans CLAUDE.md section Task Completion Log à la place." Enter
```

### Problème : Caractères spéciaux mal interprétés

**Solution** : Utiliser des guillemets simples ou échapper
```bash
# Avec guillemets simples
tmux send-keys -t $SESSION:2 'Message avec $var et !' Enter

# Avec échappement
tmux send-keys -t $SESSION:2 "Message avec \$var et \!" Enter
```

### Problème : Réponse tronquée

**Solution** : Augmenter le nombre de lignes
```bash
tmux capture-pane -t $SESSION:2 -p | tail -50

# Ou capturer depuis le début du scroll buffer
tmux capture-pane -t $SESSION:2 -p -S -1000
```

---

## Double Enter (Codex & Antigravity)

Certains LLMs (notamment Codex et Antigravity) nécessitent souvent un Enter supplémentaire pour soumettre le prompt. Le texte s'affiche dans le buffer mais le LLM ne commence pas à travailler.

### Détection

Après envoi du prompt, attendre 3 secondes puis capturer le pane :

```bash
sleep 3
output=$(tmux capture-pane -t $SESSION:N -p | tail -10)
```

**Si le prompt est visible mais sans signe de travail** ("Working", "Thinking", "Explored"), le prompt n'est pas soumis.

### Solution manuelle

```bash
tmux send-keys -t $SESSION:N Enter
```

### Script de vérification auto-submit

```bash
#!/bin/bash
# auto-submit.sh - Détecte si un prompt est resté non-soumis et renvoie Enter
# Usage: bash auto-submit.sh <session> <window>

SESSION="$1"
WINDOW="$2"
DELAY="${3:-3}"

sleep "$DELAY"
output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)

if echo "$output" | grep -qE "Working|Thinking|Explored|Read"; then
    echo "OK: LLM travaille (window $WINDOW)"
else
    echo "RETRY: Envoi Enter supplémentaire (window $WINDOW)"
    tmux send-keys -t "$SESSION:$WINDOW" Enter
    sleep 2
    # Re-vérifier
    output2=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)
    if echo "$output2" | grep -qE "Working|Thinking|Explored|Read"; then
        echo "OK: LLM travaille après retry"
    else
        echo "ATTENTION: LLM toujours inactif après retry"
    fi
fi
```

### Pattern recommandé (intégré à l'envoi)

```bash
# Envoyer prompt + auto-vérifier
tmux send-keys -t $SESSION:N "Mon prompt" Enter
sleep 3
output=$(tmux capture-pane -t $SESSION:N -p | tail -5)
if ! echo "$output" | grep -qE "Working|Thinking"; then
    tmux send-keys -t $SESSION:N Enter
fi
```

---

## Skill associé

Pour la distribution de tâches avec IDs et le polling de CLAUDE.md, voir :
`@agents_library/agent-orchestrator-universal/skills/task-distribution-memory-sync.md`

---

## Bonnes pratiques

1. **Toujours utiliser les numéros de fenêtres** (2, 4, 5) au lieu des noms
2. **Attendre 5-15 secondes** après envoi avant de vérifier
3. **Utiliser CLAUDE.md** comme fichier partagé pour les confirmations
4. **Envoyer Enter séparément** si le message ne se soumet pas
5. **Vérifier les signes de travail** ("Working", "Explored", etc.)
6. **Redistribuer rapidement** quand un agent termine

---

## Commandes de référence rapide

```bash
# Lister sessions
tmux list-sessions

# Lister fenêtres
tmux list-windows -t $SESSION

# Envoyer message (Enter SANS quotes!)
tmux send-keys -t $SESSION:N "prompt en langage naturel" Enter

# Soumettre (Enter seul)
tmux send-keys -t $SESSION:N Enter

# Capturer sortie
tmux capture-pane -t $SESSION:N -p | tail -20

# Vérifier tous les agents
for w in 2 4 5; do echo "=== $w ===" && tmux capture-pane -t $SESSION:$w -p | tail -10; done
```

---

**Version** : 2.0 (Universal)
**Basé sur** : Session du 22 janvier 2026
