# 02 — Plan APEX : market-trends

## Objectif

Terminer l’onglet Market Trends à partir des artefacts déjà explorés : état
mondial issu du Market Review et courbe prospective alimentée par Market Pulse.

## Périmètre et propriété des fichiers

- Page : `app/dashboard/market-trends/page.tsx`.
- Données : `lib/supabase/market-review.ts` et lecture bornée de
  `yatco_market_pulse`.
- Visualisations : `components/listings/MarketReviewCharts.tsx` et
  `components/listings/MarketPulseTrendChart.tsx`.
- Navigation/exports : `components/layout/Header.tsx` et
  `components/listings/index.ts`.
- Schéma et ingestion déjà présents : ne pas modifier le scraper externe sans
  nécessité ; valider le contrat JSONB côté serveur.

## Étapes CODE

1. Ajouter un lecteur agrégé Market Pulse borné par période et volume.
2. Corriger les types Recharts, notamment `Tooltip.formatter` nullable.
3. Construire la page serveur avec gestion explicite des tables vides ou
   indisponibles.
4. Brancher les deux graphiques et exporter les composants.
5. Ajouter le lien desktop/mobile dans la navigation.
6. Afficher clairement que la courbe est prospective et sans historique
   rétroactif avant les premiers runs.

## Étapes TEST

- `npm run lint`.
- `npm run type-check`.
- `npm run build`.
- Test du regroupement par jour de New/Modified/Sold/baisses de prix.
- Test de rendu avec snapshot vide, un snapshot et plusieurs snapshots.
- Test fonctionnel authentifié de `/dashboard/market-trends`.
- Vérification de l’absence de requête non bornée sur l’event-stream.

## Critères de sortie

- Route, navigation et exports présents.
- Recharts compilable avec `strict: true`.
- Aucun chargement de tout l’historique sans limite.
- Erreur Supabase transformée en état utilisateur compréhensible.
