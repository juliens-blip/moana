# 02 — Plan : kyc-company-enrichment

## Étapes (granulaires, ordonnées)

### A. Capturer le pointeur entreprise (apify_linkedin.py)
1. Dans `_primary_position()`, retourner aussi `companyLinkedinUrl` (et fallback
   `companyUniversalName`). Signature → `(title, company, description, company_url)`.
2. Émettre une ligne `EntrepriseUrl:` dans `_profile_text()` quand présente, pour
   que le worker puisse la relire (comme `Métier:`/`Entreprise:`).

### B. Fonction de recherche entreprise (apify_linkedin.py)
3. Ajouter `search_company(company_url, company_name, api_token, actor_id)` :
   - input `companies=[url]` si URL, sinon `searches=[name]`.
   - un seul item attendu ; borne `max_total_charge_usd`, `timeout`, jamais raise
     (retourne `{}` sur échec).
   - normaliser la sortie → dict `company_profile` partiel (mapping du 01_analysis).
   - helper `_normalize_company(item)` pur (testable sans réseau).
4. Constantes : `COMPANY_MAX_CHARGE_USD`, réutiliser `RUN_TIMEOUT`.

### C. Intégration worker (kyc_worker.py)
5. Accesseur `linkedin_company_url(document)` (lit `EntrepriseUrl:`).
6. Config env : `APIFY_LINKEDIN_COMPANY_ACTOR_ID`
   (défaut `harvestapi/linkedin-company`), `APIFY_COMPANY_ENRICH` (flag on/off).
7. Dans `research()`/`deterministic_report()` : après sélection du profil, si
   flag actif ET (url entreprise dispo OU `current_company`/`query.company_name`),
   appeler `search_company` une fois, fusionner le dict dans
   `report["company_profile"]` sans écraser une valeur déjà remplie par une
   source plus forte (registre officiel > LinkedIn).
   - Statut/altitude prudente : ne remplir que pour identité `confirmed/probable`
     OU quand l'entreprise vient de la query (attribuable), pas sur homonyme pur.
8. Ajouter une note source `type=linkedin` (déjà géré) — pas de nouvelle source
   trompeuse.

### D. Tests (obligatoire — agent test-code, plusieurs tests)
9. Unitaires (fixtures, sans réseau) :
   - `_normalize_company` mappe tous les champs (Golden Suisse fixture).
   - `_normalize_company` robuste aux champs manquants/None.
   - `_profile_text` émet `EntrepriseUrl:` quand `companyLinkedinUrl` présent.
   - `linkedin_company_url` relit la ligne.
   - `deterministic_report` fusionne le company_profile sans écraser le website
     domain-match existant.
10. `py -3.11 -m unittest` complet + lint/tsc/build via agent test-code.
11. 1 test fonctionnel live Apify (1 entreprise) hors CI, pour confirmer le
    bout-en-bout.

### E. Déploiement AWS + doc
12. Build + up `compose.kyc.yml` sur EC2 ; `.env.kyc` : ajouter
    `APIFY_COMPANY_ENRICH=1` et l'actor id (via l'utilisateur / SSH).
13. `state.md` (cycle), `log.md`, `03_implementation_log.md`.

## Décisions
- Pas de nouveau microservice : on étend le worker KYC existant (backend AWS déjà
  en place). Moindre surface, moindre coût.
- LEI/registre = outil séparé (#2 backlog), hors périmètre ici.
- Fusion non destructive : LinkedIn ne doit jamais écraser une donnée registre.
