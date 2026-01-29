# Analyse - Création manuelle de contacts + logo Moana listings

## Demande
- Ajouter la possibilité de créer manuellement des contacts dans le CRM.
- Intégrer le logo Moana en filigrane dans les listings et remplacer les icônes génériques par le logo.
- Ajouter des tests pour vérifier le fonctionnement.

## État actuel
- CRM Leads: un modal `LeadCreateModal` existe déjà et crée un lead manuel via `POST /api/leads`.
- Le schéma `manualLeadSchema` ne requiert que `contact_display_name` (le reste est optionnel).
- UI leads: page `app/dashboard/leads/page.tsx` affiche un bouton "Nouveau lead".
- Listings: `components/listings/ListingCard.tsx`, `ListingDetailModal.tsx`, `ListingFilters.tsx` utilisent des icônes Lucide (Anchor, Calendar, MapPin, User, BedDouble, etc.).

## Impacts attendus
- Fournir un flux "Contact" explicite (UI dédiée ou mode du modal existant).
- Utiliser la même API (pas de nouvelle table), en enregistrant un lead manuel avec `request_type=Contact` et `source=Manual`.
- Ajouter le logo Moana comme filigrane dans la carte listing, et remplacer les icônes génériques par un logo (ou un composant logo).
- Ajouter un test API pour la création d'un contact manuel (gérer 401 si non authentifié).

## Fichiers clés
- `app/dashboard/leads/page.tsx`
- `components/leads/LeadCreateModal.tsx`
- `components/leads/index.ts`
- `components/listings/ListingCard.tsx`
- `components/listings/ListingDetailModal.tsx`
- `components/listings/ListingFilters.tsx`
- `lib/validations.ts` (déjà compatible)
- `tests/api/*`

## Hypothèses/Risques
- Pas de table dédiée "contacts": on réutilise `leads`.
- Les tests API nécessitent un serveur Next.js actif + session; les scripts doivent accepter un 401 comme résultat "pass".
- Le logo doit être stocké localement dans `public/` et référencé via `/...`.
