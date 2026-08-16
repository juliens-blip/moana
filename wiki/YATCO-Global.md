# YATCO Global — pipeline de bout en bout

Pipeline OSINT de collecte et d'ingestion des annonces YATCO, distinct de la
webhook d'ingestion web décrite dans [[Architecture]]. Voir aussi [[state]]
Cycle 8 et [[journalbug]] pour l'état réel d'avancement.

## Collecte

Point d'entrée et source de vérité du flux de collecte : `scripts/yatco_collector.py:354` (`iter_pages`).
Le détail de l'implémentation n'est pas dupliqué ici ; se référer directement au script de collecte.

## Ingestion

Source de vérité de l'ingestion : `workers/yatco_ingest_worker.py:219` (`ingest_listings`).
L'ingestion s'exécute en chaîne sans dupliquer les écritures, retries ou paramètres dans le wiki.

## Timer systemd 24h

`workers/deploy/moana-yatco-ingest.timer` déclenche `moana-yatco-ingest.service` (cadence quotidienne). Le timer ne déclenche que l'ingestion ; celle-ci tire la collecte via sa propre dépendance `Requires=moana-yatco-collect.service`.

## Déploiement

Source de vérité du plan de déploiement figé : `workers/deploy/deploy.py:93` (`build_plan`), qui référence les artefacts, services et le timer. Aucune commande distante n'est recopiée ici.

- **dry-run (défaut)** : construit un plan déterministe, aucun accès réseau.
- **`--apply`** : synchronise les artefacts puis applique les commandes distantes.

**État réel (Cycle 8, [[state]])** : artefacts prêts localement, non commités, **rien n'est déployé sur EC2**. Le `.dockerignore` a été corrigé mais la validation `docker build` reste en attente — cf. [[journalbug]].

## Rollback

Absence de procédure de rollback automatisée confirmée dans `workers/deploy/deploy.py:93` (`build_plan`). Un rollback reste manuel : redéployer une version antérieure des artefacts via `workers/deploy/deploy.py --apply`, ou intervenir directement sur l'hôte distant.
