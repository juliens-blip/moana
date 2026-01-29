# Plan - Création manuelle de contacts + logo Moana listings

1) Ajouter un mode "contact" au modal de création (LeadCreateModal)
- Paramètre `mode` (`'lead' | 'contact'`).
- Valeurs par défaut adaptées (`request_type: 'Contact'`).
- UI contact-only: masquer section bateau + champ request_type.

2) UI CRM
- Ajouter un bouton "Nouveau contact" dans `app/dashboard/leads/page.tsx`.
- Ouvrir `LeadCreateModal` en mode contact.

3) Logo Moana listings
- Télécharger le logo dans `public/branding/moana-logo.jpg`.
- Créer un petit composant local (ex. `MoanaLogoIcon`) pour remplacer les icônes génériques.
- Ajouter un filigrane (opacity faible) dans la carte listing.
- Remplacer les icônes génériques dans `ListingCard`, `ListingDetailModal` et `ListingFilters`.

4) Tests
- Ajouter un test API (tsx) qui tente un POST `/api/leads` avec payload "contact" minimal.
- Le test valide `201/200` ou `401` (auth manquante) comme résultat acceptable.

5) Vérifications
- Lint TypeScript (optionnel si pas de script de test). Identifier si tests non exécutés.
