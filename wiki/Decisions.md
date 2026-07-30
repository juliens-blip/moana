# Décisions

| Date | Décision | Motif | Conséquence |
|---|---|---|---|
| 2025-12 | Supabase devient la source principale | Besoin de PostgreSQL, RLS, Storage et services serveur | Airtable reste uniquement historique/MCP |
| 2025-12 | Résoudre les noms de brokers en UUID au niveau service | L’URL et l’UI manipulent des noms, le schéma stocke des UUID | Même résolution pour filtre, création et mise à jour |
| 2026-01 | Garder `yatco` comme identifiant technique du webhook Boats Group | Éviter un refactor transversal sans bénéfice métier immédiat | L’UI parle de Boats Group, la route reste `/api/leads/yatco` |
| 2026-01 | Séparer les bateaux à suivre et chantier | Les deux listes ont des cycles métier distincts | Deux tables et deux familles de routes, service partagé |
| 2026-01 | Autoriser actuellement tout broker connecté à modifier les listings | Comportement explicite des handlers actuels | Décision métier à confirmer avant mise en production |
| 2026-02 | Garder les actifs d’agents près de leur runtime | Les chemins peuvent être consommés par Claude et l’orchestrateur | `.claude/`, `agents_library/` et `orchestratoragent/` ne sont pas déplacés |
| 2026-07-15 | Utiliser quatre fichiers racine et des pages wiki ciblées comme mémoire active | Réduire les lectures et éliminer les doublons | Les longues notes historiques sont condensées dans [[Legacy]] |
| 2026-07-15 | Le KYC/OSINT reste une aide sourcée à la décision humaine | Éviter toute conclusion automatique, juridique ou de conformité | Rapport prudent, données insuffisantes explicites, aucune décision automatique |
| 2026-07-15 | Stocker le KYC dans `lead_kyc_reports`, séparé de `leads` | Conserver l’historique sans alourdir ni écraser le lead | Rapport JSON versionné, dernier résultat via une vue serveur |
| 2026-07-15 | Déclencher par défaut un KYC déterministe dans le backend Vercel | Fonctionner sans fournisseur LLM ni serveur permanent | Collecte courte, risque toujours prudent, échec isolé de la création CRM; worker Python conservé pour un futur enrichissement profond |
| 2026-07-16 | Déporter le crawl KYC vers un worker Docker sur VPS AWS | Chromium et les recherches longues dépassent le rôle d’une requête Vercel | Supabase sert de file; Vercel enqueue et actualise; aucun port worker public |
| 2026-07-22 | Séparer Graphify et QMD dans le contexte agentique | Graphify décrit les relations du dépôt courant; QMD conserve la mémoire, les décisions et l’historique | Audit/feature : QMD d’abord pour l’intention et Graphify ensuite pour la structure; `graphify update .` après code, `qmd update` après notes |

## Règles durables

- Le code observé prime sur une ancienne note.
- Une décision change ici; une tâche change dans [[Roadmap]]; un défaut va dans [[bugs]].
- Les documents opérationnels d’un sous-projet restent co-localisés s’ils servent son exécution.
