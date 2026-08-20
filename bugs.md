# Bugs

Format : `[YYYY-MM-DD] | Problème | Cause | Solution | #tags`

[2025-12-09] | Le filtre par nom de broker renvoyait une erreur 500 | Un nom était comparé à une colonne UUID | Résoudre le nom en UUID avant filtre, création ou mise à jour | #backend #database #bug #fix #done

[2026-01-06] | L’upload mobile ne déclenchait pas toujours le sélecteur ou la caméra | L’input fichier était masqué de façon inaccessible et mal réinitialisé | Utiliser un input accessible, valider le fichier et réinitialiser après succès | #frontend #bug #fix #done

[2026-01-29] | La création automatisée des brokers JMO et Marc a échoué | L’appel Supabase du script a retourné `fetch failed` | Rejouer le script idempotent avec connectivité et variables vérifiées | #backend #database #bug #blocked

[2026-07-15] | Les mots de passe brokers sont comparés et journalisés en clair | La migration a conservé une authentification provisoire sans hachage | Migrer vers bcrypt et supprimer toute journalisation de secrets | #backend #database #bug #todo

[2026-07-15] | Le cookie de session peut être forgé côté client | La session est un JSON non signé stocké directement dans un cookie | Utiliser une session serveur ou un jeton signé et valider l’identité à chaque requête | #backend #bug #todo

[2026-07-15] | Les routes `/api/debug/env` et `/api/debug/auth` exposent des informations sensibles | Des endpoints de diagnostic non protégés sont restés dans l’application | Les supprimer ou les restreindre strictement hors production | #backend #api #bug #todo

[2026-07-15] | Le KYC Vercel retournait une panne fournisseur et zéro source | DuckDuckGo servait une page anti-bot et Mojeek ne permet pas ce scraping automatisé | Prioriser Wikipedia OpenSearch et Google News RSS, filtrer le terme exact et sérialiser les requêtes | #backend #ai #bug #fix #done
[2026-07-16] | Le bouton KYC retournait HTTP 500 après le déploiement Crawl4AI | `VERCEL_URL` ciblait une URL de déploiement protégée qui renvoyait 401 avant la fonction Python | Appeler prioritairement l’alias Production et utiliser un jeton interne dans `X-Moana-KYC-Token` | #bug #fix #backend #infra #done

[2026-08-13] | Le serveur MCP `qmd` ne démarrait pas sous Linux | La commande utilisait la syntaxe Windows `cmd /c qmd mcp`, invalide sur ce poste | Appeler directement le binaire `qmd` dans `.mcp.json` | #infra #mcp #bug #fix #done

[2026-08-14] | Le build Docker des conteneurs `yatco-global` (collecteur + worker) échouait | `.dockerignore` racine (whitelist stricte) n'autorisait ni `workers/` ni `scripts/yatco_collector.py` | Négations `!workers/`, `!scripts/yatco_collector.py` ajoutées au `.dockerignore` ; les deux `docker build` validés verts le 2026-08-16 | #backend #infra #docker #bug #fix #done

[2026-08-17] | Le mode `check`/préflight de `deploy.py` (déploiement `yatco-global`) restait bloqué contre l'hôte distant | La variable d'environnement `MOANA_SSH_KEY` était absente du contexte local de session ; elle a été fournie et validée (2026-08-18) | `MOANA_SSH_KEY` fourni en environnement, préflight validé, déploiement complété et services vérifiés sur ubuntu@51.44.220.145 | #backend #infra #deploy #bug #fix #done

[2026-08-19] | `moana-yatco-ingest.service` échouait en production avec `ConfigurationError: Missing configuration: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY` | Le `.env` Docker Compose n'était jamais déployé vers l'hôte distant | `deploy.py` étendu (`load_env_value`/`write_env_file`) pour lire ces variables depuis `os.environ` et transférer un `.env` temporaire 0600 vers `workers/docker/.env` sans les journaliser ; vérification en production en attente (session Software Factory en cours) | #backend #infra #deploy #bug #todo

[2026-08-19] | Le health-check `deploy.py` déclarait `moana-yatco-ingest.service` (`Type=oneshot`) en échec malgré un run réussi | Sonde `ActiveEnterTimestamp`/`MainPID`, remis à vide dès qu'un oneshot termine, même en succès | `trigger_and_verify_unit` réécrit pour juger sur `InvocationID`/`ExecMainStartTimestamp` après `reset-failed`+`start` ; déploiement prod avec le fix non encore confirmé sur EC2, et 10 tests locaux désynchronisés (mocks sur les anciennes propriétés) | #backend #infra #deploy #bug #todo
