# Règles projet — Moana Yachting

## Démarrage de session

1. Lire `CLAUDE.md`, `index.md`, puis les 10–20 dernières lignes de `log.md`.
2. Ouvrir `wiki/` ou `archive/` uniquement si la tâche l’exige.
3. Préfixer les commandes shell avec `rtk`.
4. Considérer chaque ligne ajoutée comme un coût pour les sessions futures.

## Périmètre documentaire

- Modifier, déplacer ou supprimer uniquement de la documentation, sauf demande explicite de code.
- Décrire toute action documentaire importante dans `log.md`.
- Chercher une note proche dans `wiki/` avant d’en créer une.
- Préférer compléter, fusionner ou supprimer plutôt que multiplier les fichiers.
- Garder `CLAUDE.md` sous environ 150 lignes et `index.md` lisible en 30 secondes.
- Ne jamais stocker de secret, identifiant, dump, compte-rendu long ou note de debug ici.

## Zones protégées

Ne jamais modifier, déplacer ou supprimer sans ordre explicite :

- Dossiers : `src/`, `app/`, `pages/`, `components/`, `lib/`, `server/`, `api/`, `database/`, `migrations/`.
- Fichiers : `package.json`, `pnpm-lock.yaml`, `package-lock.json`, `docker*`, `.env*`.
- Configurations de build ou de déploiement.

La lecture de ces zones est permise pour documenter l’état réel.

## Mémoire du projet

- `raw/` : contenu transitoire à traiter ou supprimer rapidement.
- `wiki/` : connaissance stable, courte et validée.
- `archive/` : contexte historique condensé, rarement lu.
- `log.md` : détail des trois derniers jours, puis historique condensé.
- `bugs.md` : une ligne normalisée par problème.

## Qualité

- Vérifier les faits dans le code avant de reprendre une ancienne note.
- Distinguer clairement état observé, décision et tâche future.
- Écrire court, orienté action, sans storytelling.
- Utiliser des liens Obsidian seulement s’ils améliorent la navigation.
- Utiliser uniquement la taxonomie de tags définie dans `bugs.md` et la documentation.
- Ne jamais recopier de valeur provenant d’un fichier `.env*`.
- Respecter les changements non liés déjà présents dans le dépôt.

## Liens

[[index]] · [[log]] · [[bugs]] · [[Roadmap]]
