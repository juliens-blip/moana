# 🔧 FIX LOGIN ISSUE - Guide Rapide

## Problème
Les RLS policies bloquent le login. Les utilisateurs anonymes ne peuvent pas lire la table `brokers` pour s'authentifier.

## Solution en 5 étapes (2 minutes)

### Étape 1 : Ouvrir Supabase Dashboard
🔗 **Lien direct :** https://supabase.com/dashboard/project/ewdgxylgzncvbaftbigs/editor

### Étape 2 : Aller dans SQL Editor
- Dans la barre de gauche, cliquez sur **"SQL Editor"**
- Ou utilisez ce lien direct : https://supabase.com/dashboard/project/ewdgxylgzncvbaftbigs/sql/new

### Étape 3 : Copier ce SQL

```sql
-- Désactiver RLS sur la table brokers (pour développement)
ALTER TABLE public.brokers DISABLE ROW LEVEL SECURITY;
```

### Étape 4 : Exécuter
- Collez le SQL dans l'éditeur
- Cliquez sur le bouton **"Run"** (ou appuyez sur Ctrl+Enter)
- Vous devriez voir : ✅ Success. No rows returned

### Étape 5 : Tester le login
- Retournez sur votre application : http://localhost:3000/login
- Connectez-vous avec :
  - **Username:** `Cedric`
  - **Password:** `cebich`

---

## Alternative : SQL complet avec policies (Production-ready)

Si vous voulez une solution plus sécurisée pour la production, utilisez ce SQL à la place :

```sql
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Brokers can view their own profile" ON public.brokers;

-- Allow anonymous users to read brokers (for login)
CREATE POLICY "Allow anonymous login queries"
ON public.brokers
FOR SELECT
TO anon
USING (true);

-- Allow authenticated users to view their own profile
CREATE POLICY "Authenticated brokers can view their own profile"
ON public.brokers
FOR SELECT
TO authenticated
USING (auth.uid()::text = id::text);
```

---

## Vérification

Pour vérifier que le fix est appliqué, exécutez dans le SQL Editor :

```sql
-- Vérifier si RLS est désactivé
SELECT relrowsecurity
FROM pg_class
WHERE relname = 'brokers';
-- Si résultat = false, RLS est désactivé ✅

-- Ou vérifier les policies
SELECT * FROM pg_policies WHERE tablename = 'brokers';
```

---

## ⚠️ Important

- **Option 1 (DISABLE RLS)** : Simple mais moins sécurisé. OK pour développement.
- **Option 2 (Policies)** : Plus sécurisé. Recommandé pour production.

Pour le développement, utilisez l'**Option 1** (plus rapide).

---

## Identifiants de test

Une fois le fix appliqué, utilisez :

| Username | Password |
|----------|----------|
| Cedric   | cebich   |
| PE       | pe       |
| Aldric   | changeme |
| Bart     | changeme |
| Charles  | changeme |

---

**🎉 C'est tout ! Le login devrait fonctionner après avoir exécuté le SQL.**
