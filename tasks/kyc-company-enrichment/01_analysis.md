# 01 — Analyse : kyc-company-enrichment

## Objectif
Remplir le bloc `company_profile` du rapport KYC (aujourd'hui quasi vide : seuls
`website` par domaine-match et `company_name` par la query) avec des données
d'entreprise réelles, quand une entreprise est liée au lead / mentionnée dans le
profil LinkedIn.

## Recherche externe (Apify)
Acteur retenu : `harvestapi/linkedin-company` (même fournisseur que la recherche
de personnes déjà intégrée, 7,7M runs). Vérifié en live 2026-07-18.

**Entrée** (input schema du build par défaut) :
- `companies` : liste d'URLs LinkedIn d'entreprise.
- `searches` : liste de noms d'entreprise (fallback si pas d'URL).

**Sortie** (run réel sur Golden Suisse, SUCCEEDED, 1 item) — champs utiles :
| champ Apify | → company_profile |
|---|---|
| `name` | `company_name` |
| `website` | `website` |
| `industries[0].name` | `industry` |
| `locations[0]` (line1/city/country) | `address` |
| `locations[0].country` (siège) | `jurisdiction` |
| `foundedOn.year` | `incorporation_date` (année de fondation, approx.) |
| `employeeCount` / `employeeCountRange` | `financials.employees` |
| `companyType` (Privately Held/Public) | `legal_form` (descriptif) |
| `description`, `tagline` | (contexte, non stocké tel quel) |

**Non fourni** par LinkedIn company (→ nécessitera un outil registre/LEI séparé,
`kyc-company-registry`, priorité 2 du backlog) : `lei`, `vat_number`,
`registration_number`, `directors`, `ubo`, `shareholders`, `subsidiaries`,
`financials.revenue/net_income`.

## Patterns du code existant
- `scripts/apify_linkedin.py` : pattern d'appel acteur (`_run_actor`,
  `ApifyClientAsync`, `max_total_charge_usd`, `timeout`, jamais raise). L'objet
  `Run` est pydantic → `run.default_dataset_id`.
- La recherche de personnes capture `companyName` mais **jette**
  `currentPosition[0].companyLinkedinUrl` et `companyId` (présents en mode Full).
- `scripts/kyc_worker.py` : `deterministic_report()` peuple `company_profile`
  vers la ligne 1486+ (domain-match). Config via `os.getenv` (voir
  `APIFY_*`). Le worker tourne sur AWS EC2 (Docker `compose.kyc.yml`).

## Contraintes
- Coût : un appel Apify company supplémentaire par lead où une entreprise est
  connue. À borner (max_total_charge_usd) et rendre optionnel (flag env).
- Prudence KYC : ne remplir `company_profile` que si l'entreprise est réellement
  attribuable (URL de la position retenue, ou nom d'entreprise de la query).
  Ne pas inventer LEI/registre depuis LinkedIn.
- Sécurité : token via env uniquement, jamais en dur.
