# 01 — Analyse EXPLORE : yatco-automation

## Objectif

Automatiser toutes les 72 heures les collectes nécessaires à YATCO Stats et
Market Trends, puis synchroniser les résultats vers Supabase sans modifier ni
interrompre le worker KYC existant.

## Contexte récupéré

- QMD : `qmd://memory/agentic-tunnel.md`,
  `qmd://moana-tasks/vessel-visibility-stats/*`,
  `qmd://moana-tasks/market-trends/*` et
  `qmd://memory/yatco-boss-scraping-quirks.md`.
- Graphify : la page `/dashboard/market-trends`, les lecteurs Supabase, les
  composants Recharts, l'API YATCO Stats et les contrats partagés sont câblés.
- Les scrapers Playwright standalone existent dans `D:\dev\scrape-mcp\scripts`.
  Ils n'ont pas besoin du serveur MCP pendant un rafraîchissement.

## État vérifié le 2026-07-22

- Application locale : lint et type-check verts.
- EC2 `moana-kyc-worker` accessible par clé, Docker 29 et Compose 5 présents ;
  Node absent de l'hôte, 6,1 Gio libres, worker KYC actif.
- Aucun timer YATCO existant. Le serveur n'écoute publiquement que sur SSH ; le
  security group limite le port 22 à une seule adresse IPv4 `/32`.
- Le cookie `BOSSAuthCookie` local a expiré le 2026-07-21. Un test réel du
  scraper échoue avant extraction : une réauthentification interactive est
  nécessaire avant le premier run fonctionnel.
- Une session renouvelée le 2026-07-22 a révélé un TTL d'environ 24 h : un
  keepalive distinct toutes les 4 h est nécessaire pour rendre le refresh 72 h
  réellement autonome et détecter une absence de renouvellement avant expiry.
- Les fichiers `.env.kyc` et `.env.kyc.save` sont en mode `600`. Le nouveau job
  ne doit recevoir que les deux variables Supabase dont il a besoin.

## Choix d'architecture

Un conteneur Playwright `oneshot` lancé par un timer systemd est retenu :

1. il évite d'installer Node et Chromium sur l'hôte ;
2. il isole le job du Compose KYC ;
3. il n'ouvre aucun port entrant ;
4. il permet des limites CPU/RAM/PID et un système de fichiers en lecture seule ;
5. il journalise chaque exécution dans journald et expose un statut JSON sans
   secret.

EventBridge/SSM n'est pas retenu pour cette première installation : l'instance
n'a ni profil IAM ni enregistrement SSM. Le timer local est suffisant pour une
EC2 toujours active et reste remplaçable ultérieurement.

## Sécurité et limites

- Session BOSS montée en lecture seule, jamais intégrée à l'image ni au dépôt.
- Secret Supabase dans un fichier hôte `600`, jamais transmis en argument ni
  écrit dans les logs.
- Conteneur non-root, capacités supprimées, `no-new-privileges`, filesystem
  read-only, volume de sortie dédié et aucune publication de port.
- Exécutions séquentielles pour respecter les 2 Gio de RAM de l'instance.
- Le cookie BOSS reste un secret à durée de vie limitée : l'expiration doit
  provoquer un échec visible, jamais une synchronisation de données vides.
- Références techniques vérifiées : documentation officielle Playwright Docker
  et unités `systemd.service` / `systemd.timer`.

## Critères de sortie

- Image reproductible et job manuel vert sur l'EC2.
- Les trois sorties sont validées avant toute écriture Supabase.
- Timer actif avec intervalle de 72 h et protection contre les chevauchements.
- Échec non silencieux si auth, scrape ou sync échoue.
- Worker KYC inchangé et toujours sain après installation.
