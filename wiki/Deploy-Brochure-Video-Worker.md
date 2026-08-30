# Hook universel de déploiement du worker brochure vidéo

Le point d’entrée commun à Claude, Codex, Gemini ou tout autre agent est :

```bash
./scripts/deploy-brochure-video
```

Sans argument, la commande affiche uniquement le plan déterministe et ne fait
aucun accès réseau. Elle ne dépend d’aucun mécanisme de hook propre à un LLM.

## Commandes

```bash
# Plan local, sans réseau ni mutation
./scripts/deploy-brochure-video

# Préflight réel : identité AWS, instance épinglée, SSH, configuration et systemd
./scripts/deploy-brochure-video check

# Déploiement réel après les tests locaux ciblés
./scripts/deploy-brochure-video --apply
```

`--skip-tests` existe uniquement pour une urgence explicitement décidée par un
humain. Un agent ne doit pas l’utiliser de sa propre initiative.

## Cible immuable

Le hook refuse de continuer si l’une de ces valeurs ne correspond plus :

- compte AWS `958587270825` ;
- région `eu-west-3`, zone `eu-west-3a` ;
- instance `i-045f4cdf652b303fe` nommée `moana-brochure-video` ;
- IP publique `51.45.17.78` ;
- empreinte SSH Ed25519 épinglée dans le hook.

## Sécurité et reprise

- Aucun secret SSH persistant n’est lu ni stocké.
- Une clé Ed25519 temporaire est créée, autorisée pendant environ 60 secondes
  via EC2 Instance Connect, puis supprimée automatiquement.
- La liste des artefacts est figée dans le code : aucun glob ni fichier arbitraire.
- Le déploiement est refusé lorsqu’un job vidéo est actif.
- Un verrou distant empêche deux LLM de déployer simultanément.
- Les fichiers distants sont sauvegardés sous
  `/home/ubuntu/moana/deploy-backups/<deployment-id>/`.
- Une erreur d’installation ou de vérification restaure automatiquement la
  sauvegarde précédente.
- Le hook vérifie la compilation Python, les imports de production, le template
  systemd et l’égalité exacte entre les octets préparés et installés.

Le hook déploie le code Python et le template systemd du worker. Un changement
de dépendances système, de secrets, de bucket, d’IAM ou de configuration AWS
reste une opération d’infrastructure distincte et doit être annoncée comme telle.
