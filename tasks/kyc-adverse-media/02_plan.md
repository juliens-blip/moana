# 02 — Plan (PLAN/apex) : kyc-adverse-media

Règle d'or : analyse + plan sur disque avant tout code. Mirror de l'outil #1
(enrichissement société) pour le style et les gardes.

## Étape 1 — Nouveau module `scripts/apify_adverse_media.py` (pur + testable)
- Constantes : `DEFAULT_ADVERSE_MEDIA_ACTOR_ID = "regdata/adverse-media-screener"`,
  `ADVERSE_MEDIA_MAX_CHARGE_USD = Decimal("0.50")` (garde-fou hard).
- `_map_category(actor_cat) -> str` : table actor→enum report
  (financial crime/fraud/money laundering/corruption→`criminal` ;
  sanctions/regulatory enforcement→`regulatory` ; litigation→`civil` ;
  environmental/other→`reputational` ; fiscal/tax→`fiscal`). Défaut `reputational`.
- `_map_confidence(severity) -> str` : high/medium/low → high/medium/low (défaut low).
- `_map_status_type(role, category) -> str` : conservateur, défaut `media_report`.
- `_is_subject_adverse(role) -> bool` : False si rôle victime/plaignant (anti-diffamation).
- `_normalize_hit(item) -> dict|None` : → {category,title,summary,date,jurisdiction,
  confidence,status_type,source_url}. `None` si pas de source_url ou rôle non-adverse.
- `async def screen_adverse_media(entity_names, entity_type, country, aliases,
  api_token, actor_id, min_severity, max_hits) -> list[dict]` : input actor, `.call`
  avec `timeout=timedelta`, borne de charge, **jamais raise** (retourne `[]`), applique
  `_normalize_hit` + dédup par `source_url`.

## Étape 2 — `scripts/kyc_worker.py`
- Import dual try/except : `from scripts.apify_adverse_media import screen_adverse_media`.
- `Settings` : `apify_adverse_media: bool`, `apify_adverse_media_actor_id: str`,
  `adverse_media_min_severity: str`, `adverse_media_max_hits: int`. `from_env` :
  `APIFY_ADVERSE_MEDIA` (défaut **False**), `APIFY_ADVERSE_MEDIA_ACTOR_ID`,
  `ADVERSE_MEDIA_MIN_SEVERITY` (défaut `low`), `ADVERSE_MEDIA_MAX_HITS` (défaut 25).
- `check_configuration` : ajouter les 4 clés.
- `async def enrich_adverse_media(report, query, settings)` :
  - garde flag + token ; **garde attribution stricte** : screener uniquement si
    `identity_resolution.status ∈ {confirmed, probable}` (JAMAIS unresolved/ambiguous
    /homonyme — risque diffamatoire) ;
  - construire l'entité : `entity_names=[full_name]` (report puis query), `entity_type=
    "person"`, `country` = person_profile.country||location, `aliases` = person_profile.aliases ;
  - si pas de nom → return ; appeler `screen_adverse_media` ;
  - **étendre** `report["adverse_media"]` avec les items normalisés, dédup par source_url
    contre l'existant ; ajouter les source_url aux `sources` du rapport ; logguer le compte.
- Câbler après `enrich_company_profile` dans `process_one` (l.2169) **et** le chemin
  dry-run (l.2229).

## Étape 3 — Tests (`tests/test_kyc_worker.py`, classe `AdverseMediaTests`)
1. `_map_category` (échantillon de chaque famille) ; 2. `_map_confidence` ;
3. `_normalize_hit` mappe tous les champs (fixture GOLDEN_HIT) ;
4. `_normalize_hit` **droppe** rôle victime/plaignant ; 5. droppe sans source_url ;
6. `enrich_adverse_media` **ne screene PAS** si identité unresolved/ambiguous (garde) ;
7. merge + dédup (mock `screen_adverse_media`) ; 8. désactivé par flag.
→ viser 35 + 8 = **43 tests**, 0 régression.

## Étape 4 — TEST (agent test-code, obligatoire) + 1 validation live
- Local : `py -3.11` + `PYTHONPATH="repo:repo/scripts"` → suite complète verte.
- Agent `test-code` : compile/suite/symboles/périmètre.
- **1 run live** sur EC2 (sujet à négative-news notoire, ~$0.14) pour confirmer la
  forme de sortie réelle et ajuster le mapping si besoin (loop EPCT→apex si écart).

## Étape 5 — DEPLOY + DOC
- EC2 : ajouter au `.env.kyc` `APIFY_ADVERSE_MEDIA=0` (défaut **OFF**, coût maîtrisé),
  `APIFY_ADVERSE_MEDIA_ACTOR_ID=regdata/adverse-media-screener`. Rebuild worker.
- `state.md` (cycle), `journalbug.md` (si bug), `tasks/README.md` (#2 done), `03_impl`.
- **Décision utilisateur** : activation ON (≈$0.14/lead) — laisser OFF jusqu'au feu vert.

## Critères de succès
- Suite verte (43), non-régression, chemin déterministe intact.
- 1 run live : hits triés, source_url réel dans `adverse_media`, aucun homonyme screené.
- Flag OFF par défaut : zéro coût tant que non activé.
