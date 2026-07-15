# Historique condensé

Cette note remplace les rapports, guides et journaux devenus redondants. Elle n’est pas normative; vérifier [[Architecture]] et le code avant usage.

## Chronologie

- 2025-12 : première application Next.js connectée à Airtable; nombreux guides sur le nettoyage des champs et rapports MCP.
- 2025-12 : migration progressive vers Supabase; correction du filtre broker nom/UUID et ajout des scripts d’import.
- 2026-01 : CRM Supabase pour les leads Boats Group, création manuelle de contacts, routage broker et purge des leads de test.
- 2026-01 : correctifs d’upload mobile et ajout des listes indépendantes « à suivre » et « chantier ».
- 2026-01 : tentative de provisioning JMO/Marc; script créé mais exécution bloquée par `fetch failed`.
- 2026-02 : ajout des bibliothèques d’agents, compétences de coordination et orchestrateur.

## Sources fusionnées puis retirées

- Racine : anciens `TEST_*`, `SOLUTION_*`, `*_FIX*`, rapports MCP, guides PWA, handoff, statut système, changelog et sauvegarde de consignes.
- `docs/` : architecture Airtable/API, exemples, migration Supabase, CRM, dépannage et index documentaire.
- `tasks/` : analyses, plans et journaux des chantiers leads, brokers et contacts CRM.
- Sorties brutes : logs de build/serveur et résumé texte de tests.

## Connaissance conservée

- L’ancien traitement Airtable supprimait les valeurs vides avant écriture; il ne s’applique pas aux services Supabase actuels.
- La résolution nom broker → UUID est un invariant encore actif.
- Le webhook garde le nom technique `yatco`, mais le produit emploie « Boats Group ».
- Les tests historiques validaient surtout la forme des réponses; ils ne remplacent pas une suite automatisée actuelle.

## Documents laissés en place

Les README et instructions de `.claude/`, `agents_library/`, `orchestratoragent/`, `mcp/airtable-moana-mcp/` et `public/` restent co-localisés car leurs chemins ou leur contexte peuvent être opérationnels.
