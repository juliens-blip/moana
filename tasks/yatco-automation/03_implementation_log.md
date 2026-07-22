# 03 — Journal d'implémentation : yatco-automation

## CODE — 2026-07-22

- Paquet isolé `ops/yatco-automation/` avec image Playwright 1.55.1 et lockfile.
- Trois scrapers BOSS intégrés avec détection explicite de session expirée et
  refus des extractions vides.
- Orchestrateur séquentiel : visibilité + historique Stats, Market Review, puis
  Market Pulse. Chaque pipeline garde son propre statut et l'exécution globale
  retourne un code non nul si l'un d'eux échoue.
- Validateurs JSON avant chaque écriture Supabase et statut atomique
  `/data/status.json` sans secret.
- Les scripts de sync retournent désormais un code non nul lorsqu'une écriture
  ligne par ligne échoue.
- Lanceur Docker non-root, verrou `flock`, filesystem read-only, capabilities
  supprimées, `no-new-privileges`, limites CPU/RAM/PID et aucun port publié.
- Service systemd `oneshot` durci, timer de collecte monotone de 72 h et
  keepalive BOSS toutes les 4 h avec garde de renouvellement avant expiration.
- Extraction locale sur l'EC2 des seules variables Supabase nécessaires vers
  un fichier `600`. La session BOSS reste un mount secret distinct en lecture
  seule.

## TEST — agent test-code

- Validateurs Node : 6/6 tests verts.
- JavaScript et Python : syntaxe valide.
- Shell : `bash -n` vert.
- Unités : `systemd-analyze verify` vert ; seuls deux avertissements Ubuntu
  étrangers au projet (`xfs_scrub`) apparaissent.
- Sécurité systemd : score d'exposition amélioré de `6.4 MEDIUM` à `2.4 OK`.
- Dépendances : premier audit rouge (Playwright 1.55.0 + esbuild 0.28.0), boucle
  de correction appliquée ; audit final `0 vulnerabilities`.
- Application : lint vert, TypeScript vert, build Next.js production vert ;
  6/6 tests automation verts et `git diff --check` vert.
- Readiness Supabase depuis l'EC2 :
  `yatco_fleet_listings` 25 lignes, `yatco_listing_stats` 19,
  `yatco_market_pulse` 30, `yatco_market_review_snapshots` présent avec 0 ligne.
- Le garde-fou d'auth manquante retourne bien un échec avant lancement du
  conteneur. Le worker KYC et SearXNG restent actifs/sains.

## DEPLOY

- Image `moana-yatco-refresh:local` construite sur `51.44.220.145`.
- Code posé sous `/home/ubuntu/moana-yatco` sans mélanger le dépôt KYC.
- Environnement minimal : `/home/ubuntu/.config/moana-yatco/env` (`600`).
- Données : `/home/ubuntu/.local/share/moana-yatco` (`700`).
- Session BOSS renouvelée et copiée en mode `600` ; keepalive manuel vert.
- Premier run : Market Pulse vert (33 lignes), deux échecs correctement remontés
  puis corrigés par la boucle APEX (course Kendo et migration Market Review).
- Migration `market-review-schema.sql` appliquée par l'utilisateur ; snapshot
  mondial enregistré et readiness Supabase final 4/4.
- Run complet final : trois pipelines verts en 35 s, statut JSON `ok: true`.
- Retries du jour rendus idempotents : snapshot identique et 33 événements déjà
  présents ignorés sans erreur.
- Timers activés : keepalive 4 h et collecte 72 h. Prochain refresh observé le
  2026-07-25 à 18:25 UTC.
- Ancienne image Playwright 1.55.0 vulnérable et cache de build supprimés ;
  disque ramené de 82 % à 64 % sans toucher aux images KYC/SearXNG.

## Suivi opérationnel

Le premier renouvellement réellement glissant du cookie aura lieu après sa
demi-vie. Le keepalive échouera explicitement si BOSS ne prolonge pas une session
à moins de huit heures de l'expiration ; dans ce cas une nouvelle auth manuelle
sera nécessaire et visible dans journald.
