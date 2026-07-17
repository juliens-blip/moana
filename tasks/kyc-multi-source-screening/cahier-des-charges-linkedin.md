# Cahier des charges — sélection des profils LinkedIn (Apify)

Objectif : l'adaptateur `scripts/apify_linkedin.py` ne doit jamais attacher au
rapport KYC un profil LinkedIn qui n'est ni corroboré par le contexte de la
requête, ni notable en lui-même. Sur un nom courant, Apify renvoie plusieurs
homonymes (vérifié : "Gaetano Nicolosi" → 10 profils différents) ; un homonyme
non pertinent injecté comme preuve serait pire que l'absence de preuve.

## Règle de sélection

Un profil candidat est retenu si, dans cet ordre :

1. **Corroboration par le contexte de la requête** (déjà en place) : le texte
   du profil (poste + localisation) mentionne l'entreprise, le pays ou la
   ville fournis par la requête KYC.
2. **Sinon, classement par importance apparente** — si aucune corroboration
   directe n'est disponible (contexte absent ou aucun candidat ne
   correspond), les candidats restants sont classés par un score de
   séniorité du poste (3 niveaux : dirigeant/fondateur/président en haut,
   directeur/administrateur/associé au milieu, responsable/manager en bas)
   plus un bonus si le poste mentionne le milieu yachting/maritime. **Ce
   n'est pas une liste blanche stricte de « patrons » : n'importe quel poste
   qui a l'air senior peut l'emporter sur un poste junior** — un directeur,
   un associé ou un responsable compte, pas seulement le PDG/fondateur.
   Seuls les candidats avec un score > 0 sont conservés.
3. **Sinon, rejet.** Un profil homonyme sans aucun signal de séniorité ni de
   lien yachting n'est jamais renvoyé, même si c'est le mieux classé par
   Apify.

Le vocabulaire yachting réutilise exactement celui déjà utilisé dans
`scripts/kyc_worker.py::evidence_signals()` (signal « proximité yachting »)
pour garder un seul vocabulaire dans tout le pipeline KYC ; il est dupliqué
dans `apify_linkedin.py` (pas d'import croisé possible, `kyc_worker.py`
important déjà ce module) — toute modification doit être répercutée des deux
côtés. La grille de séniorité (3 niveaux) est propre à ce module.

## Hors périmètre (délibérément non traité)

- Signaux LinkedIn natifs (nombre d'abonnés, statut Premium/Influenceur) —
  non utilisés comme critère ; non fournis en mode `Short`, coût supplémentaire
  en mode `Full` pour un bénéfice incertain.
- Filtrage côté Apify (`currentJobTitles`, `locations` en entrée de l'actor) —
  non exploré, le format exact attendu par l'actor n'est pas vérifié ; le
  filtrage reste côté worker sur le texte renvoyé.
- Ce filtre ne s'applique qu'à l'adaptateur Apify. Les extraits de recherche
  SearXNG/Crawl4AI qui mentionnent une URL LinkedIn (`source_type=linkedin`)
  suivent un chemin différent et restent traités comme preuve faible par
  `deterministic_report()`, comme avant.

## Statut

Implémenté dans `scripts/apify_linkedin.py` (voir commit associé). Testé sur
le cas Gaetano Nicolosi : le président de Nicolosi Trasporti est retenu par
corroboration d'entreprise ; les homonymes sans lien (ingénieur à Milan, etc.)
sont rejetés.
