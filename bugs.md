# Bugs

Format : `[YYYY-MM-DD] | Problème | Cause | Solution | #tags`

[2025-12-09] | Le filtre par nom de broker renvoyait une erreur 500 | Un nom était comparé à une colonne UUID | Résoudre le nom en UUID avant filtre, création ou mise à jour | #backend #database #bug #fix #done

[2026-01-06] | L’upload mobile ne déclenchait pas toujours le sélecteur ou la caméra | L’input fichier était masqué de façon inaccessible et mal réinitialisé | Utiliser un input accessible, valider le fichier et réinitialiser après succès | #frontend #bug #fix #done

[2026-01-29] | La création automatisée des brokers JMO et Marc a échoué | L’appel Supabase du script a retourné `fetch failed` | Rejouer le script idempotent avec connectivité et variables vérifiées | #backend #database #bug #blocked

[2026-07-15] | Les mots de passe brokers sont comparés et journalisés en clair | La migration a conservé une authentification provisoire sans hachage | Migrer vers bcrypt et supprimer toute journalisation de secrets | #backend #database #bug #todo

[2026-07-15] | Le cookie de session peut être forgé côté client | La session est un JSON non signé stocké directement dans un cookie | Utiliser une session serveur ou un jeton signé et valider l’identité à chaque requête | #backend #bug #todo

[2026-07-15] | Les routes `/api/debug/env` et `/api/debug/auth` exposent des informations sensibles | Des endpoints de diagnostic non protégés sont restés dans l’application | Les supprimer ou les restreindre strictement hors production | #backend #api #bug #todo

[2026-07-15] | Le KYC Vercel retournait une panne fournisseur et zéro source | DuckDuckGo servait une page anti-bot et Mojeek ne permet pas ce scraping automatisé | Prioriser Wikipedia OpenSearch et Google News RSS, filtrer le terme exact et sérialiser les requêtes | #backend #ai #bug #fix #done
