# Roadmap

## P0 — Sécurité avant production

- [ ] Hacher les mots de passe brokers, migrer les valeurs existantes et supprimer les logs de mots de passe.
- [ ] Remplacer le cookie JSON forgeable par une session serveur ou un jeton signé.
- [ ] Supprimer ou verrouiller `/api/debug/env` et `/api/debug/auth`.
- [ ] Confirmer puis appliquer la règle d’autorisation sur modification/suppression des listings.

## P1 — KYC/OSINT CRM

- [x] Préparer le modèle Supabase et `scripts/kyc-enrichment-schema.sql`.
- [x] Exécuter le script dans Supabase; succès confirmé le 2026-07-15.
- [x] Implémenter le worker Python, le claim conditionnel et les tests locaux.
- [x] Implémenter le mode Vercel déterministe sans LLM et ses tests.
- [ ] Optionnel : approuver un fournisseur LLM avant tout enrichissement avancé.
- [ ] Valider un premier dossier synthétique complet, puis un lead réel autorisé.
- [x] Déclencher une collecte bornée à chaque nouvelle demande exploitable sans annuler le lead en cas d’échec.
- [x] Stocker résultat structuré, sources, statuts, version et horodatages sans dump inutile.
- [x] Afficher le résumé dans la fiche CRM et permettre une relance manuelle.
- [ ] Ajouter le workflow métier de revue humaine et la politique de conservation.

## P2 — Validation fonctionnelle

- [ ] Rejouer le provisioning idempotent de JMO et Marc avec accès Supabase valide.
- [ ] Vérifier manuellement la création de contacts CRM et le parcours complet des leads Boats Group.
- [ ] Tester en production les uploads, la PWA et les listes « à suivre »/« chantier ».
- [ ] Vérifier les politiques RLS et l’accès Storage pour chaque rôle réel.

## P3 — Fiabilité

- [ ] Couvrir auth, autorisations, webhook, déduplication et CRUD par des tests automatisés stables.
- [ ] Retirer le code Airtable historique après validation qu’aucun flux actif ne l’utilise.
- [ ] Ajouter rate limiting et journalisation structurée sans données sensibles.

## Terminé

- [x] Migration applicative principale vers Supabase.
- [x] Résolution broker nom → UUID.
- [x] CRM leads et création manuelle de contacts.
- [x] Listes indépendantes « bateaux à suivre » et « bateaux chantier » avec images.
