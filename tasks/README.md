# Tasks — Index des features (tunnel agentique)

Chaque feature suit le tunnel (voir `CLAUDE.md` § Tunnel agentique) :
`01_analysis.md` → `02_plan.md` → `03_implementation_log.md`.

## Backlog d'outils (audit 2026-07-18, par ratio valeur/effort)

| Priorité | Outil | Source | Backend | État |
|----------|-------|--------|---------|------|
| 1 | `kyc-company-enrichment` — remplir `company_profile` du KYC (LinkedIn company) | Apify | AWS worker KYC | ✅ déployé (flag ON) |
| 2 | `kyc-adverse-media` — remplir `adverse_media` (négative news AML) | Apify | AWS worker KYC | ✅ déployé, flag **ON** sur EC2 (condition LinkedIn ≥600 car.) |
| 3 | `fleet-content-audit` — listings Moana sans photos/vidéo/specs | YATCO BOSS | UI (Supabase, pas d'AWS) | ✅ codé+testé, rien commité |
| 4 | `market-pulse` — feeds MLS New/Modified/Sold 5j (comps, baisses de prix) | YATCO BOSS | UI (Supabase, pas d'AWS) | ✅ codé+testé, rien commité |
| 5 | `vessel-visibility-stats` — statistiques YATCO.com sur les listings liés | YATCO BOSS | UI (Supabase, pas d'AWS) | ✅ code/type-check, sync manuel restant |
| 6 | `market-trends` — état mondial + tendance prospective Market Pulse | YATCO BOSS | UI (Supabase, pas d'AWS) | ✅ code/type-check, schéma/sync manuel restant |
| 7 | `yatco-automation` — refresh Stats + Market Trends toutes les 72 h | YATCO BOSS | AWS EC2, Docker + systemd | ✅ déployé, run live 3/3 vert, refresh 72 h + keepalive 4 h actifs |
| P0 | `cybersecurity` — durcissement auth, secrets, API et webhook | Code/Supabase | App + documentation | ✅ code/type-check, configuration/rotation à faire |
| — | `kyc-company-registry` — champs registre non fournis par LinkedIn (LEI, VAT, dirigeants) | Apify/GLEIF | AWS worker KYC | backlog (issu de #1) |

## Infra / outillage
- `qmd-rag-search` — moteur de recherche BM25 sur la RAG (vault Obsidian + mémoire), branché dans les agents du tunnel. ✅
- `graphify-cli` — graphe local AST du code/SQL pour les agents Codex. ✅ `uvx
  --from "graphifyy[sql]"` validé, intégration Codex dans `AGENTS.md` et
  `.codex/hooks.json`, graphe local généré.

## Features existantes
- `kyc-multi-source-screening` — worker KYC/OSINT (LinkedIn Apify, SearXNG, Crawl4AI).
