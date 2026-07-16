# Architecture

## Vue d’ensemble

Application monolithique Next.js 14 App Router. Les pages React appellent des route handlers; la logique métier accède à Supabase. Zod valide les entrées et Tailwind gère l’interface.

```text
Navigateur → pages/composants → app/api/* → lib/supabase/* → Supabase
                                         ↘ validation/types
```

## Données

- `brokers` : identité métier des brokers.
- `listings` : yachts publiés et leur broker.
- `leads` : contacts CRM manuels ou reçus de Boats Group.
- `lead_kyc_reports` : tentatives KYC versionnées; dernier résumé lu via `lead_kyc_latest`.
- `bateaux_a_suivre` et `bateaux_chantier` : listes indépendantes utilisant le même service TypeScript.
- Supabase Storage : images des listings et listes de suivi.
- Airtable : ancien stockage; encore présent dans `lib/airtable.legacy/` et le serveur `mcp/airtable-moana-mcp/`.

## API

| Domaine | Routes | Rôle |
|---|---|---|
| Auth | `/api/auth/login`, `/logout`, `/me` | Session broker |
| Listings | `/api/listings`, `/api/listings/[id]`, `/image` | CRUD, filtres, images |
| Brokers | `/api/brokers` | Liste et résolution des brokers |
| CRM | `/api/leads`, `/api/leads/[id]` | Liste, création manuelle, statut, commentaires |
| KYC | `/api/leads/[id]/kyc` | Lecture/relance Vercel; collecte asynchrone par worker Crawl4AI VPS |
| Ingestion | `/api/leads/yatco` | Webhook Boats Group; nom technique historique |
| Suivi | `/api/bateaux-a-suivre*`, `/api/bateaux-chantier*` | CRUD et images des deux listes |

Les routes `/api/debug/env` et `/api/debug/auth` sont des dettes de sécurité, pas des interfaces supportées; voir [[bugs]].

## Authentification actuelle

`lib/supabase/auth.ts` recherche le broker avec le client admin et place une session de 24 h dans le cookie HTTP-only `moana_session`. L’implémentation compare encore les mots de passe en clair et ne signe pas le contenu du cookie. Ne pas considérer ce mécanisme prêt pour la production.

Les handlers exigent généralement une session. Les routes de modification et suppression autorisent explicitement tout broker authentifié à agir sur tout listing; cette règle métier doit être confirmée avant durcissement.

## Flux clés

- Listing : validation Zod → résolution éventuelle du nom broker en UUID → écriture Supabase.
- Lead manuel : `POST /api/leads` → validation → création associée au broker.
- Lead externe : webhook `/api/leads/yatco` → validation, déduplication et routage broker → Supabase.
- Image : multipart → contrôle du type/taille → Storage → mise à jour de l’URL en base.

## Repères

- UI et routes : `app/`, `components/`.
- Services, auth, types : `lib/`.
- Schémas et scripts d’administration : `scripts/`.
- Tests actuels : `tests/` et scripts `test-*`.
- MCP Airtable autonome : `mcp/airtable-moana-mcp/`.
- Agents et orchestration : `.claude/`, `agents_library/`, `orchestratoragent/`.

## Pièges

- Ne pas réintroduire Airtable dans l’application principale.
- Conserver `yatco` dans les identifiants techniques tant qu’un refactor coordonné n’est pas décidé.
- Ne jamais documenter de valeurs d’environnement.
- Vérifier le schéma SQL réel avant toute évolution; plusieurs guides historiques ne sont plus normatifs.
