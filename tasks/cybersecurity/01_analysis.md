# 01 — Analyse EXPLORE : cybersecurity

## Contexte récupéré

- QMD disponible en BM25 : `qmd 2.5.3`.
- Références QMD utilisées : `qmd://moana-wiki/Roadmap.md` et les artefacts
  `qmd://moana-tasks/vessel-visibility-stats/02-implementation-log.md` et
  `qmd://moana-tasks/market-trends/01-analysis-and-plan.md`.
- Graphiti/Graphyphy n’est pas installé ni exposé dans la session actuelle.

## Constats code

1. Authentification par comparaison de secret en clair et journalisation du
   mot de passe dans `lib/supabase/auth.ts`.
2. Cookie `moana_session` contenant un JSON non signé ; l’identité n’est pas
   revalidée côté serveur.
3. Routes `/api/debug/auth` et `/api/debug/env` exposées.
4. Route `/api/brokers` sans session, avec effet de bord de provisioning et
   valeur de mot de passe par défaut.
5. Webhook Boats Group protégé principalement par IP et en-têtes proxy, sans
   signature HMAC, anti-rejeu ni rate limit persistant.
6. Données d’identification historiques présentes dans `backup/brokers.csv` et
   scripts de test/migration.
7. Usage généralisé du client Supabase `service_role`, ce qui rend la session
   applicative et ses contrôles d’autorisation critiques.

## Risques prioritaires

- P0 : forge de session et accès transversal aux données CRM.
- P0 : exposition ou réutilisation de credentials historiques.
- P0 : fuite de secrets via debug et logs.
- P1 : webhook falsifiable/rejouable selon le proxy de déploiement.
- P1 : absence de limitation des tentatives de connexion et contrôles
  d’autorisation centralisés.

## Contraintes

- Ne jamais recopier de valeur issue d’un `.env`.
- Ne pas supprimer les modifications WIP des autres features.
- Toute correction doit conserver un mécanisme de migration des mots de passe
  existants, sans bloquer tous les brokers lors du déploiement.
- Le secret de session et le secret webhook doivent être fournis par
  l’environnement de déploiement, jamais par le dépôt.
