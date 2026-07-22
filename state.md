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
- **Cycle 2 (2026-07-20)** — QMD 2.5.3 installé (BM25 uniquement, CPU sans GPU),
  branché dans les 8 fichiers agents + CLAUDE.md + mémoire ([[qmd-rag-search]]).
- **Cycle 3 (2026-07-20)** — Outil #2 `kyc-adverse-media` codé+testé (47/47),
  gardes anti-diffamation + condition LinkedIn ≥600 car., **déployé EC2 flag ON**.

## Cycles récents (<18h)

### [2026-07-22] Cycle 7 — Reprise APEX segmentée : YATCO Stats, Market Trends, cybersécurité
- **Fait** : QMD 2.5.3 vérifié et utilisé en BM25 ; Graphiti/Graphyphy non disponible.
  Analyses/plans APEX créés pour `vessel-visibility-stats`, `market-trends` et
  `cybersecurity`. Nouvel agent `.claude/agents/cybersecurity.md` créé.
- **Bugs enregistrés** : contrats TypeScript YATCO incomplets, Market Trends non
  câblé, build dépendant des Google Fonts, auth/session/debug/credentials à durcir.
- **Tests** : état de départ confirmé : lint vert, type-check rouge, build bloqué
  par TLS Google Fonts ; tests Python bloqués par l’environnement LiteLLM/TLS.
- **Prochaine étape** : agents code segmentés YATCO Stats + Market Trends + cyber,
  puis agent test-code sans modification du code et boucle APEX jusqu’au vert.

### [2026-07-22] Complément — CODE + durcissement sécurité
- **Fait** : YATCO Stats compile et gère les états UI ; Market Trends est câblé
  sur `/dashboard/market-trends`, nav, exports et lecture bornée ; auth/session,
  brokers, debug, webhook YATCO, scripts credentials et RLS ont été durcis.
- **Tests** : `npm run lint`, `npm run type-check`, `npm run build`,
  `git diff --check`, KYC déterministe 12/12 et crypto scrypt/HMAC verts ; les
  avertissements restants concernent uniquement la fraîcheur Browserslist/
  Baseline.
- **Reste** : variables `MOANA_SESSION_SECRET`/`YATCO_WEBHOOK_SECRET`, rotation
  des credentials historiques, application des schémas/syncs Supabase et
  validation HTTP en environnement intégré.

### [2026-07-22] Complément — Installation Graphify CLI
- **Fait** : Graphify 0.9.23 confirmé via `uv`; intégration Codex installée
  (`AGENTS.md`, `.codex/hooks.json`). Extraction AST + SQL locale validée avec
  `uvx --from "graphifyy[sql]"` : 1 284 nœuds, 3 001 relations brutes, 2 646
  relations après clustering, 118 communautés.
- **Tests** : requête ciblée auth/webhook renvoie les modules de session,
  sécurité, route YATCO et Supabase ; aucune API LLM utilisée.
- **Reste** : le tool env global `uv` est verrouillé pour une réinstallation
  de l'extra SQL ; `uvx --from` est le chemin reproductible retenu.

### [2026-07-22] Complément — Automatisation AWS YATCO 72 h
- **Fait** : paquet `ops/yatco-automation` créé via le tunnel APEX, image
  Playwright 1.55.1 construite sur EC2, Supabase readiness 4/4, service/timer
  systemd installés et durcis (score 2.4 OK), aucun impact sur le worker KYC.
- **Tests** : automation 6/6, lint/type-check/build verts, npm audit 0,
  `systemd-analyze verify` vert, garde d'auth absente vérifiée.
- **Final** : session BOSS renouvelée, schéma Market Review appliqué, run live
  3/3 vert ; timers refresh 72 h + keepalive 4 h actifs. Retry idempotent et
  disque EC2 ramené de 82 % à 64 % après retrait de l'image vulnérable obsolète.

### [2026-07-21 ~16:45] Cycle 6 — Outil #4 `market-pulse` : CODE + TEST complet
- **Fait** : EXPLORE confirme le pipeline Search module (`useractionid` 75/76/77,
  New/Modified/Sold, MLS-wide 5j glissants) avec `div.HistoryText` donnant le texte
  littéral du changement ("Price was X changed to Y.") — pas de diff maison requis
  pour détecter les baisses de prix. Limite trouvée : chaque feed a un vrai total
  (190 vu ce jour) mais seules les ~12 lignes triées "Largest" se rendent (pagination
  non résolue, décision produit : segment Moana = 27-85m donc pas bloquant pour v1).
  Codé : `yatco_market_pulse` (event-stream, SQL appliquée par l'utilisateur),
  scraper standalone `D:\dev\scrape-mcp\scripts\market-pulse-scrape.mjs`, ingestion
  `scripts/sync-market-pulse.ts`, section app `/dashboard/market-pulse`
  (`MarketPulseCard`/`MarketPulseGrid`, bandeau rouge si baisse de prix, tag "(Moana)"
  si le broker est Moana lui-même), nav Header mise à jour.
- **Tests** : `tsc`/`eslint` 0 erreur ; scraper live 30/30 lignes OK (12 new/12
  modified/6 sold, 0 price drop sur ce batch précis) ; ingestion 30 synced/0 erreur ;
  QA visuelle `next dev` + cookie broker local → 200, données réelles confirmées.
- **Non fait** : pagination complète des feeds (top ~12-25 actuel) ; pas de refresh
  auto ; rien commité (même caveat `lib/types.ts`/`package.json`).
- **Prochaine étape** : décision utilisateur — commit sélectif des 2 features (#3+#4)
  + déploiement Vercel, ou enchaîner sur `kyc-company-registry` (LEI/VAT/dirigeants,
  backlog secondaire, rien commencé).

### [2026-07-21 ~14:30] Cycle 5 — Outil #3 `fleet-content-audit` : CODE + TEST complet
- **Fait** : pipeline scraping BOSS craqué (`tasks/fleet-content-audit/02_scraping_findings.md`
  BREAKTHROUGH #1+#2) — Insight Analytics « Active Listings Report » rend en headless,
  et cliquer le bouton photo d'une ligne charge le détail complet inline (photos, specs,
  description, broker's message, days on market). Plan écrit (`03_plan.md`), puis codé :
  schéma `yatco_fleet_listings` (SQL appliqué par l'utilisateur dans Supabase),
  scraper standalone réutilisable `D:\dev\scrape-mcp\scripts\fleet-audit-scrape.mjs`
  (pas besoin de Claude/MCP pour les futurs refresh), ingestion `scripts/
  sync-yatco-fleet-listings.ts`, nouvelle section app `/dashboard/listings-yatco`
  (`FleetAuditCard`/`FleetAuditGrid`), nav Header mise à jour.
- **Tests** : `tsc --noEmit` + `eslint` 0 erreur ; run live scraper 25/25 vessels OK ;
  ingestion 25 synced / 6 liés à des listings Moana / 0 erreur ; QA visuelle via
  `next dev` + cookie de session broker construit localement (pas de mot de passe
  utilisé) → 200, données réelles confirmées dans le HTML, aucune erreur.
- **Non fait** : couverture limitée aux 25 listings Actifs (34 vessels au total avec
  Expired/Withdrawn/Sold) ; pas de refresh automatique (manuel) ; rien commité —
  `lib/types.ts` et `package.json` contiennent du WIP non lié, à stager sélectivement.
- **Prochaine étape** : décision utilisateur — commit sélectif + déploiement Vercel,
  ou étendre la couverture aux 34 vessels / vidéo (signal absent pour l'instant, à
  vérifier si c'est réel ou un angle mort du parsing).

### [2026-07-20 ~17:30] Cycle 4 — Outil #3 `fleet-content-audit` : EXPLORE (bloqué scrape-mcp)
- **Fait** : EXPLORE (`tasks/fleet-content-audit/01_analysis.md`). Décision utilisateur :
  créer une **nouvelle section app « Listings YATCO » + audit** (car seuls ~10/59 Actifs
  ont un `yatco_vessel_id`). Portée = ingestion flotte BOSS→Supabase + UI + audit
  photos/vidéo/specs. Ordre code explicite donné (zones protégées levées).
- **Bloqueur** : scrape-mcp déconnecté (build+auth présents) → **redémarrer Claude Code**
  pour re-spawn ; re-auth BOSS si cookies expirés ([[scrape-mcp-setup]]).
- **Adverse-media** : ajout d'une **condition LinkedIn** (screen seulement si contenu
  LinkedIn ≥ `ADVERSE_MEDIA_MIN_LINKEDIN_CHARS`=600) → **activé ON** sur EC2 (coût
  ciblé sur les leads substantiels). 47/47 tests.
- **Prochaine étape** : dès scrape-mcp OK, inspecter les pages Fleet Manager/listing BOSS,
  figer schéma Supabase + plan UI (`02_plan.md`), puis CODE→TEST→DEPLOY.

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
