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
2. **Sinon, notabilité** — si aucune corroboration directe n'est disponible
   (contexte absent ou aucun candidat ne correspond), le profil est retenu
   uniquement si son poste indique :
   - un **rôle de direction** — CEO, fondateur, propriétaire, président,
     dirigeant, administrateur, investisseur, etc. (« personne importante »),
   - **ou** une activité dans le **milieu du yachting/maritime** — yacht,
     yachting, superyacht, charter, marina, maritime, naval, vessel.
3. **Sinon, rejet.** Aucun profil homonyme « anonyme » (ni corroboré, ni
   notable) n'est renvoyé, même si c'est le mieux classé par Apify.

Les deux listes de termes réutilisent exactement celles déjà utilisées dans
`scripts/kyc_worker.py::evidence_signals()` (signaux « profil économique
documenté » et « proximité yachting ») pour garder un seul vocabulaire dans
tout le pipeline KYC. Elles sont dupliquées dans `apify_linkedin.py` (pas
d'import croisé possible, `kyc_worker.py` important déjà ce module) — toute
modification doit être répercutée des deux côtés.

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
