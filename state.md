# State — Journal de bord du tunnel agentique

Règle : une entrée par cycle (~6h de travail). On ne garde que les **18 dernières
heures** (≈3 cycles). Les cycles plus anciens sont fondus dans la ligne « Résumé
glissant » ci-dessous, puis supprimés — pour ne pas coûter de contexte.
Format d'entrée : `[AAAA-MM-JJ HH:MM] <tool/phase> | fait | tests | prochaine étape`.

## Résumé glissant (>18h)

- **Cycle 1 (2026-07-18)** — Tunnel agentique gravé ([[agentic-tunnel]]), `state.md`/
  `journalbug.md`/`CLAUDE.md` unifié/`tasks/README.md` créés. **Outil #1
  `kyc-company-enrichment`** (acteur `harvestapi/linkedin-company`, flag
  `APIFY_COMPANY_ENRICH`) : 35/35 tests, live OK, **déployé EC2** (PR #17, flag ON).

## Cycles récents (<18h)

### [2026-07-20 ~16:00] Cycle 3 — Outil #2 `kyc-adverse-media` (négative news AML)
- **Fait** : tunnel complet (01/02/03). Nouveau module `scripts/apify_adverse_media.py`
  + `enrich_adverse_media` dans `kyc_worker.py` (câblé après enrich société). Acteur
  `regdata/adverse-media-screener` remplit `adverse_media`. Gardes anti-diffamation :
  identité confirmé/probable uniquement, drop rôle victime/plaignant + `entityMatchConfidence`
  bas + sans source_url. Flag `APIFY_ADVERSE_MEDIA` **OFF par défaut** (~$0.14/lead).
- **Tests** : 45/45 unitaires OK (10 nouveaux) ; agent test-code ✅ 5/5 ; live EC2
  (Madoff → HIGH, 5 hits financial_crime) → forme de sortie confirmée.
- **Prochaine étape** : déployer EC2 (flag OFF) ; **décision utilisateur** : activer ON
  (~$0.14/lead) ? Puis outil #3 `fleet-content-audit` ou `kyc-company-registry`.

### [2026-07-20 ~14:00] Cycle 2 — QMD (moteur de recherche RAG Obsidian) + branchement tunnel
- **Fait** : QMD 2.5.3 installé (modèles GGUF locaux, no API key). Collections
  `memory` / `moana-wiki` / `moana-archive` / `moana-tasks` + contextes. MCP `qmd`
  (`cmd /c qmd mcp`) dans `.mcp.json` + activé. Consigne « QMD d'abord pour
  contexte/mémoire/Obsidian » gravée dans les 4 agents du tunnel (× 2 copies) +
  `CLAUDE.md` + mémoire ([[qmd-rag-search]], [[agentic-tunnel]]). Tunnel suivi :
  `tasks/qmd-rag-search/` (01/02/03).
- **Tests** : BM25 `qmd search` OK (tunnel, quirks YATCO, KYC, adverse media, avec
  contextes + scoring) ; scoping `-c` OK ; `qmd update` (nouveaux fichiers) OK ;
  `qmd get` (source + n° ligne) OK ; serveur MCP démarre OK.
- **Bloqueur** : `qmd embed` bloque (poste CPU sans GPU, llama.cpp « 0 math cores ») →
  pivot **BM25 uniquement**, `query`/`vsearch` désactivés (caveat dans les 8 agents +
  CLAUDE.md, bug dans journalbug.md). Vectoriel à réactiver si GPU un jour.
- **Prochaine étape** : **Outil #2 `kyc-adverse-media`** (négative news AML) dans le tunnel.

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
