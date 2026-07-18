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

## Limite connue, acceptée telle quelle

Testé en conditions réelles sur un vrai lead (Nicolas Pelisson, Founder & CEO
de Marinescence Recruitment — agence de recrutement pour l'industrie du
yachting) : le texte LinkedIn extrait par Apify est fidèle
(`"Founder & CEO I MARINESCENCE RECRUITMENT I ..."`), mais aucun mot-clé
`YACHTING_TERMS` littéral n'y apparaît (« Marinescence » n'est pas un terme
générique), donc le signal « proximité yachting » ne se déclenche pas et le
résumé exécutif dit « aucun lien yachting confirmé » — alors que l'entreprise
en est bien une. Un correctif simple (ajouter « marine » à la liste) a été
écarté : le texte comparé inclut le nom de la personne, et « Marine » est un
prénom français courant, ce qui ferait remonter à tort des homonymes sans
rapport. Décision (2026-07-17) : ne pas corriger — comportement conservateur
volontaire, cohérent avec la consigne anti-hallucination du reste du pipeline
KYC (mieux vaut « non confirmé » qu'un faux positif).

## Prénom/nom inversés à la source (corrigé)

Sur un vrai lead Boats Group/YATCO (David Paturel), le `raw_payload` du
webhook contenait déjà `contact.name = {first: "Paturel", last: "David"}` —
inversé depuis la source, avant tout code Moana. Conséquence : la recherche
Apify avec `firstName="Paturel", lastName="David"` ne trouvait rien, et pas
seulement sur LinkedIn — la découverte SearXNG/Crawl4AI échouait aussi
(`"Paturel David"` en requête entre guillemets ne matche aucune page
mentionnant "David Paturel"). `search_profiles` réessaie maintenant une fois
avec les deux jetons du nom inversés si la première tentative ne renvoie
aucun candidat retenu. Ça ne résout pas l'ambiguïté d'homonyme en absence de
contexte (pays/entreprise) — juste le cas « zéro résultat » dû à l'ordre.

## Enrichissement mode Full (about + localisation précise)

Le mode `Short` (recherche large, peu coûteuse) ne renvoie ni bio ni
localisation précise. Une fois le(s) candidat(s) final(aux) sélectionné(s)
(corroboration ou importance), un second appel Apify cible le même nom en
mode `Full` et, si la même `linkedinUrl` réapparaît, remplace le texte par la
version enrichie (`about`, poste(s) actuel(s) détaillé(s), localisation
`parsed.text` — ville/pays précis plutôt qu'une zone LinkedIn vague). Testé
sur Daniel Weitmann : récupère le texte "about" complet (positionnement
Golden Suisse) et « Zürich, Switzerland » au lieu d'une zone approximative.
Coût : un appel Full supplémentaire (jusqu'à 10 profils, ~$0.04 au pire) par
candidat réellement retenu — pas sur tout le pool de recherche.

## Résumé exécutif allégé et enrichi (localisation + about)

Deux retours utilisateur sur des leads réels (Daniel Weitmann, Gaetano
Nicolosi) : (1) la ligne de routine « Sanctions et PEP non conclusifs sur les
sources intégrées. Niveau de risque : indéterminé ; revue manuelle et preuve
de fonds à demander avant signature du MYBA. » n'apportait rien tant que rien
n'était détecté — supprimée. Une ligne d'alerte est conservée uniquement si le
screening interne (`sanctions_db`/`pep_db`) trouve une correspondance
(`hit` → alerte forte, `possible_homonym` → alerte prudente) : ce n'est pas
une régression de conformité, juste le retrait du bruit routinier. (2) la
localisation LinkedIn (`Location:` extrait par `_profile_text()`) et un
extrait du "about" (jusqu'à 220 caractères, tronqué avec « … ») sont
maintenant ajoutés à la ligne d'activité du résumé exécutif via
`linkedin_field()`/`linkedin_location()` dans `kyc_worker.py`, plutôt que
d'être disponibles uniquement dans le texte de preuve brut. Les deux ajouts
restent dans la même ligne que l'activité professionnelle pour ne pas pousser
la ligne d'alerte sanctions/PEP hors des 4 lignes affichées par le CRM
(`executiveSummary.slice(0, 4)` dans `LeadDetailModal.tsx`). Testé en
conditions réelles sur Daniel Weitmann (about + "Executive Chairman" bien
extraits) et Gaetano Nicolosi (localisation "Catania, Italy" bien extraite).

## Collision d'URL LinkedIn par sous-domaine pays

Régression observée sur Gaetano Nicolosi : localisation et "about" absents du
résumé alors qu'Apify avait bien enrichi le profil. Cause : `canonical_url()`
ne normalisait pas les sous-domaines pays de LinkedIn. Apify renvoie
`www.linkedin.com/in/...`, mais SearXNG/Crawl4AI découvre indépendamment le
même profil sous `it.linkedin.com/in/...` (snippet nu « Nom - Titre |
LinkedIn »). Sans normalisation, les deux documents de preuve ne fusionnaient
pas et le snippet faible gagnait la sélection. Corrigé : pour les chemins
`/in/`, tout sous-domaine `*.linkedin.com` est ramené à `www.linkedin.com`
(les chemins `/company/` ne sont pas touchés). Le document Apify riche
l'emporte alors sur le snippet.

## Résumé exécutif en template structuré (Métier / Entreprise / Rôle / Localisation)

Demande utilisateur : remplacer la prose « Un profil portant ce nom indique :
… » par un template à champs distincts. `_profile_text()` émet désormais, à
partir de `currentPosition[0]`, des lignes préfixées `Métier:` (titre, repli
sur le headline en mode Short), `Entreprise:` (companyName) et `Missions:`
(description de poste, souvent nulle chez Apify). `build_executive_summary()`
les relit via `linkedin_metier()`/`linkedin_company()`/`linkedin_missions()`
et construit les lignes : **Métier**, **Entreprise**, **Rôle et missions
majeures** (description de poste si présente, sinon extrait du "about" comme
approximation, 280 car. max), **Localisation**. Le champ « Rôle et missions »
est le moins fiable : la description de poste LinkedIn est fréquemment absente.

Garde-fou conservé : ces champs restent surmontés de la ligne d'attribution
(`identity_line`). Quand l'identité est ambiguë (homonyme non exclu), ils
décrivent un profil candidat, pas un fait confirmé sur le lead — supprimer ce
préambule reviendrait à présenter un homonyme possible comme le client, ce que
toute la logique de prudence du KYC interdit. Le cap d'affichage passe de 4 à 8
lignes (`normalize_report` côté worker et `executiveSummary.slice(0, 8)` dans
`LeadDetailModal.tsx`) pour loger identité + 4 champs + pertinence + alerte
éventuelle.
