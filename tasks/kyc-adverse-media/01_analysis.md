# 01 — Analyse (EXPLORE) : kyc-adverse-media

## Besoin
Remplir le tableau `adverse_media` (aujourd'hui `[]` en prod) du rapport KYC via un
acteur Apify de négative-news/AML, en respectant la prudence non-diffamatoire du projet.

## Recall RAG (QMD, BM25)
- `moana-wiki/KYC-OSINT.md:279` : priorité métier = examiner sanctions/PEP, **adverse
  media**, UBO, SPV/navires. Formulations **permises** : « Contentieux civil rapporté;
  aucune condamnation identifiée ». **Interdites** : « clean », « aucun risque »,
  « rien à signaler » avec données insuffisantes.
- Règle : ne conserver dans le rapport que l'information **suffisamment attribuée**.

## Code — état actuel (`scripts/kyc_worker.py`)
- Schéma `adverse_media[]` (init l.189, normalisé l.1776-1812) :
  `category` {fiscal,civil,commercial,regulatory,criminal,reputational} ·
  `title` · `summary` · `date` · `jurisdiction` · `confidence` {high,medium,low} ·
  `status_type` {allegation,complaint,lawsuit,proceeding,judgment,conviction,
  administrative_action,media_report} · `source_url`.
- **Grounding strict** : `normalize_report` ne garde un item que si `source_url ∈
  allowed_urls` (l.1726-27 : `evidence_by_url` = URLs réellement collectées). L'acteur
  fournit ses PROPRES URLs (articles trouvés) → hors `allowed_urls`. Donc l'enrichissement
  doit se brancher **après** `normalize_report`, comme `enrich_company_profile`
  (l.2169/2229, hors du filtre allowed_urls), et attacher directement le `source_url` de l'acteur.
- Chemin prod = `deterministic_report` (l.1369, pas de LLM) → d'où `adverse_media` vide.
  Brancher après synthèse pour couvrir les deux chemins (comme l'outil #1).

## Acteur Apify — `regdata/adverse-media-screener` (vérifié live, métadonnées)
- Rôle : screening négative-news KYC/AML pour personnes/sociétés ; recherche web
  (Serper) + expansion de termes adverses + dédup + classifieur LLM (OpenRouter). 52 runs, actif.
- **Input** : `entityNames[]` (entités), `entityType` {auto,person,company}=auto,
  `aliases[]?`, `country?`, `categories[]?` (filtre), `minSeverity` {low,medium,high}=low,
  `maxHits`=25, `model`=deepseek/deepseek-chat, clés Serper/OpenRouter en override optionnel
  (sinon fournies par l'acteur → autonome, aucune clé côté Moana).
- **Output par hit** : provenance (source URL), date de publication, snippet, label de
  **risk-category** (financial crime, fraud, corruption/bribery, sanctions, money
  laundering, terrorism, organized crime, regulatory enforcement, litigation,
  environmental, other), score de **sévérité**, **entity-role** (perpetrator vs
  plaintiff/victim) ; par entité : risk level global + nombre de hits + catégories.
- **Coût** : PAY_PER_EVENT — start $0.01/GB (4 GB → ~$0.04) + **$0.10 par entité
  screenée** (tier FREE) → **~$0.14/lead**. Plus cher que l'enrichissement société.

## Mapping output → schéma report
- source URL → `source_url` (attaché tel quel, item hors filtre allowed_urls).
- date → `date` · snippet → `summary` · titre → `title` · pays → `jurisdiction`.
- risk-category → `category` (table : financial crime/fraud/money laundering/corruption →
  `criminal` ; sanctions/regulatory enforcement → `regulatory` ; litigation → `civil` ;
  environmental/other/reputational → `reputational` ; fiscal → `fiscal`).
- sévérité → `confidence` (high/medium/low).
- **entity-role** → filtre/framing : si le sujet est victime/plaignant, NE PAS le
  présenter comme mis en cause (anti-diffamation) → dropper ou reclasser prudemment.
- `status_type` déduit conservativement (par défaut `media_report`, `conviction`
  seulement si l'acteur le qualifie clairement).

## Contraintes / risques
- **Diffamation** : ne screener que si identité **confirmée/probable** (attribuable) —
  jamais un homonyme (comme la garde de l'outil #1). Respecter `minSeverity` pour le bruit.
- **Coût** : ~$0.14/lead → flag `APIFY_ADVERSE_MEDIA` **par défaut OFF** ; activation
  décidée par l'utilisateur (déjà une question de coût ouverte sur l'enrichissement société).
- Non-régression : ne pas casser le chemin déterministe ni les 35 tests existants.
