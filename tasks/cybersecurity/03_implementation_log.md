# 03 — Implementation log (CODE + TEST) : cybersecurity

## CODE — 2026-07-22

- `lib/security.ts` fournit scrypt pour les mots de passe, comparaison
  constante, signature HMAC et fenêtre anti-rejeu en mémoire.
- `lib/supabase/auth.ts` émet et valide un cookie de session HMAC signé,
  expirant, `httpOnly`, `sameSite=lax` et `secure` en production. Les mots de
  passe legacy valides sont migrés au prochain login ; aucun secret n'est
  logué.
- Les routes debug auth/env ont été supprimées. `/api/brokers` exige une
  session et ne provisionne plus de compte par effet de bord.
- Le webhook YATCO exige en production un secret HMAC configuré et vérifie le
  corps brut, la signature et le rejeu ; les réponses/logs ne révèlent plus le
  payload ou les credentials.
- Les scripts d'import/export ne stockent plus les exports broker dans le
  dépôt, hashent les mots de passe à l'import et refusent les mots de passe
  bootstrap implicites. Les scripts de test utilisent des variables
  d'environnement.
- Le script RLS historique qui ouvrait `brokers` à `anon` a été remplacé par
  une posture server-only ; le script de désactivation RLS refuse désormais
  l'opération.

## TEST

- `npm run type-check` : OK.
- `npm run lint` : OK selon l'agent cybersécurité.
- Test crypto scrypt valide/invalide : OK.
- `git diff --check` : OK.
- Vérification inline scrypt + HMAC (mot de passe valide/invalide, signature
  webhook valide) : OK.

## Configuration de déploiement requise

- Configurer `MOANA_SESSION_SECRET` (ou `SESSION_SECRET`) avec une valeur
  aléatoire forte, distincte par environnement.
- Configurer `YATCO_WEBHOOK_SECRET` (ou un nom de repli documenté) et régler
  le fournisseur webhook avec la même signature.
- Après rotation, invalider les anciennes sessions et credentials historiques.
- Vérifier le proxy de confiance pour `x-forwarded-for` et les règles réseau
  de la plateforme avant mise en production.
