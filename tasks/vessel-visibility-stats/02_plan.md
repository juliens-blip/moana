# 02 — Plan APEX : vessel-visibility-stats

## Objectif

Rendre exploitable et compilable le parcours statistiques YATCO déjà présent :
contrat TypeScript, route API, service Supabase, affichage dans la fiche listing
et synchronisation documentée.

## Périmètre et propriété des fichiers

- Contrat partagé : `lib/types.ts` — ajouter uniquement les champs/types YATCO
  manquants, sans écraser les modifications OpenSanctions ou Market Trends.
- Lecture applicative : `lib/supabase/yatco-stats.ts` et
  `app/api/listings/[id]/yatco-stats/route.ts`.
- UI : `components/listings/YatcoStatsSection.tsx` et son branchement existant
  dans `ListingDetailModal`.
- Données : vérifier `scripts/add-yatco-stats.sql` et le script de visibilité,
  sans exécuter de mutation distante depuis le code applicatif.

## Étapes CODE

1. Ajouter `YatcoListingStats` et `yatco_vessel_id` au contrat `Listing`.
2. Vérifier les champs nullable et l’ordre chronologique renvoyé par le service.
3. Corriger le traitement d’erreur et l’état vide dans le composant graphique.
4. Conserver la règle métier : une fiche non liée retourne une liste vide.
5. Documenter le rafraîchissement manuel et la couverture limitée aux vessels
   actuellement rapprochés.

## Étapes TEST

- `npm run lint`.
- `npm run type-check`.
- `npm run build`.
- Test unitaire du mapping d’un snapshot et du cas sans historique.
- Test fonctionnel authentifié de `GET /api/listings/[id]/yatco-stats` sur une
  fiche liée et une fiche non liée.
- Contrôle visuel de la fiche listing avec 0, 1 puis au moins 2 snapshots.

## Critères de sortie

- Aucun diagnostic TypeScript lié à YATCO Stats.
- Aucun secret ou accès Supabase ajouté au navigateur.
- Les erreurs de données n’empêchent pas l’affichage de la fiche listing.
