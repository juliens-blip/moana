# Plan - Boats Group + Leads

1. **Remplacer les mentions Yatco affichées**
   - Mettre à jour les textes UI (page leads, modal).
   - Mettre à jour commentaires/documents visibles si nécessaire, sans renommer identifiants techniques.

2. **Supprimer les leads de test**
   - Ajouter une fonction serveur `purgeTestLeads` dans `lib/supabase/leads.ts`.
   - Appeler cette purge dans `GET /api/leads` avant le fetch (safe: filtre précis sur `yatco_lead_id`/email de test).

3. **Ajouter création manuelle de lead**
   - Ajouter un schéma Zod `manualLeadSchema`.
   - Implémenter `createManualLead` dans `lib/supabase/leads.ts`.
   - Ajouter `POST /api/leads` pour créer un lead manuel.
   - Ajouter un modal UI + bouton "+ Nouveau lead" dans `app/dashboard/leads/page.tsx`.

4. **Vérification**
   - Vérifier création manuelle (happy path) et validation (edge case champs manquants).
   - Vérifier disparition des leads de test.
