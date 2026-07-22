# 02 — Plan APEX : cybersecurity

## Objectif

Réduire les risques P0 sans exposer de secret et sans confondre authentification
interne, sécurité Supabase et authentification du webhook externe.

## Périmètre de l’agent cybersec

- `lib/supabase/auth.ts` : session signée, validation de forme/expiration,
  migration progressive vers un hash robuste, suppression des logs sensibles.
- `app/api/auth/*` : comportement d’erreur neutre et cookies sûrs.
- `app/api/debug/*` : suppression des endpoints de diagnostic publics.
- `app/api/brokers/route.ts` : session obligatoire, lecture seule, aucun
  provisioning implicite.
- `app/api/leads/yatco/route.ts` : vérification de signature configurée,
  comparaison constante, protection anti-rejeu compatible avec l’architecture.
- tests de sécurité ciblés, sans écrire de secrets dans les fixtures.

## Étapes CODE

1. Introduire les primitives de signature et de validation de session avec
   échec fermé si le secret de runtime manque en production.
2. Implémenter le hash/migration progressive des credentials historiques.
3. Retirer les logs et réponses qui contiennent passwords, hashes, clés ou
   fragments d’environnement.
4. Fermer les routes debug et protéger `/api/brokers`.
5. Sécuriser le webhook sans supprimer l’idempotence métier existante.
6. Ajouter des tests de non-régression : cookie falsifié, cookie expiré,
   secret absent, accès brokers sans session et signature webhook invalide.

## Étapes TEST

- Lint et TypeScript.
- Tests unitaires des primitives crypto.
- Tests HTTP des routes sans cookie, cookie falsifié et cookie valide.
- Vérification statique qu’aucun mot de passe/secret n’est journalisé ou renvoyé.
- Build et audit des dépendances sans installer de paquet non nécessaire.

## Critères de sortie

- Aucun secret sensible en clair dans les logs ou réponses.
- Session non forgeable sans le secret runtime.
- Routes debug absentes ou inaccessibles.
- Webhook refusé par défaut si son mécanisme d’authentification production
  n’est pas configuré.
- Migration des comptes existants documentée et réversible côté données.
