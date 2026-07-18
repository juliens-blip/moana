# 03 — Journal d'implémentation : kyc-company-enrichment

## Fait
- `apify_linkedin.py` : `_primary_position` retourne `companyLinkedinUrl` ;
  `_profile_text` émet `EntrepriseUrl:` ; `_normalize_company` (pur, mapping
  LinkedIn→company_profile) ; `search_company(url|name)` (URLs ou fallback nom,
  jamais raise, borné `COMPANY_MAX_CHARGE_USD`).
- `kyc_worker.py` : config `APIFY_COMPANY_ENRICH` (flag) +
  `APIFY_LINKEDIN_COMPANY_ACTOR_ID` ; accesseur `linkedin_company_url` ;
  `enrich_company_profile()` async (garde prudence : confirmé/probable OU
  entreprise de la query ; fusion non destructive) câblé après
  `synthesize_report` (worker + dry-run) ; self-check étendu.
- Tests : classe `CompanyEnrichmentTests` (7 tests).

## Tests
- Unitaires : 35/35 OK (dont 7 nouveaux), 0 régression.
- Live Apify : `search_company` par URL (Golden Suisse) ET par nom (Ferretti
  Group → Shipbuilding, IT, 1968, 1258 employés) → company_profile bien rempli.
- Agent test-code : ✅ prêt (compile, suite, symboles, périmètre).

## Déploiement
- AWS EC2 : build + up `compose.kyc.yml` ; `.env.kyc` :
  `APIFY_COMPANY_ENRICH=1`.

## Suite (backlog)
- Champs non fournis par LinkedIn (LEI, VAT, registre, dirigeants, revenus) →
  outil séparé `kyc-company-registry` (priorité 2).
