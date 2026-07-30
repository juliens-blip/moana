# 02 — Plan APEX : yatco-automation

## Périmètre

Créer un paquet de déploiement isolé dans `ops/yatco-automation/`, réutilisant
les scrapers et scripts de synchronisation déjà validés. Ne pas modifier le
Compose KYC ni injecter de secret dans Git ou dans l'image.

## Étapes CODE

1. Ajouter un paquet Node minimal et une image Playwright épinglée à la version
   utilisée par les scrapers.
2. Copier les trois scrapers standalone dans le paquet opérationnel et retirer
   les hypothèses incompatibles avec un conteneur non-root.
3. Ajouter un orchestrateur séquentiel :
   - Vessel Statistics → visibilité flotte → historique YATCO Stats ;
   - Market Review → snapshot mondial ;
   - Market Pulse → événements nécessaires à la tendance récente.
4. Valider chaque JSON avant son script de synchronisation ; une extraction
   vide ou incomplète doit stopper le pipeline concerné.
5. Écrire un statut final sans secret et retourner un code non nul dès qu'un
   pipeline échoue.
6. Ajouter un lanceur Docker verrouillé par `flock`, avec limites de ressources,
   mounts minimaux et nettoyage des anciens artefacts.
7. Ajouter les unités systemd `oneshot` et timer monotone de 72 h.
8. Ajouter un script d'installation distant idempotent qui prépare les dossiers,
   extrait uniquement les variables Supabase requises et pose les droits `600`.
9. Ajouter un keepalive BOSS toutes les 4 h, sans secret Supabase, qui valide et
   remplace atomiquement le storage state sous verrou partagé.

## Étapes TEST — agent test-code, sans modification

1. Tests Node des validateurs et de la gestion d'échec de l'orchestrateur.
2. `bash -n` sur les scripts shell et `systemd-analyze verify` sur les unités.
3. `npm run lint`, `npm run type-check`, `npm run build` pour l'application.
4. Construction de l'image sur l'EC2 et contrôle non-root/read-only.
5. Run fonctionnel des trois pipelines avec nouvelle session BOSS.
6. Vérifier les tables Supabase, le statut JSON, les logs journald et le code de
   sortie du service.
7. Vérifier que le worker KYC reste `Up` et que le timer annonce le prochain run.

## Boucle bugs

Tout échec détecté pendant TEST est ajouté à `journalbug.md`, analysé, corrigé
hors phase test, puis tous les contrôles concernés sont rejoués.

## Déploiement

- Code : `/home/ubuntu/moana-yatco`
- Secrets : `/home/ubuntu/.config/moana-yatco/` (`600`)
- Données/statut : `/home/ubuntu/.local/share/moana-yatco/`
- Image : `moana-yatco-refresh:local`
- Unités : `moana-yatco-refresh.service` et `.timer`

Le premier lancement manuel précède l'activation du timer. Le timer n'est
considéré opérationnel qu'après un run live entièrement vert.
