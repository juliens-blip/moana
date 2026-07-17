# Proxy Webshare pour l'adaptateur LinkedIn — journal de test

Objectif : vérifier si un proxy résidentiel (Webshare) routé depuis l'EC2 débloque le
scraping LinkedIn authentifié, qui renvoyait `HTTP 999` en accès direct (voir tests
Gaetano Nicolosi / Foulques de Raigniac dans [[01_analysis]] et `log.md`).

## Ce qui a été implémenté

- `scripts/linkedin_compat.py` : `parse_proxy()` convertit une URL
  `scheme://user:pass@host:port` en config proxy Playwright ; `scrape_profile`/
  `scrape_profiles` acceptent un paramètre `proxy`.
- `scripts/kyc_worker.py` : `Settings.linkedin_proxy_url`, lu depuis
  `KYC_LINKEDIN_PROXY_URL`, transmis à `scrape_profiles`. Statut visible (booléen
  seulement) via `kyc_worker.py check` → `linkedin_proxy_configured`.
- Deux bugs de déploiement préexistants corrigés à cette occasion :
  `Dockerfile.kyc` ne copiait jamais `scripts/linkedin_compat.py` dans l'image, et
  `.dockerignore` bloquait ce fichier même après correction du Dockerfile. Le
  module LinkedIn n'avait donc jamais tourné en prod avant ce test.
- Déployé via PR #6 et #7 (mergées dans `main`), image reconstruite sur l'EC2.

## Ce qui a été testé

1. **Discovery seule, requête "Nicolosi Trasporti" (nom d'entreprise)** — aucune
   URL LinkedIn trouvée par la recherche ; seule `nicolositrasporti.com` a été
   crawlée avec succès (4750 caractères). Le chemin LinkedIn/proxy n'a pas été
   sollicité.
2. **Discovery, requête "Gaetano Nicolosi" (le cas réel bloqué en HTTP 999)** —
   l'URL du profil LinkedIn est bien trouvée, mais l'adaptateur échoue
   immédiatement : `LinkedIn session file not found`. Cause : `KYC_LINKEDIN_SESSION_PATH`
   pointait vers un chemin jamais peuplé sur ce serveur ; Docker avait
   silencieusement créé un **dossier vide** au montage au lieu d'échouer.
   `check` rapportait `linkedin_session_configured: true` de façon trompeuse
   (il vérifie seulement que la variable n'est pas vide, pas que le fichier existe).
3. **Fix session** : dossier vide supprimé, session Playwright valide
   (cookie `li_at`, expire 2027-07-16) réinstallée sur le serveur avec les bons
   droits, conteneur recréé.
4. **Re-test avec session réelle + proxy actifs** — Playwright charge la session,
   navigue vers le profil : **`HTTP 999` persiste**. Le fallback public
   (`h2biz.net`, 2989 caractères) est conservé comme prévu par le design existant.
5. **Vérification indépendante du routage proxy** — un appel Playwright direct vers
   un service de vérification d'IP confirme que le trafic sort bien par l'IP du
   proxy Webshare, pas par celle de l'EC2. Le câblage proxy est donc correct de
   bout en bout ; le blocage LinkedIn ne vient pas (uniquement) de l'IP datacenter
   de l'EC2.

## Conclusion

Le proxy Webshare fonctionne techniquement mais ne suffit pas à débloquer
LinkedIn sur ce profil test. Causes probables non tranchées : IP du pool
Webshare elle-même déjà signalée, empreinte navigateur headless détectée
indépendamment de l'IP, ou session déjà marquée comme suspecte par LinkedIn.
Aucune tentative de contournement d'empreinte (spoofing navigateur, etc.) n'a
été faite — hors périmètre, rendement incertain, risque ToS accru.

## Décision

Abandon de la piste proxy self-hosted pour LinkedIn. Prochaine piste à évaluer :
**Apify** (service de scraping managé avec rotation d'IP et acteurs LinkedIn
prêts à l'emploi) à la place du couple Playwright + proxy maison.

Aucun identifiant (proxy, session) n'est stocké dans ce fichier ni dans le dépôt.

## Suite : migration vers Apify (même jour)

`scripts/linkedin_compat.py` (Playwright/session, bloqué HTTP 999), la
dépendance `linkedin-scraper`, le montage `secrets/linkedin-session.json` et
`KYC_LINKEDIN_PROXY_URL` sont retirés. Remplacés par
`scripts/apify_linkedin.py`, qui appelle l'actor Apify
`harvestapi/linkedin-profile-search-by-name` (recherche par prénom/nom, pas
besoin de découvrir l'URL du profil au préalable). Voir `wiki/KYC-OSINT.md`
section « LinkedIn via Apify » pour la configuration.

Testé en local (venv, hors EC2) sur le même cas Gaetano Nicolosi : l'actor
retrouve le bon profil (`gaetano-nicolosi-22211433`, Presidente chez Nicolosi
Trasporti, Catania) là où l'accès direct et le proxy Webshare échouaient tous
les deux. Coût mesuré : $0.004 par recherche en mode `Short` (jusqu'à 10
profils inclus dans ce prix). Pas encore déployé sur l'EC2 à ce stade.
