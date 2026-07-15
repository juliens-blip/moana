# Moana Yachting — Index

## Projet

SaaS interne pour gérer les listings de yachts, deux listes de suivi et les leads commerciaux. L’application est basée sur Next.js App Router et Supabase; Airtable ne subsiste que dans du code historique et le sous-projet MCP.

## Stack et points d’entrée

Next.js 14, React 18, TypeScript, Tailwind CSS, Supabase, Zod. API principales : `/api/auth/*`, `/api/listings`, `/api/brokers`, `/api/leads`, `/api/leads/yatco`, `/api/bateaux-a-suivre` et `/api/bateaux-chantier`.

## Navigation

- [[Architecture]] — composants, données, flux et endpoints actuels.
- [[Decisions]] — choix structurants et contraintes assumées.
- [[Roadmap]] — priorités vérifiables; sécurité en P0.
- [[Crawl4AI]] — installation locale et flux de collecte web vers `raw/`.
- [[KYC-OSINT]] — enrichissement prudent, stockage Supabase et résumé dans la fiche CRM.
- [[bugs]] — problèmes connus et correctifs historiques.
- [[log]] — dernières actions documentaires.

## État

Le socle Supabase et les fonctions métier sont présents. Avant production, traiter les faiblesses d’authentification et retirer les routes de debug exposées; voir [[Roadmap]].
