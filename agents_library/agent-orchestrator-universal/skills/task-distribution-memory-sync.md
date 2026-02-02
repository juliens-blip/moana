# Skill: Task Distribution & Memory Sync

## Vue d'ensemble

Pattern d'orchestration multi-LLM : assigner des tâches avec IDs uniques aux LLMs via tmux, faire son propre travail en parallèle, puis poll CLAUDE.md toutes les 80s pour vérifier l'avancement.

**Principe clé :** CLAUDE.md est la source de vérité partagée. Chaque LLM met à jour la "Task Assignment Queue" et le "Task Completion Log" quand il termine.

---

## A.1 Format des Task IDs

Convention : `T-XXX` (numérotation séquentielle, 3 chiffres minimum).

**Table dans CLAUDE.md :**

```markdown
## Task Assignment Queue
| ID | Task | Assigned To | Priority | Status | Created |
|----|------|-------------|----------|--------|---------|
| T-001 | Description de la tâche | AMP (w4) | LOW/MED/HIGH | PENDING/IN_PROGRESS/COMPLETED/BLOCKED | 2026-01-27 |
```

**Statuts possibles :**
- `PENDING` : Tâche assignée, pas encore commencée
- `IN_PROGRESS` : LLM travaille dessus
- `COMPLETED` : Terminée avec succès
- `BLOCKED` : Bloquée (crédits, erreur, dépendance)

---

## A.2 Assigner une tâche à un LLM

Chaque prompt d'assignation doit inclure :
1. La description claire de la tâche
2. L'ID de tâche (`T-XXX`)
3. L'instruction explicite de mettre à jour CLAUDE.md

**Règles :**
- Toujours mettre à jour la Task Assignment Queue dans CLAUDE.md **avant** d'envoyer le prompt
- Utiliser le langage naturel (pas de commandes bash)
- Un prompt = une tâche (pas de batching dans un seul prompt)

---

## A.3 Template de prompt

```
Tâche T-XXX : [DESCRIPTION DE LA TÂCHE]

Quand tu as terminé, mets à jour le fichier CLAUDE.md :
1. Dans la table "Task Assignment Queue", change le Status de T-XXX de IN_PROGRESS à COMPLETED
2. Ajoute une ligne dans "Task Completion Log" avec la date, ton nom, T-XXX, le statut COMPLETED et une note courte
```

**Exemple concret :**

```
Tâche T-005 : Liste les fichiers dans agents_library/ et écris le résultat dans /tmp/amp-ls.txt

Quand tu as terminé, mets à jour le fichier CLAUDE.md :
1. Dans la table "Task Assignment Queue", change le Status de T-005 de IN_PROGRESS à COMPLETED
2. Ajoute une ligne dans "Task Completion Log" avec la date, ton nom, T-005, le statut COMPLETED et une note courte
```

**Envoi via tmux :**

```bash
tmux send-keys -t $SESSION:4 "Tâche T-005 : Liste les fichiers dans agents_library/ et écris le résultat dans /tmp/amp-ls.txt. Quand tu as terminé, mets à jour le fichier CLAUDE.md : dans la table Task Assignment Queue change le Status de T-005 à COMPLETED, et ajoute une ligne dans Task Completion Log." Enter
```

---

## A.4 Boucle de polling mémoire

### Algorithme — Boucle continue (NE S'ARRÊTE JAMAIS)

**RÈGLE CRITIQUE :** L'orchestrateur ne fait JAMAIS de "point" à l'utilisateur entre les batches. Il enchaîne automatiquement : features → tests → rapport final.

```
BOUCLE PRINCIPALE (tourne en continu jusqu'à TOUT terminé + testé) :

1. DÉCOMPOSER
   └─ Analyser la demande utilisateur
   └─ Découper en tâches atomiques (features, refactoring, etc.)
   └─ Assigner un T-XXX à chaque tâche
   └─ S'AUTO-ASSIGNER des tâches aussi (l'orchestrateur travaille, pas juste coordonne)
   └─ Écrire toutes les tâches dans CLAUDE.md (Task Assignment Queue, status IN_PROGRESS)

2. DISTRIBUER
   └─ Pour chaque LLM cible :
       └─ tmux send-keys -t $SESSION:N "<prompt avec T-XXX>" Enter
       └─ sleep 3
       └─ Vérifier soumission : tmux capture-pane -t $SESSION:N -p | tail -5
       └─ Si prompt non soumis → envoyer Enter supplémentaire
   └─ L'orchestrateur COMMENCE SES PROPRES TÂCHES en parallèle

3. POLL + REDISTRIBUER (boucle interne)
   └─ Lire CLAUDE.md
   └─ Pour chaque LLM qui a COMPLETED sa tâche :
       └─ S'il reste des tâches PENDING dans global_todo → lui en assigner une nouvelle immédiatement
       └─ Mettre à jour CLAUDE.md
   └─ Si des tâches restent IN_PROGRESS → sleep 80 → re-poll
   └─ Si TOUTES les features sont COMPLETED → passer à étape 4
   └─ ⚠️ NE PAS s'arrêter ici pour faire un point — enchaîner directement

4. PHASE TESTS AUTOMATIQUE
   └─ Créer des tâches de test : T-XXX "Lancer les tests pour [feature]"
   └─ Distribuer les tests aux LLMs (chaque LLM teste ce qu'il a codé si possible)
   └─ S'auto-assigner des tests aussi
   └─ Appliquer méthode Ralph si échecs (test → debug → fix, max 3 cycles)
   └─ Re-poll jusqu'à tous les tests PASSED

5. RAPPORT FINAL (uniquement ici on s'adresse à l'utilisateur)
   └─ Résumé : tâches complétées, tests passés, problèmes rencontrés
   └─ Mettre à jour CLAUDE.md progression à 100%
```

**Points clés :**
- L'orchestrateur **s'assigne du travail à lui-même** — il n'est pas juste un dispatcher
- Dès qu'un LLM termine, il reçoit une **nouvelle tâche immédiatement** (pas d'attente de fin de batch)
- Les tests sont délégués **automatiquement** après les features, sans intervention humaine
- Le seul moment où l'orchestrateur parle à l'utilisateur c'est le **rapport final**

### Pourquoi 80 secondes ?

- Les LLMs prennent typiquement 30-120s pour une tâche simple
- 80s est un bon compromis entre réactivité et consommation de tokens
- Évite de surcharger CLAUDE.md avec des lectures trop fréquentes

---

## A.5 Gestion des cas particuliers

### Tâche BLOCKED

Si une tâche reste BLOCKED dans CLAUDE.md :
1. Lire la note associée pour comprendre la raison
2. Si crédits épuisés → réassigner à un autre LLM
3. Si erreur technique → envoyer un prompt de déblocage
4. Si dépendance → vérifier si la dépendance est résolue

```bash
# Réassigner une tâche bloquée
# 1. Mettre à jour CLAUDE.md : changer "Assigned To" vers le nouveau LLM
# 2. Envoyer le prompt au nouveau LLM
tmux send-keys -t $SESSION:6 "Tâche T-002 (réassignée) : [description]. Mets à jour CLAUDE.md quand terminé." Enter
```

### Retry Enter (prompt non soumis)

Certains LLMs (Codex, Antigravity) nécessitent un Enter supplémentaire :

```bash
# Après envoi du prompt, vérifier après 3s
sleep 3
output=$(tmux capture-pane -t $SESSION:N -p | tail -10)

# Si pas de signe de travail ("Working", "Thinking"), renvoyer Enter
if ! echo "$output" | grep -qE "Working|Thinking|Explored|Read"; then
    tmux send-keys -t $SESSION:N Enter
fi
```

### LLM inactif

Si un LLM ne répond pas après 2 cycles de polling (160s) :
1. Vérifier avec `tmux capture-pane` s'il est vivant
2. Envoyer `C-c` puis relancer le prompt
3. Si toujours inactif → réassigner la tâche

```bash
# Relancer un LLM inactif
tmux send-keys -t $SESSION:N C-c
sleep 2
tmux send-keys -t $SESSION:N "Tâche T-XXX : [description]. Mets à jour CLAUDE.md quand terminé." Enter
```

---

## A.6 Exemple complet : Test orchestration (Batch 1 + Batch 2)

### Contexte
Session tmux `orchestration-moana`, 4 LLMs : Claude (w3), AMP (w4), AMP-2 (w5), Codex (w6), Antigravity (w2).

### Batch 1 : Tâches simples (fichiers de test)

**1. Préparer CLAUDE.md :**
```markdown
| T-001 | Créer /tmp/test-amp.txt avec "Hello from AMP" | AMP (w4) | LOW | IN_PROGRESS | 2026-01-27 |
| T-002 | Créer /tmp/test-amp2.txt avec "Hello from AMP-2" | AMP-2 (w5) | LOW | IN_PROGRESS | 2026-01-27 |
| T-003 | Créer /tmp/test-codex.txt avec "Hello from Codex" | Codex (w6) | LOW | IN_PROGRESS | 2026-01-27 |
| T-004 | Créer /tmp/test-antigravity.txt avec "Hello from Antigravity" | Antigravity (w2) | LOW | IN_PROGRESS | 2026-01-27 |
```

**2. Distribuer :**
```bash
tmux send-keys -t orchestration-moana:4 "Tâche T-001 : Crée le fichier /tmp/test-amp.txt avec le contenu 'Hello from AMP'. Quand terminé, mets à jour CLAUDE.md : status T-001 à COMPLETED + ligne dans Task Completion Log." Enter
sleep 3

tmux send-keys -t orchestration-moana:5 "Tâche T-002 : Crée le fichier /tmp/test-amp2.txt avec le contenu 'Hello from AMP-2'. Quand terminé, mets à jour CLAUDE.md : status T-002 à COMPLETED + ligne dans Task Completion Log." Enter
sleep 3

tmux send-keys -t orchestration-moana:6 "Tâche T-003 : Crée le fichier /tmp/test-codex.txt avec le contenu 'Hello from Codex'. Quand terminé, mets à jour CLAUDE.md : status T-003 à COMPLETED + ligne dans Task Completion Log." Enter
sleep 3

tmux send-keys -t orchestration-moana:2 "Tâche T-004 : Crée le fichier /tmp/test-antigravity.txt avec le contenu 'Hello from Antigravity'. Quand terminé, mets à jour CLAUDE.md : status T-004 à COMPLETED + ligne dans Task Completion Log." Enter
```

**3. Travailler** (Claude fait ses propres tâches pendant ce temps)

**4. Poll :**
```bash
# Lire CLAUDE.md et vérifier les statuts
grep -E "T-00[1-4]" CLAUDE.md
```

**5. Résultat :** T-001 COMPLETED, T-002 BLOCKED (crédits), T-003 COMPLETED, T-004 IN_PROGRESS

### Batch 2 : Tâches avec vérification

```markdown
| T-005 | Lister agents_library/ → /tmp/amp-ls.txt | AMP (w4) | LOW | IN_PROGRESS | 2026-01-27 |
| T-006 | Compter lignes CLAUDE.md → /tmp/codex-count.txt | Codex (w6) | LOW | IN_PROGRESS | 2026-01-27 |
```

Distribution et polling identiques au Batch 1.

---

## A.7 Commandes bash prêtes à l'emploi

### Script de polling automatique

```bash
#!/bin/bash
# poll-claude-md.sh - Polling CLAUDE.md jusqu'à complétion des tâches
# Usage: bash poll-claude-md.sh <fichier_claude_md> <task_ids>
# Exemple: bash poll-claude-md.sh CLAUDE.md "T-001 T-002 T-003"

CLAUDE_MD="${1:-CLAUDE.md}"
TASK_IDS="${2}"
POLL_INTERVAL=80

while true; do
    all_done=true
    for tid in $TASK_IDS; do
        status=$(grep "$tid" "$CLAUDE_MD" | grep -oE "COMPLETED|IN_PROGRESS|BLOCKED|PENDING")
        echo "$(date +%H:%M:%S) $tid: $status"
        if [ "$status" != "COMPLETED" ]; then
            all_done=false
        fi
    done

    if $all_done; then
        echo "Toutes les tâches sont COMPLETED."
        break
    fi

    echo "--- Prochain poll dans ${POLL_INTERVAL}s ---"
    sleep $POLL_INTERVAL
done
```

### Vérification rapide d'un batch

```bash
# One-liner : compter les statuts dans la Task Assignment Queue
grep -oE "COMPLETED|IN_PROGRESS|BLOCKED|PENDING" CLAUDE.md | sort | uniq -c
```

### Vérification soumission prompt + retry Enter

```bash
#!/bin/bash
# verify-submit.sh - Vérifie qu'un prompt a été soumis et retry si nécessaire
# Usage: bash verify-submit.sh <session> <window>

SESSION="$1"
WINDOW="$2"

sleep 3
output=$(tmux capture-pane -t "$SESSION:$WINDOW" -p | tail -10)

if echo "$output" | grep -qE "Working|Thinking|Explored|Read"; then
    echo "OK: LLM travaille"
else
    echo "RETRY: Envoi Enter supplémentaire"
    tmux send-keys -t "$SESSION:$WINDOW" Enter
fi
```

---

**Version** : 1.0
**Basé sur** : Test orchestration du 27 janvier 2026
