# 03 — Implementation log (CODE + TEST) : market-trends

## CODE — 2026-07-22

- Ajout de `/dashboard/market-trends` avec états chargement vide/erreur et
  chargement indépendant du snapshot Market Review et de la tendance Market
  Pulse.
- Ajout des trois graphiques Market Review et de la courbe journalière Market
  Pulse ; le formatter Recharts accepte désormais les valeurs nullable.
- Lecture Market Pulse bornée à 14 jours et 2 000 événements maximum, avec
  validation du JSONB Market Review avant rendu.
- Ajout du lien Header desktop/mobile et des exports de composants.
- Le snapshot doit être appliqué dans Supabase via
  `scripts/market-review-schema.sql`, puis alimenté par
  `scripts/sync-market-review.ts` ; aucun accès externe n'est exécuté par la
  page.

## TEST

- `npm run lint` : OK sur le périmètre.
- Test d'agrégation New/Modified/Sold/baisses de prix : OK.
- `npm run type-check` après intégration : OK.
- `npm run build` : OK après remplacement de Google Fonts et correction des
  imports serveur `getSession` ; seuls les avertissements de fraîcheur
  Browserslist/Baseline restent.

## Reste à faire

- Appliquer le schéma et lancer le scraper/sync Market Review en environnement
  opérationnel.
- L'historique de tendance est prospectif : il n'y a pas de rétroactivité
  avant les premiers runs du scraper Market Pulse.
