# Analyse - Boats Group + Leads

## Portée demandée
- Remplacer les mentions **Yatco** par **BOats group**.
- Supprimer les leads de test/essai (identifiables facilement).
- Ajouter la possibilité d'ajouter un lead manuellement dans le CRM via un bouton "+ Nouveau lead".

## Constat codebase
### CRM leads UI
- Page principale: `app/dashboard/leads/page.tsx`.
  - Texte: "{leads.length} leads Yatco", "Les leads Yatco apparaîtront ici".
  - Pas de bouton d'ajout manuel.
- Détails: `components/leads/LeadDetailModal.tsx`.
  - Lien "Voir l'annonce sur Yatco".
  - ID affiché: `lead.yatco_lead_id`.
- Carte: `components/leads/LeadCard.tsx`.
  - Lien "Voir l'annonce" (générique, OK).

### API / Data
- `app/api/leads/route.ts` ne gère que GET (pas de création).
- `lib/supabase/leads.ts` contient une fonction `createTestLead` qui crée un lead avec `yatco_lead_id = TEST-...`.
- Schéma DB: `scripts/leads-schema.sql`.
  - Champs obligatoires: `yatco_lead_id`, `lead_date`, `source`, `contact_display_name`, `status`.

### Types / validation
- `lib/types.ts` définit `YatcoLeadPayload` et types de lead.
- `lib/validations.ts` a `yatcoLeadPayloadSchema` mais pas de schéma pour création manuelle.

### Mentions Yatco
- Plusieurs occurrences dans UI, commentaires, docs et scripts (`rg "Yatco"`).
- Les identifiants/paths API et types utilisent `Yatco*` — gros refactor si renommage complet.

## Interprétation
- Remplacer les **mentions affichées** et docs/commentaires visibles par "BOats group".
- Conserver les identifiants techniques (noms de type, routes) pour éviter un refactor risqué.

## Suppression des leads test
- Leads tests identifiables par:
  - `yatco_lead_id` préfixé `TEST-`.
  - `contact_email = test@example.com`.
  - `contact_display_name = Test Client`.
- Besoin d'une suppression côté serveur (Supabase admin) ou filtrage excluant ces tests.

## Ajout de lead manuel (CRM)
- Ajouter un bouton "+ Nouveau lead" en header.
- Modal de création avec champs essentiels (contact + infos bateau + commentaire).
- POST `/api/leads` côté serveur utilisant `createAdminClient`.
- Générer un `yatco_lead_id` de type `MANUAL-<timestamp>` pour respecter contrainte unique.

## Risques / points d'attention
- RLS: création via admin client, donc OK.
- Validation: ajouter zod schema pour les champs manuels.
- Nettoyage test leads: si suppression automatique, éviter impact sur leads réels.
