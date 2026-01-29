# Implementation Log - Boats Group + Leads

## Modifications
- Ajout du schéma Zod `manualLeadSchema` et du type `ManualLeadInput`.
- Suppression de `createTestLead` et ajout de `purgeTestLeads` + `createManualLead`.
- Ajout d'un POST `/api/leads` pour créer des leads manuels.
- Purge + filtrage des leads tests lors du GET `/api/leads`.
- Ajout du modal de création manuelle et du bouton "Nouveau lead" en UI.
- Remplacement des mentions UI/serveur "Yatco" en "BOats group".

## Fichiers touchés
- `lib/validations.ts`
- `lib/supabase/leads.ts`
- `app/api/leads/route.ts`
- `app/api/leads/yatco/route.ts`
- `app/dashboard/leads/page.tsx`
- `components/leads/LeadCreateModal.tsx`
- `components/leads/index.ts`
- `components/leads/LeadDetailModal.tsx`
- `scripts/leads-schema.sql`
- `lib/types.ts`

## Notes
- Les identifiants techniques (types/route `yatco`) ne sont pas renommés pour éviter un refactor large.
- Les leads tests sont supprimés côté serveur sur la base d'IDs `TEST-` + email `test@example.com` + nom `Test Client`.
