# 🚀 Setup Supabase - Table Leads CRM

## Étape 1: Exécuter les Schémas SQL

### 1.1 Vérifier que le schéma brokers existe

Aller dans **Supabase Dashboard** → **SQL Editor** → **New Query**

```sql
-- Vérifier si la table brokers existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'brokers';
```

**Si la table n'existe PAS**, exécuter d'abord:
```bash
cat scripts/schema.sql
```
Copier/coller le contenu dans le SQL Editor et exécuter.

### 1.2 Créer la table leads

**Fichier:** `scripts/leads-schema.sql`

```bash
cat scripts/leads-schema.sql
```

Copier/coller le contenu dans **Supabase SQL Editor** et **Run**.

---

## Étape 2: Vérifier les Variables d'Environnement

Le fichier `.env.local` doit contenir:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Pour le webhook Yatco (pas d'auth)
# Les IPs Yatco: 35.171.79.77, 52.2.114.120
```

**⚠️ Important:** Le `SUPABASE_SERVICE_ROLE_KEY` est nécessaire pour l'endpoint `/api/leads/yatco` qui reçoit les webhooks sans authentification.

---

## Étape 3: Tester la Connexion Supabase

Exécuter le script de test:

```bash
node test-brokers-supabase.js
```

Si erreur "No brokers found", insérer un broker de test:

```sql
-- Dans Supabase SQL Editor
INSERT INTO public.brokers (email, broker_name, password_hash)
VALUES (
  'test@moana.com',
  'Test Broker',
  '$2a$10$abcdefghijklmnopqrstuvwxyz123456' -- Hash bcrypt de "password123"
);
```

---

## Étape 4: Tester l'API Leads

### 4.1 Démarrer le serveur
```bash
npm run dev
```

### 4.2 Tester le webhook Yatco
```bash
node test-yatco-webhook.js
```

### 4.3 Vérifier dans Supabase Dashboard
**Table Editor** → **leads** → Voir les données

---

## Étape 5: Configurer les Policies RLS (Row Level Security)

Le schéma `leads-schema.sql` crée automatiquement les policies:

- ✅ **Brokers peuvent voir leurs propres leads** (`broker_id = auth.uid()`)
- ✅ **Webhook peut créer des leads** (anon + authenticated)
- ✅ **Brokers peuvent modifier leurs leads**

**Vérifier les policies:**
```sql
SELECT * FROM pg_policies WHERE tablename = 'leads';
```

---

## Étape 6: Vérifier la Vue `leads_with_broker`

```sql
SELECT * FROM public.leads_with_broker LIMIT 5;
```

Cette vue joint automatiquement les leads avec les infos broker.

---

## Troubleshooting

### Erreur: "relation public.leads does not exist"
→ Exécuter `scripts/leads-schema.sql` dans Supabase SQL Editor

### Erreur: "foreign key constraint broker_id"
→ La table `brokers` n'existe pas. Exécuter `scripts/schema.sql` d'abord.

### Erreur: "function update_updated_at_column() does not exist"
→ La fonction est définie dans `scripts/schema.sql`. L'exécuter en premier.

### Webhook retourne 401 Unauthorized
→ Vérifier que `SUPABASE_SERVICE_ROLE_KEY` est configuré dans `.env.local`

### Leads ne sont pas assignés au bon broker
→ Vérifier que `recipient.contactName` dans le payload Yatco correspond EXACTEMENT au `broker_name` en base.

---

## Commandes Utiles

```bash
# Voir les tables Supabase
psql $DATABASE_URL -c "\dt"

# Compter les leads
psql $DATABASE_URL -c "SELECT COUNT(*) FROM public.leads;"

# Voir les derniers leads
psql $DATABASE_URL -c "SELECT id, contact_display_name, status, received_at FROM public.leads ORDER BY received_at DESC LIMIT 10;"

# Stats par broker
psql $DATABASE_URL -c "SELECT * FROM public.leads_stats;"
```

---

## ✅ Checklist Finale

- [ ] Table `brokers` existe
- [ ] Table `leads` créée
- [ ] Vue `leads_with_broker` créée
- [ ] Vue `leads_stats` créée
- [ ] Policies RLS actives
- [ ] Variables `.env.local` configurées
- [ ] Test broker réussi (`test-brokers-supabase.js`)
- [ ] Test webhook réussi (`test-yatco-webhook.js`)
- [ ] Serveur Next.js démarre sans erreur
- [ ] Dashboard `/dashboard/leads` accessible

---

**Date:** 2026-01-19
**Par:** AMP Worker
**Status:** Guide Setup Complet
