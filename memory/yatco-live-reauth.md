# Décision persistante — YATCO Global live

- Le flux YATCO Global est live depuis AWS via `scrape-mcp`; les annonces ne
  sont pas stockées en base, seuls les favoris Supabase le sont.
- La session BOSS est renouvelée par `/home/ubuntu/scrape-mcp/yatco-relogin.sh`,
  déclenché par le cron horaire.
- Le script lit les identifiants depuis le `.env` AWS, exécute
  `scripts/auto-login-yatco.mjs`, écrit `auth/yatcoboss.json`, puis redémarre
  `scrape-mcp`.
- L’intervalle doit rester inférieur à l’expiration du cookie : il est fixé à
  20 heures (ancien réglage 27 h causait une fenêtre sans session).
- En cas de flux vide, vérifier dans cet ordre : page `Login - BOSS`, date du
  cookie, `relogin.log`, `.last-relogin`, puis relancer le script officiel.
- Ne jamais écrire d’identifiants, cookies ou tokens dans cette mémoire.
