# Règles projet — Moana Yachting

Source de vérité unique. Garder sous 150 lignes.

## Démarrage de session

1. Lire `CLAUDE.md`, `index.md`, `state.md`, puis les 10–20 dernières lignes de `log.md`.
2. Ouvrir `wiki/` ou `archive/` uniquement si la tâche l'exige.
3. Préfixer les commandes shell avec `rtk`.
4. Considérer chaque ligne ajoutée comme un coût pour les sessions futures.
5. Pour **retrouver** une note, une mémoire ou une décision (contexte/RAG/Obsidian),
   passer par **QMD** (voir « Recherche RAG »), jamais en lisant les notes au hasard.

## Recherche RAG — QMD (OBLIGATOIRE)

Le vault Obsidian et la mémoire sont indexés par **QMD** (moteur local, `npm i -g @tobilu/qmd`,
serveur MCP `qmd` actif). Toute recherche de contexte/mémoire passe par lui — et les agents
du tunnel ont la même consigne dans leur mémoire.

- Chercher : `qmd search "<termes exacts>"` (BM25 — mode utilisé ici, aucun modèle requis).
- Récupérer la source : `qmd get "#docid"` / `qmd multi-get "..."` — jamais le snippet seul.
- Collections : `memory` (mémoire persistante), `moana-wiki`, `moana-archive`, `moana-tasks`.
- Après avoir ajouté des notes durables : `qmd update` (ré-indexe le FTS BM25).
- ⚠️ Cette machine est **CPU sans GPU** : les embeddings bloquent → `qmd query`/`vsearch`
  (vectoriel) indisponibles. Rester en `qmd search`. Vectoriel = à réactiver si GPU un jour.

### Choix entre QMD et Graphify

- **QMD** est la source de vérité pour la mémoire persistante : décisions,
  exigences, journaux, bugs, plans et historique métier. Chercher en BM25 puis
  récupérer la note complète.
- **Graphify** est la source de vérité pour le dépôt courant : relations entre
  fichiers/symboles, appels, dépendances, SQL et impact architectural. Utiliser
  `graphify query`, `path` ou `explain` avant de parcourir le code au hasard.
- Pour un audit ou une feature, faire **QMD pour le contexte**, puis
  **Graphify pour la structure actuelle**. Si la question concerne uniquement
  l'un des deux domaines, utiliser seulement l'outil correspondant.
- Après une note durable : `qmd update`. Après une modification de code :
  `graphify update .`.
- Ne jamais muter l'index (`collection add`/`embed`) sans raison ; l'index vit hors dépôt.

## Tunnel agentique — OBLIGATOIRE pour tout nouvel outil

Aucun outil codé « à la va-vite ». Chaque nouvel outil traverse ce tunnel
(détail en mémoire : `agentic-tunnel`). Les backends tournent sur **AWS EC2**
(`ubuntu@51.44.220.145`, `~/moana`), jamais en process local permanent.

0. **INIT** — créer `tasks/<outil>/` (kebab-case).
1. **EXPLORE** (`.claude/agents/epct.md`) — **QMD d'abord** (RAG interne : `memory`,
   `moana-tasks`…), puis recherche externe (Context7, WebSearch) + patterns du code
   → `tasks/<outil>/01_analysis.md`.
2. **PLAN** (`agents_library/apex-workflow.md`) — décomposer en étapes granulaires
   → `tasks/<outil>/02_plan.md` AVANT tout code (règle d'or apex).
3. **CODE** (`epct.md`) — implémenter selon les patterns existants ; journal dans
   `tasks/<outil>/03_implementation_log.md`. Backend → AWS.
4. **TEST** (`.claude/agents/test-code.md`, obligatoire, plusieurs tests) — lancer
   l'agent test-code : lint, `tsc --noEmit`, build, tests unitaires + plusieurs
   tests fonctionnels du nouvel outil. Cet agent ne modifie jamais le code.
5. **LOOP** — en cas d'échec : consigner dans `journalbug.md`, revenir en 1/2
   (EPCT→apex), corriger, re-tester jusqu'au tout-vert.
6. **DEPLOY + DOC** — déployer sur AWS ; mettre à jour `state.md` et `log.md`.

## Journaux de bord

- `state.md` : une entrée par cycle (~6h). Garder 18h ; les cycles plus anciens
  sont fondus dans « Résumé glissant » puis supprimés.
- `journalbug.md` : une ligne par bug détecté au testing. Résumer et purger quand
  ça grossit.

## Périmètre documentaire

- Modifier/déplacer/supprimer uniquement de la doc, sauf demande explicite de code.
- Décrire toute action documentaire importante dans `log.md`.
- Chercher une note proche dans `wiki/` avant d'en créer une.
- Préférer compléter/fusionner/supprimer plutôt que multiplier les fichiers.
- Garder `index.md` lisible en 30 secondes.
- Ne jamais stocker de secret, identifiant, dump, compte-rendu long ou note de debug ici.

## Zones protégées

Ne jamais modifier/déplacer/supprimer sans ordre explicite :

- Dossiers : `src/`, `app/`, `pages/`, `components/`, `lib/`, `server/`, `api/`, `database/`, `migrations/`.
- Fichiers : `package.json`, `pnpm-lock.yaml`, `package-lock.json`, `docker*`, `.env*`.
- Configurations de build ou de déploiement.

La lecture de ces zones est permise pour documenter l'état réel.
Respecter les changements non liés déjà présents dans le dépôt (WIP OpenSanctions,
yatco-stats, etc.) : ne stager que les fichiers explicitement concernés.

## Mémoire du projet

- `raw/` : contenu transitoire à traiter ou supprimer vite.
- `wiki/` : connaissance stable, courte, validée.
- `archive/` : contexte historique condensé, rarement lu.
- `log.md` : détail des trois derniers jours, puis historique condensé.
- `bugs.md` : une ligne normalisée par problème.

## Qualité

- Vérifier les faits dans le code avant de reprendre une ancienne note.
- Distinguer clairement état observé, décision et tâche future.
- Écrire court, orienté action, sans storytelling.
- Ne jamais recopier de valeur provenant d'un fichier `.env*`.
- Ne jamais coder un backend en secret en dur : variables d'environnement seulement.

## Liens

[[index]] · [[state]] · [[log]] · [[bugs]] · [[journalbug]] · [[Roadmap]]
