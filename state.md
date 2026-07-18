# State — Journal de bord du tunnel agentique

Règle : une entrée par cycle (~6h de travail). On ne garde que les **18 dernières
heures** (≈3 cycles). Les cycles plus anciens sont fondus dans la ligne « Résumé
glissant » ci-dessous, puis supprimés — pour ne pas coûter de contexte.
Format d'entrée : `[AAAA-MM-JJ HH:MM] <tool/phase> | fait | tests | prochaine étape`.

## Résumé glissant (>18h)

_(vide pour l'instant)_

## Cycles récents (<18h)

### [2026-07-18 ~20:00] Cycle 1 — Tunnel + Outil #1 (enrichissement entreprise KYC)
- **Fait** : (1) tunnel agentique gravé en mémoire ([[agentic-tunnel]]),
  `state.md` + `journalbug.md` créés, `CLAUDE.md` unifié (<150 l.), backlog dans
  `tasks/README.md`. (2) Outil #1 `kyc-company-enrichment` traversé dans le
  tunnel (01_analysis/02_plan/03_impl) : acteur Apify `harvestapi/linkedin-company`
  remplit `company_profile` (URL de position retenue ou fallback nom), fusion non
  destructive, garde prudence, flag `APIFY_COMPANY_ENRICH`.
- **Tests** : 35/35 unitaires OK ; live Apify OK (Golden Suisse, Ferretti Group) ;
  agent test-code ✅ prêt.
- **Prochaine étape** : déployer sur EC2 (build + `APIFY_COMPANY_ENRICH=1`), puis
  outil #2 `kyc-adverse-media` (négative news AML) dans le tunnel.
