# Migration complète d'Airtable vers Supabase

Ce guide vous accompagne étape par étape pour migrer l'application Moana Yachting d'Airtable vers Supabase.

## Table des matières

1. [Préparation](#1-préparation)
2. [Création du projet Supabase](#2-création-du-projet-supabase)
3. [Export des données Airtable](#3-export-des-données-airtable)
4. [Création du schéma PostgreSQL](#4-création-du-schéma-postgresql)
5. [Import des données](#5-import-des-données)
6. [Configuration Row Level Security](#6-configuration-row-level-security)
7. [Migration du code](#7-migration-du-code)
8. [Tests et validation](#8-tests-et-validation)

---

## 1. Préparation

### 1.1 Créer un backup Airtable

**Action immédiate :**
1. Aller sur https://airtable.com/appNyZVynxa8shk4c
2. Cliquer sur "..." (menu) en haut à droite
3. Sélectionner "Download CSV"
4. Exporter les 2 tables :
   - `Listings` (tblxxQhUvQd2Haztz)
   - `Brokers` (tbl9dTwK6RfutmqVY)
5. Sauvegarder les CSV dans `c:\Users\beatr\Documents\projets\moana\backup\`

### 1.2 Installer les dépendances Supabase

```bash
npm install @supabase/supabase-js @supabase/ssr
npm install --save-dev supabase
```

---

## 2. Création du projet Supabase

### 2.1 Créer un compte Supabase

1. Aller sur https://supabase.com
2. Cliquer sur "Start your project"
3. Se connecter avec GitHub (recommandé)

### 2.2 Créer un nouveau projet

1. Cliquer sur "New Project"
2. Remplir les informations :
   - **Name:** `moana-yachting`
   - **Database Password:** Générer un mot de passe fort (NOTER LE QUELQUE PART)
   - **Region:** Europe (Frankfurt ou London recommandé)
   - **Pricing Plan:** Free (pour commencer)
3. Cliquer sur "Create new project"
4. Attendre ~2 minutes que le projet soit créé

### 2.3 Récupérer les credentials

Une fois le projet créé :
1. Aller dans **Settings** > **API**
2. Noter les informations suivantes :
   - **Project URL** (ex: `https://xxxxx.supabase.co`)
   - **anon public key** (commence par `eyJhbG...`)
   - **service_role key** (commence par `eyJhbG...`) - GARDER SECRET

---

## 3. Export des données Airtable

### 3.1 Script d'export automatique

Créer le fichier `scripts/export-airtable-data.ts` :

```typescript
import Airtable from 'airtable';
import fs from 'fs';
import path from 'path';

// Configuration
const config = {
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseId: 'appNyZVynxa8shk4c',
  listingsTableId: 'tblxxQhUvQd2Haztz',
  brokerTableId: 'tbl9dTwK6RfutmqVY',
};

Airtable.configure({ apiKey: config.apiKey });
const base = Airtable.base(config.baseId);

async function exportTable(tableId: string, filename: string) {
  const records: any[] = [];

  await base(tableId)
    .select()
    .eachPage((pageRecords, fetchNextPage) => {
      pageRecords.forEach((record) => {
        records.push({
          id: record.id,
          fields: record.fields,
          createdTime: record._rawJson.createdTime,
        });
      });
      fetchNextPage();
    });

  const outputPath = path.join(__dirname, '..', 'backup', filename);
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
  console.log(`✅ Exported ${records.length} records to ${filename}`);
}

async function main() {
  // Créer le dossier backup
  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('🚀 Starting Airtable export...');

  await exportTable(config.listingsTableId, 'listings.json');
  await exportTable(config.brokerTableId, 'brokers.json');

  console.log('✅ Export complete!');
}

main().catch(console.error);
```

### 3.2 Exécuter l'export

```bash
npx tsx scripts/export-airtable-data.ts
```

Vous aurez maintenant :
- `backup/listings.json` (~tous vos bateaux)
- `backup/brokers.json` (~tous vos brokers)

---

## 4. Création du schéma PostgreSQL

### 4.1 Créer la table `brokers`

1. Aller dans **SQL Editor** dans Supabase Dashboard
2. Cliquer sur "New query"
3. Copier-coller ce SQL :

```sql
-- Table brokers
CREATE TABLE IF NOT EXISTS public.brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  broker_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_brokers_email ON public.brokers(email);
CREATE INDEX IF NOT EXISTS idx_brokers_broker_name ON public.brokers(broker_name);

-- Trigger pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_brokers_updated_at
  BEFORE UPDATE ON public.brokers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Commentaires
COMMENT ON TABLE public.brokers IS 'Table des brokers (anciennement dans Airtable)';
COMMENT ON COLUMN public.brokers.broker_name IS 'Nom du broker (username pour login)';
```

4. Cliquer sur "Run" (ou F5)

### 4.2 Créer la table `listings`

```sql
-- Table listings
CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom_bateau TEXT NOT NULL,
  constructeur TEXT NOT NULL,
  longueur_m DECIMAL(10,2) NOT NULL,
  annee INTEGER NOT NULL,
  proprietaire TEXT NOT NULL,
  capitaine TEXT NOT NULL,
  broker_id UUID REFERENCES public.brokers(id) ON DELETE CASCADE,
  localisation TEXT NOT NULL,
  prix_actuel TEXT,
  prix_precedent TEXT,
  dernier_message TEXT,
  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  airtable_id TEXT UNIQUE -- Pour tracking migration
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_listings_broker_id ON public.listings(broker_id);
CREATE INDEX IF NOT EXISTS idx_listings_nom_bateau ON public.listings(nom_bateau);
CREATE INDEX IF NOT EXISTS idx_listings_constructeur ON public.listings(constructeur);
CREATE INDEX IF NOT EXISTS idx_listings_localisation ON public.listings(localisation);
CREATE INDEX IF NOT EXISTS idx_listings_longueur ON public.listings(longueur_m);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings(created_at DESC);

-- Trigger pour updated_at
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Contraintes de validation
ALTER TABLE public.listings
  ADD CONSTRAINT check_longueur_positive CHECK (longueur_m > 0),
  ADD CONSTRAINT check_annee_valid CHECK (annee >= 1900 AND annee <= EXTRACT(YEAR FROM CURRENT_DATE) + 2);

-- Commentaires
COMMENT ON TABLE public.listings IS 'Table des bateaux (anciennement dans Airtable)';
COMMENT ON COLUMN public.listings.longueur_m IS 'Longueur en mètres/pieds';
COMMENT ON COLUMN public.listings.prix_actuel IS 'Prix formaté avec devise (ex: "1,850,000 €")';
COMMENT ON COLUMN public.listings.airtable_id IS 'ID Airtable original (pour référence)';
```

### 4.3 Créer une vue pour les listings avec broker info

```sql
-- Vue pour joindre listings + broker info
CREATE OR REPLACE VIEW public.listings_with_broker AS
SELECT
  l.*,
  b.broker_name,
  b.email as broker_email
FROM public.listings l
LEFT JOIN public.brokers b ON l.broker_id = b.id;

COMMENT ON VIEW public.listings_with_broker IS 'Vue combinant listings et infos broker';
```

---

## 5. Import des données

### 5.1 Script d'import automatique

Créer le fichier `scripts/import-to-supabase.ts` :

```typescript
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ADMIN KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AirtableBroker {
  id: string;
  fields: {
    broker: string;
    password: string;
    'Date de création'?: string;
  };
  createdTime: string;
}

interface AirtableListing {
  id: string;
  fields: {
    'Nom du Bateau': string;
    'Constructeur': string;
    'Longueur (M/pieds)': number;
    'Année': number;
    'Propriétaire': string;
    'Capitaine': string;
    'Broker': string;
    'Localisation': string;
    'Prix Actuel (€/$)'?: string;
    'Prix Précédent (€/$)'?: string;
    'Dernier message'?: string;
    'Commentaire'?: string;
  };
  createdTime: string;
}

async function importBrokers() {
  console.log('📥 Importing brokers...');

  const brokersPath = path.join(__dirname, '..', 'backup', 'brokers.json');
  const brokersData: AirtableBroker[] = JSON.parse(fs.readFileSync(brokersPath, 'utf-8'));

  const brokerMap = new Map<string, string>(); // airtable broker name -> supabase uuid

  for (const broker of brokersData) {
    const { data, error } = await supabase
      .from('brokers')
      .insert({
        email: `${broker.fields.broker}@moana-yachting.com`,
        broker_name: broker.fields.broker,
        password_hash: broker.fields.password, // TODO: hash if not already
        created_at: broker.createdTime,
      })
      .select('id, broker_name')
      .single();

    if (error) {
      console.error(`❌ Error importing broker ${broker.fields.broker}:`, error);
    } else {
      brokerMap.set(broker.fields.broker, data.id);
      console.log(`✅ Imported broker: ${broker.fields.broker}`);
    }
  }

  return brokerMap;
}

async function importListings(brokerMap: Map<string, string>) {
  console.log('📥 Importing listings...');

  const listingsPath = path.join(__dirname, '..', 'backup', 'listings.json');
  const listingsData: AirtableListing[] = JSON.parse(fs.readFileSync(listingsPath, 'utf-8'));

  let successCount = 0;
  let errorCount = 0;

  for (const listing of listingsData) {
    const brokerId = brokerMap.get(listing.fields.Broker);

    if (!brokerId) {
      console.warn(`⚠️ Broker not found for listing: ${listing.fields['Nom du Bateau']}`);
      errorCount++;
      continue;
    }

    const { error } = await supabase.from('listings').insert({
      nom_bateau: listing.fields['Nom du Bateau'],
      constructeur: listing.fields['Constructeur'],
      longueur_m: listing.fields['Longueur (M/pieds)'],
      annee: listing.fields['Année'],
      proprietaire: listing.fields['Propriétaire'],
      capitaine: listing.fields['Capitaine'],
      broker_id: brokerId,
      localisation: listing.fields['Localisation'],
      prix_actuel: listing.fields['Prix Actuel (€/$)'],
      prix_precedent: listing.fields['Prix Précédent (€/$)'],
      dernier_message: listing.fields['Dernier message'],
      commentaire: listing.fields['Commentaire'],
      created_at: listing.createdTime,
      airtable_id: listing.id,
    });

    if (error) {
      console.error(`❌ Error importing listing ${listing.fields['Nom du Bateau']}:`, error);
      errorCount++;
    } else {
      successCount++;
      console.log(`✅ Imported listing: ${listing.fields['Nom du Bateau']}`);
    }
  }

  console.log(`\n📊 Summary: ${successCount} success, ${errorCount} errors`);
}

async function main() {
  console.log('🚀 Starting Supabase import...\n');

  const brokerMap = await importBrokers();
  console.log('\n');
  await importListings(brokerMap);

  console.log('\n✅ Import complete!');
}

main().catch(console.error);
```

### 5.2 Mettre à jour `.env.local`

Ajouter les credentials Supabase :

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Garder Airtable pour le moment (backup)
AIRTABLE_API_KEY=...
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
```

### 5.3 Exécuter l'import

```bash
npx tsx scripts/import-to-supabase.ts
```

**Vérification :**
1. Aller dans Supabase Dashboard > Table Editor
2. Vérifier que les tables `brokers` et `listings` contiennent vos données

---

## 6. Configuration Row Level Security (RLS)

### 6.1 Activer RLS

```sql
-- Activer RLS sur les tables
ALTER TABLE public.brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
```

### 6.2 Policies pour `brokers`

```sql
-- Les brokers peuvent lire leur propre profil
CREATE POLICY "Brokers can view their own profile"
ON public.brokers
FOR SELECT
TO authenticated
USING (auth.uid()::text = id::text);

-- Les brokers peuvent mettre à jour leur propre profil
CREATE POLICY "Brokers can update their own profile"
ON public.brokers
FOR UPDATE
TO authenticated
USING (auth.uid()::text = id::text)
WITH CHECK (auth.uid()::text = id::text);
```

### 6.3 Policies pour `listings`

```sql
-- Tous les brokers authentifiés peuvent lire tous les listings
CREATE POLICY "Authenticated users can view all listings"
ON public.listings
FOR SELECT
TO authenticated
USING (true);

-- Les brokers peuvent créer des listings
CREATE POLICY "Authenticated users can create listings"
ON public.listings
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Les brokers peuvent modifier leurs propres listings
CREATE POLICY "Brokers can update their own listings"
ON public.listings
FOR UPDATE
TO authenticated
USING (broker_id = auth.uid())
WITH CHECK (broker_id = auth.uid());

-- Les brokers peuvent supprimer leurs propres listings
CREATE POLICY "Brokers can delete their own listings"
ON public.listings
FOR DELETE
TO authenticated
USING (broker_id = auth.uid());
```

### 6.4 Policy pour la vue

```sql
-- Accès en lecture sur la vue
CREATE POLICY "Authenticated users can view listings with broker"
ON public.listings_with_broker
FOR SELECT
TO authenticated
USING (true);
```

---

## 7. Migration du code

### 7.1 Créer le client Supabase

Créer `lib/supabase/client.ts` :

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Créer `lib/supabase/server.ts` :

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component - ignore
          }
        },
      },
    }
  );
}
```

### 7.2 Migrer `lib/types.ts`

```typescript
// Nouveau types Supabase
export interface Broker {
  id: string;
  email: string;
  broker_name: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  nom_bateau: string;
  constructeur: string;
  longueur_m: number;
  annee: number;
  proprietaire: string;
  capitaine: string;
  broker_id: string;
  localisation: string;
  prix_actuel?: string;
  prix_precedent?: string;
  dernier_message?: string;
  commentaire?: string;
  created_at: string;
  updated_at: string;
  airtable_id?: string;
}

export interface ListingWithBroker extends Listing {
  broker_name: string;
  broker_email: string;
}

// Garder les types de formulaires
export interface ListingFormData {
  nomBateau: string;
  constructeur: string;
  longueur: number;
  annee: number;
  proprietaire: string;
  capitaine: string;
  broker: string; // broker_id
  localisation: string;
  prix?: string;
  prixPrecedent?: string;
  dernierMessage?: string;
  commentaire?: string;
}

export interface ListingFilters {
  search?: string;
  broker?: string;
  localisation?: string;
  minLength?: number;
  maxLength?: number;
}
```

### 7.3 Créer `lib/supabase/listings.ts`

```typescript
import { createClient } from './server';
import type { Listing, ListingFilters } from '@/lib/types';
import type { ListingInput } from '@/lib/validations';

export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  const supabase = await createClient();

  let query = supabase
    .from('listings')
    .select('*')
    .order('nom_bateau', { ascending: true });

  // Appliquer les filtres
  if (filters?.search) {
    query = query.or(`nom_bateau.ilike.%${filters.search}%,constructeur.ilike.%${filters.search}%`);
  }

  if (filters?.broker) {
    query = query.eq('broker_id', filters.broker);
  }

  if (filters?.localisation) {
    query = query.ilike('localisation', `%${filters.localisation}%`);
  }

  if (filters?.minLength) {
    query = query.gte('longueur_m', filters.minLength);
  }

  if (filters?.maxLength) {
    query = query.lte('longueur_m', filters.maxLength);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getListings] Error:', error);
    throw new Error(`Failed to fetch listings: ${error.message}`);
  }

  return data || [];
}

export async function getListing(id: string): Promise<Listing | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('listings')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('[getListing] Error:', error);
    return null;
  }

  return data;
}

export async function createListing(data: ListingInput): Promise<Listing> {
  const supabase = await createClient();

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      nom_bateau: data.nomBateau,
      constructeur: data.constructeur,
      longueur_m: data.longueur,
      annee: data.annee,
      proprietaire: data.proprietaire,
      capitaine: data.capitaine,
      broker_id: data.broker,
      localisation: data.localisation,
      prix_actuel: data.prix,
      prix_precedent: data.prixPrecedent,
      dernier_message: data.dernierMessage,
      commentaire: data.commentaire,
    })
    .select()
    .single();

  if (error) {
    console.error('[createListing] Error:', error);
    throw new Error(`Failed to create listing: ${error.message}`);
  }

  return listing;
}

export async function updateListing(
  id: string,
  data: Partial<ListingInput>
): Promise<Listing> {
  const supabase = await createClient();

  const updates: Record<string, any> = {};

  if (data.nomBateau !== undefined) updates.nom_bateau = data.nomBateau;
  if (data.constructeur !== undefined) updates.constructeur = data.constructeur;
  if (data.longueur !== undefined) updates.longueur_m = data.longueur;
  if (data.annee !== undefined) updates.annee = data.annee;
  if (data.proprietaire !== undefined) updates.proprietaire = data.proprietaire;
  if (data.capitaine !== undefined) updates.capitaine = data.capitaine;
  if (data.broker !== undefined) updates.broker_id = data.broker;
  if (data.localisation !== undefined) updates.localisation = data.localisation;
  if (data.prix !== undefined) updates.prix_actuel = data.prix;
  if (data.prixPrecedent !== undefined) updates.prix_precedent = data.prixPrecedent;
  if (data.dernierMessage !== undefined) updates.dernier_message = data.dernierMessage;
  if (data.commentaire !== undefined) updates.commentaire = data.commentaire;

  const { data: listing, error } = await supabase
    .from('listings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[updateListing] Error:', error);
    throw new Error(`Failed to update listing: ${error.message}`);
  }

  return listing;
}

export async function deleteListing(id: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('listings')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[deleteListing] Error:', error);
    throw new Error(`Failed to delete listing: ${error.message}`);
  }
}

export async function getLocalisations(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('listings')
    .select('localisation')
    .not('localisation', 'is', null);

  if (error) {
    console.error('[getLocalisations] Error:', error);
    return [];
  }

  const localisations = Array.from(
    new Set(data.map((item) => item.localisation).filter(Boolean))
  ).sort();

  return localisations;
}
```

### 7.4 Migrer l'authentification avec Supabase Auth

Créer `lib/supabase/auth.ts` :

```typescript
import { createClient } from './server';

export async function login(brokerName: string, password: string) {
  const supabase = await createClient();

  // Récupérer le broker par broker_name
  const { data: broker, error: brokerError } = await supabase
    .from('brokers')
    .select('*')
    .eq('broker_name', brokerName)
    .single();

  if (brokerError || !broker) {
    return { error: 'Identifiants invalides' };
  }

  // Vérifier le mot de passe (à améliorer avec bcrypt)
  if (broker.password_hash !== password) {
    return { error: 'Identifiants invalides' };
  }

  // Créer une session Supabase Auth personnalisée
  // Option 1: Utiliser signInWithPassword si vous avez configuré Auth
  // Option 2: Créer un JWT personnalisé

  return {
    success: true,
    broker: {
      id: broker.id,
      broker_name: broker.broker_name,
      email: broker.email,
    }
  };
}

export async function getSession() {
  const supabase = await createClient();

  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    return null;
  }

  return session;
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
```

### 7.5 Mettre à jour les API routes

Remplacer dans `app/api/listings/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getListings, createListing } from '@/lib/supabase/listings';
import { listingSchema } from '@/lib/validations';
import type { ApiResponse, ListingFilters } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filters: ListingFilters = {
      search: searchParams.get('search') || undefined,
      broker: searchParams.get('broker') || undefined,
      localisation: searchParams.get('localisation') || undefined,
      minLength: searchParams.get('minLength')
        ? parseFloat(searchParams.get('minLength')!)
        : undefined,
      maxLength: searchParams.get('maxLength')
        ? parseFloat(searchParams.get('maxLength')!)
        : undefined,
    };

    const listings = await getListings(filters);

    return NextResponse.json<ApiResponse>({
      success: true,
      data: listings,
    });
  } catch (error: any) {
    console.error('Error in GET /api/listings:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = listingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: 'Données invalides', data: validation.error.errors },
        { status: 400 }
      );
    }

    const listing = await createListing(validation.data);

    return NextResponse.json<ApiResponse>(
      { success: true, data: listing, message: 'Bateau créé avec succès' },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/listings:', error);
    return NextResponse.json<ApiResponse>(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

---

## 8. Tests et validation

### 8.1 Vérifier la compilation TypeScript

```bash
npm run type-check
```

### 8.2 Tester l'authentification

1. Démarrer le serveur : `npm run dev`
2. Aller sur http://localhost:3000/login
3. Se connecter avec un broker existant
4. Vérifier la redirection vers le dashboard

### 8.3 Tester le CRUD listings

1. **Create**: Créer un nouveau bateau
2. **Read**: Voir la liste des bateaux
3. **Update**: Modifier un bateau
4. **Delete**: Supprimer un bateau
5. **Filters**: Tester les filtres (recherche, broker, localisation, longueur)

### 8.4 Vérifier les performances

Comparer les temps de réponse :
- Airtable: ~300-500ms par requête
- Supabase: ~50-100ms par requête (beaucoup plus rapide!)

### 8.5 Tester le real-time (bonus)

Si vous voulez du real-time, ajouter dans un composant :

```typescript
useEffect(() => {
  const supabase = createClient();

  const channel = supabase
    .channel('listings_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'listings' },
      (payload) => {
        console.log('Change received!', payload);
        // Rafraîchir les données
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

---

## 9. Nettoyage final

### 9.1 Supprimer les fichiers Airtable

Une fois que tout fonctionne bien :

```bash
# Supprimer les anciens fichiers
rm -rf lib/airtable
```

### 9.2 Nettoyer package.json

Retirer la dépendance Airtable :

```bash
npm uninstall airtable
```

### 9.3 Mettre à jour CLAUDE.md

Remplacer toutes les références Airtable par Supabase.

---

## Sources & Ressources

### Documentation officielle
- [Build a User Management App with Next.js | Supabase Docs](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- [Use Supabase Auth with Next.js | Supabase Docs](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Setting up Server-Side Auth for Next.js | Supabase Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Import data into Supabase | Supabase Docs](https://supabase.com/docs/guides/database/import-data)

### Guides communautaires
- [How to Set Up Supabase Auth in Next.js (2025 Guide) | Zestminds](https://www.zestminds.com/blog/supabase-auth-nextjs-setup-guide/)
- [Supabase and Next.js 14 - Authentication and Protected Routes](https://ekremsonmezer.substack.com/p/supabase-and-nextjs-14-authentication)
- [Easy Row Level Security (RLS) Policies in Supabase and Postgres](https://maxlynch.com/2023/11/04/tips-for-row-level-security-rls-in-postgres-and-supabase/)
- [How to integrate Airtable and Supabase | Whalesync](https://www.whalesync.com/blog/how-to-connect-airtable-and-supabase)

---

## Support

Si vous rencontrez des problèmes :
1. Vérifier les logs Supabase Dashboard > Logs
2. Vérifier les credentials dans `.env.local`
3. Vérifier que RLS est bien configuré
4. Consulter la documentation Supabase

Bonne migration ! 🚀
