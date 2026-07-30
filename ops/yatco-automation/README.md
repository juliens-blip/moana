# YATCO automation

Conteneur `oneshot` pour rafraîchir YATCO Stats, Market Review et Market Pulse,
puis synchroniser les données vers Supabase. Il est lancé par systemd toutes les
48 heures et n'ouvre aucun port. Un second timer léger visite BOSS toutes les
4 heures et persiste l'expiration glissante du cookie, dont le TTL initial est
d'environ 24 heures.

## Fichiers runtime sur l'EC2

- code : `/home/ubuntu/moana-yatco`
- session BOSS : `/home/ubuntu/.config/moana-yatco/yatcoboss.json` (`600`)
- environnement Supabase minimal : `/home/ubuntu/.config/moana-yatco/env` (`600`)
- résultats et statut : `/home/ubuntu/.local/share/moana-yatco/`

Ne jamais committer ou afficher les deux fichiers de configuration.

## Installation et validation

Depuis `/home/ubuntu/moana-yatco` :

```bash
chmod 700 ops/yatco-automation/bin/*.sh ops/yatco-automation/bin/*.py
ops/yatco-automation/bin/install.sh
sudo systemctl start moana-yatco-refresh.service
systemctl status moana-yatco-refresh.service --no-pager
cat /home/ubuntu/.local/share/moana-yatco/status.json
```

Activer seulement après un run manuel vert :

```bash
sudo systemctl start moana-yatco-keepalive.service
sudo systemctl enable --now moana-yatco-keepalive.timer moana-yatco-refresh.timer
systemctl list-timers 'moana-yatco-*' --no-pager
```

Les logs sont consultables avec
`journalctl -u moana-yatco-refresh.service` et ne doivent jamais contenir de
secret. Une session BOSS expirée provoque un échec explicite avant tout sync.
