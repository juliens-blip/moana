# 03 — Journal d'implémentation : kyc-adverse-media

## Fait
- **Nouveau module** `scripts/apify_adverse_media.py` (pur + testable) :
  `_map_category` (actor riskCategory→enum report), `_map_confidence` (severity→
  confidence), `_is_subject_adverse` (drop rôle victime/plaignant), `_normalize_hit`
  (drop si pas de source_url / rôle non-adverse / `entityMatchConfidence==low`),
  `_normalize_items` (aplatit + dédup par source_url), `screen_adverse_media` async
  (input actor, `.call(timeout=timedelta, max_total_charge_usd=0.50)`, jamais raise → `[]`).
- `scripts/kyc_worker.py` : import dual ; 4 champs Settings (`apify_adverse_media`
  défaut **False**, `apify_adverse_media_actor_id`, `adverse_media_min_severity`,
  `adverse_media_max_hits`) + `from_env` + `check_configuration` ; fonction
  `enrich_adverse_media` (garde identité confirmé/probable UNIQUEMENT ; construit
  l'entité personne depuis person_profile ; étend `adverse_media` avec dédup ; ajoute
  les URLs aux `sources`) ; câblée après `enrich_company_profile` (worker + dry-run).
- Tests : classe `AdverseMediaTests` (10 tests).

## Tests
- Unitaires : **45/45 OK** (35 + 10 nouveaux), 0 régression.
- Agent test-code (via general-purpose, `test-code` non enregistré comme subagent_type) :
  ✅ 5/5 étapes — périmètre git propre (3 fichiers), byte-compile, symboles, self-check
  `check` (4 clés, flag=false), gardes anti-diffamation présentes et testées, aucun
  secret en dur. Verdict : prêt pour déploiement.
- **Live** (EC2, 1 run ~$0.14) : `regdata/adverse-media-screener` sur « Bernard Madoff »
  → overallRisk HIGH, 5 hits financial_crime, chaque hit avec url/publishedDate/snippet/
  riskCategory/severity/entityRole/entityMatchConfidence → forme de sortie confirmée,
  mapping écrit sur ces clés réelles.

## Pièges rencontrés (→ journalbug)
- `.call(timeout_secs=...)` → TypeError ; utiliser `timeout=timedelta(...)`.
- Objet `Run` est pydantic : `run.default_dataset_id` (pas `run.get(...)`).

## Déploiement
- Flag **OFF par défaut** (`APIFY_ADVERSE_MEDIA=0`) → code inerte, zéro coût tant que
  non activé. Acteur `regdata/adverse-media-screener`, PAY_PER_EVENT ≈ $0.14/lead.
- EC2 : ajouter `APIFY_ADVERSE_MEDIA=0` + `APIFY_ADVERSE_MEDIA_ACTOR_ID=...` au `.env.kyc`,
  rebuild worker.

## Décision ouverte (utilisateur)
- Activation ON (≈$0.14/lead) : à décider — laissé OFF par défaut.
