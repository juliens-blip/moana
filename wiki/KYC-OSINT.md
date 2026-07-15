# KYC / OSINT yacht

#kyc #ai #concept

## Mission

À partir d’un nom et d’un email, produire un dossier KYC/OSINT international factuel, prudent, vérifiable et commercialement exploitable pour le yacht brokerage, le charter, la vente de yachts et l’onboarding high-ticket.

Profils visés : acheteurs, charterers haut de gamme, UBO/représentants, brokers partenaires, sociétés intermédiaires et SPV.

Le résultat aide une décision humaine. Ce n’est ni un avis juridique, ni un avis de conformité définitif.

## Règles absolues

- Zéro hallucination, remplissage ou supposition présentée comme un fait.
- Zéro fusion d’homonymes sans plusieurs attributs convergents.
- Relier chaque information à une source identifiable ou à un faisceau d’indices cohérent.
- Marquer une identité douteuse `non confirmé`.
- Omettre une donnée absente ou trop faible; écrire `non trouvé` seulement si utile.
- Ne jamais conclure pénalement ou réputationnellement sans source explicite.
- Distinguer allégation, plainte, procédure, jugement, condamnation et article de presse.
- Une absence de hit signifie seulement : « aucun résultat exact trouvé sur les listes consultées ».
- Ne jamais transformer un litige civil, une question politique ou une allégation en condamnation.
- Utiliser uniquement des informations publiques pertinentes et minimiser les données personnelles collectées.

## Entrées

Requises :

- `full_name`
- `email`

Optionnelles : `company_name`, `country`, `phone`, `city`, `yacht_name`, `website`.

## Résolution d’identité

1. Chercher le nom exact et ses variantes.
2. Exploiter le domaine email : site, entreprise, contacts et pattern d’adresses.
3. Résoudre d’abord la personne.
4. Si la personne est peu documentée, basculer vers l’entreprise liée.
5. Comparer les homonymes par email, ville, poste, entreprise, secteur, pays, site, photo et presse.
6. Ne fusionner que si plusieurs attributs convergent.
7. Ne pas utiliser un profil social isolé comme preuve finale.
8. Si le lien personne–entreprise reste faible, ne pas le créer artificiellement.
9. Si personne et entreprise restent non résolues, rendre un dossier minimal et silencieux.

Signaux d’attribution :

- Forts : email correspondant, domaine entreprise, poste, ville, site officiel, registre, communiqué nominatif.
- Moyens : LinkedIn cohérent, presse sectorielle, photo, même secteur.
- Faibles : simple nom identique sur un réseau social.

Un homonyme PEP/sanctions n’est jamais confirmé sans date de naissance, pays, fonction ou autre attribut fort.

## Ordre de recherche

### A. Personne et présence professionnelle

Extraire seulement si confirmé : nom et variantes, poste, employeur, localisation/pays, secteur, courte biographie, email professionnel, domaine/site, téléphone public, photo de désambiguïsation, LinkedIn, page équipe, registre professionnel, communiqués, conférences et presse sectorielle.

### B. Entreprise / KYB

Chercher : raison sociale, forme et statut juridiques, juridiction, numéro d’immatriculation, VAT/TVA, REA/SIREN/company number, création, siège, activité et code NACE/ATECO/SIC, dirigeants, représentants, actionnaires, UBO, filiales, sociétés liées, anciens noms, LEI, site, taille et chiffres publics sourcés.

Si la personne est peu visible mais le domaine email identifie clairement une entreprise documentée, centrer le dossier sur l’entreprise.

### C. Sanctions, PEP et watchlists

Consulter les listes officielles pertinentes, PEP, wanted lists et leaks publics disponibles. Pour chaque correspondance potentielle, vérifier nom, alias, pays, date de naissance, fonction et entreprise liée.

Classer une correspondance insuffisante comme `possible_homonym`, jamais comme hit confirmé.

### D. Adverse media

Rechercher seulement les éléments publics significatifs : litiges civils/commerciaux, faillites, défauts fiscaux, sanctions administratives, fraude/corruption/blanchiment allégués, condamnations, saisies, conflits d’actionnaires, enquêtes réglementaires et presse locale/sectorielle.

Catégories : `fiscal`, `civil`, `commercial`, `regulatory`, `criminal`, `reputational`.

Confiance :

- `high` : autorité, registre, jugement ou source officielle.
- `medium` : plusieurs médias crédibles.
- `low` : source secondaire unique ou attribution incertaine; exclure du rapport principal si trop faible.

### E. Maritime / yachting

Activer seulement avec un lien crédible vers un yacht, navire, SPV, gestionnaire ou activité charter. Chercher : nom et ancien nom, IMO, MMSI, HIN public, pavillon, owner enregistré, beneficial owner/SPV, gestionnaire commercial, ISM/DOC manager, constructeur, année, classe, assureur public, broker/central agent et historique AIS public pertinent.

Sans identifiant navire fiable : `non_determinable`. Ne jamais extrapoler une propriété.

### F. Indicateurs de cohérence économique

Chercher : rôle dirigeant, acquisitions, transactions, presse business, taille de groupe, levées, exits, patrimoine explicitement documenté, boards, prises de parole et activité économique substantielle.

Ces éléments sont seulement des indicateurs de cohérence économique; ils ne prouvent pas la source des fonds.

## Minimum utile

- Personne : nom, poste, entreprise, localisation, LinkedIn/autres URL fiables, confiance d’identité.
- Entreprise : raison sociale, juridiction, immatriculation, statut, activité, siège, dirigeants, UBO/LEI et finances si trouvés.
- Risque : sanctions/PEP/watchlists, adverse media sourcée, maritime et cohérence économique.
- Sources : URL directe, type et note courte.

## Contrat de sortie

Retourner exactement cette structure. Les champs sans donnée robuste restent vides ou en statut insuffisant; ne jamais les compléter par hypothèse.

```json
{
  "query_input": {
    "full_name": "",
    "email": "",
    "company_name": "",
    "country": "",
    "city": ""
  },
  "identity_resolution": {
    "status": "confirmed | probable | ambiguous | unresolved",
    "confidence_score": 0,
    "matched_persons": [
      {
        "name": "",
        "headline": "",
        "location": "",
        "company": "",
        "evidence": [""]
      }
    ],
    "selected_profile_rationale": ""
  },
  "person_profile": {
    "full_name": "",
    "aliases": [],
    "current_title": "",
    "current_company": "",
    "location": "",
    "country": "",
    "emails": [],
    "phones": [],
    "websites": [],
    "profiles": {
      "linkedin": "",
      "company_profile": "",
      "other": []
    }
  },
  "company_profile": {
    "company_name": "",
    "legal_form": "",
    "status": "",
    "jurisdiction": "",
    "registration_number": "",
    "vat_number": "",
    "lei": "",
    "incorporation_date": "",
    "address": "",
    "industry": "",
    "directors": [],
    "shareholders": [],
    "ubo": [],
    "subsidiaries": [],
    "financials": {
      "revenue": "",
      "net_income": "",
      "employees": "",
      "share_capital": "",
      "currency": "",
      "year": ""
    },
    "website": ""
  },
  "risk_screening": {
    "sanctions": {
      "status": "clear | possible_homonym | hit | not_enough_data",
      "details": []
    },
    "pep": {
      "status": "clear | possible_homonym | hit | not_enough_data",
      "details": []
    },
    "watchlists": {
      "status": "clear | possible_homonym | hit | not_enough_data",
      "details": []
    },
    "offshore_leaks": {
      "status": "clear | possible_homonym | hit | not_enough_data",
      "details": []
    }
  },
  "adverse_media": [
    {
      "category": "fiscal | civil | commercial | regulatory | criminal | reputational",
      "title": "",
      "summary": "",
      "date": "",
      "jurisdiction": "",
      "confidence": "high | medium | low",
      "status_type": "allegation | complaint | lawsuit | proceeding | judgment | conviction | administrative_action | media_report",
      "source_url": ""
    }
  ],
  "maritime_screening": {
    "status": "none_found | possible_link | confirmed_link | non_determinable",
    "assets": [
      {
        "vessel_name": "",
        "imo": "",
        "mmsi": "",
        "flag": "",
        "registered_owner": "",
        "beneficial_owner": "",
        "manager": "",
        "builder": "",
        "year_built": "",
        "source_url": ""
      }
    ]
  },
  "economic_coherence": {
    "level": "low | medium | high | undetermined",
    "indicators": [""]
  },
  "kyc_assessment": {
    "overall_risk": "low | medium | high | undetermined",
    "recommended_review": "standard | enhanced_due_diligence | manual_review | insufficient_data",
    "key_reasons": [""],
    "missing_critical_items": [""]
  },
  "sources": [
    {
      "type": "official_registry | company_website | linkedin | sanctions_db | pep_db | news | court_record | maritime_db | other",
      "url": "",
      "note": ""
    }
  ]
}
```

## Évaluation du risque

- `low` : identité assez claire, activité cohérente, aucun hit sanctions/PEP confirmé, aucune adverse media significative trouvée dans les sources consultées.
- `medium` : identité probable mais incomplète, adverse media notable non pénalisante, lacunes UBO, homonymes non levés ou source of wealth non démontrée.
- `high` : hit sanctions/PEP confirmé, condamnation grave, fraude/corruption/blanchiment solidement sourcé, structure opaque avec plusieurs red flags ou incohérences majeures.
- `undetermined` : données insuffisantes.

Un score ou niveau de risque doit être expliqué par des `key_reasons` sourcées. Il ne déclenche jamais seul une acceptation ou un refus.

## Politique de silence et style

- Écrire sec, court, factuel, sans storytelling, morale ou commentaire inutile.
- Ne conserver dans le rapport principal que les informations suffisamment attribuées.
- Si les données sont faibles : `identity_resolution = unresolved | ambiguous`, `recommended_review = insufficient_data`, dossier minimal.
- Formulations permises : « Homonyme PEP possible, non confirmé », « Volet maritime non déterminable faute d’identifiants navire », « Contentieux civil rapporté; aucune condamnation identifiée dans les sources consultées ».
- Formulations interdites : « clean », « aucun risque », « sûrement la même personne », « possède probablement », « pas de problème AML », « rien à signaler » avec données insuffisantes.

## Priorité métier yacht

Examiner en priorité la capacité économique apparente, les structures de détention, l’UBO, les sanctions/PEP, l’adverse media, les SPV/navires et la cohérence personne–société–transaction. Ne jamais confondre capacité apparente et preuve de source des fonds.

## Intégration CRM Supabase — état actif

Flux cible :

```text
Nouvelle demande CRM → résolution KYC/OSINT si données suffisantes
                     → rapport JSON sourcé
                     → stockage Supabase
                     → revue humaine
```

Avant le code, décider :

- table dédiée ou colonnes reliées au lead;
- statut d’exécution et gestion d’un enrichissement impossible;
- version du schéma, horodatage, sources et date de dernière vérification;
- séparation entre données brutes transitoires et rapport minimal conservé;
- règles d’accès, journal d’audit, durée de conservation et suppression;
- échec KYC isolé : le lead reste créé même si la collecte échoue;
- relance manuelle et comportement en cas de source indisponible;
- validation humaine obligatoire avant toute décision commerciale ou conformité.

Le backend Vercel traite une collecte courte dans l’invocation de création. Le rapport complet reste côté serveur; la fiche CRM reçoit uniquement un résumé prudent.

### Modèle SQL préparé

Script : `scripts/kyc-enrichment-schema.sql`.

- `lead_kyc_reports` conserve chaque tentative et son rapport JSON versionné.
- Le trigger `enqueue_kyc_after_lead_insert` crée une tentative après chaque insertion dans `leads`.
- Sans nom ou email, la tentative passe directement à `insufficient_data` sans spéculation.
- `lead_kyc_latest` expose au backend le dernier contrôle et ses statuts utiles au CRM.
- `anon` et `authenticated` n’ont aucun accès direct; seul le backend `service_role` lit et écrit.
- Le trigger SQL ne crawle rien; le backend Vercel ou le worker Python doit réclamer les lignes `pending`.

### Backend Vercel actif — sans LLM

Fichiers principaux : `lib/kyc/deterministic.ts`, `lib/supabase/kyc.ts`, `/api/leads/[id]/kyc` et `components/leads/LeadDetailModal.tsx`.

- Chaque création manuelle ou Boats Group lance une collecte publique courte après insertion du lead.
- La recherche essaie le nom contextualisé, le nom exact, puis l’email; Wikipedia OpenSearch et Google News RSS sont prioritaires, DuckDuckGo HTML/Lite reste un repli sans garantie.
- Une indisponibilité du moteur est distinguée d’une recherche valide sans source.
- L’échec de collecte ne supprime pas le lead et reste visible comme échec technique.
- Sans registre officiel intégré, sanctions/PEP restent `not_enough_data` et le risque `undetermined`.
- La fiche CRM affiche statut, résolution d’identité, niveau de risque, nombre de sources et raisons clés.
- Le bouton « Revérifier » crée une tentative versionnée et relance le traitement.
- Aucun fournisseur LLM, clé LLM ou serveur permanent n’est requis.

### Worker Python optionnel

Fichiers : `scripts/kyc_worker.py`, `scripts/requirements-kyc.txt`, `tests/test_kyc_worker.py`.

Configuration requise, sans valeur dans le dépôt :

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `KYC_LLM_MODEL` au format accepté par LiteLLM
- clé du fournisseur LLM, ou `KYC_LLM_API_KEY`
- optionnel : `KYC_LLM_BASE_URL` pour un modèle local/compatible

Commandes :

```powershell
rtk py -3.11 scripts/kyc_worker.py check
rtk py -3.11 scripts/kyc_worker.py once
rtk py -3.11 scripts/kyc_worker.py watch
```

Test sans Supabase ni LLM :

```powershell
rtk py -3.11 scripts/kyc_worker.py dry-run `
  --name "Example Domain" --email "info@example.com" --discover-only
```

Garde-fous : exécution non automatique, claim conditionnel anti-concurrence, `robots.txt`, crawl borné, refus des hôtes privés, JavaScript et téléchargements désactivés, sources non crawlées supprimées, absence de résultat sanctions/PEP jamais traduite en `clear`, erreurs sans secrets. Ce worker avancé exige un fournisseur LLM explicitement approuvé; il n’est pas nécessaire au flux Vercel actif.
