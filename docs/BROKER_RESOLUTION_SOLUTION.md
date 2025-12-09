# Solution Complète : Résolution des Brokers (Nom vs UUID)

## Contexte

L'application Moana utilise Supabase avec une table `brokers` qui contient :
- `id` (UUID) - Clé primaire
- `broker_name` (string) - Nom du broker (ex: "Charles")
- `email` (string)
- `password_hash` (string)

La table `listings` a une colonne `broker_id` (UUID) qui référence `brokers.id`.

## Problème Initial

Plusieurs endpoints utilisaient des noms de brokers ("Charles") alors que la base de données attend des UUIDs :

### 1. Filtre API - Erreur 500
```
GET /api/listings?broker=Charles
```
**Erreur** : Tentative de filtrer `broker_id` (UUID) avec "Charles" (string)

### 2. Création de Listing
```typescript
// Le formulaire n'envoie pas de broker
// L'API essayait d'utiliser session.broker (nom) au lieu de session.brokerId (UUID)
{
  broker: undefined  // ou session.broker = "Charles"
}
```

### 3. Modification de Listing
```typescript
// Même problème potentiel si on essaie de changer le broker
{
  broker: "Charles"  // string au lieu d'UUID
}
```

## Solution : Fonction de Résolution Universelle

### Implémentation (lib/supabase/listings.ts)

```typescript
/**
 * Resolve broker name to broker ID
 * Returns null if broker not found
 *
 * @param brokerNameOrId - Broker name (e.g., "Charles") or UUID
 * @returns UUID string or null
 */
async function resolveBrokerNameToId(brokerNameOrId: string): Promise<string | null> {
  const supabase = createAdminClient();

  // Check if it's already a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(brokerNameOrId)) {
    return brokerNameOrId;
  }

  // Otherwise, treat it as a broker name and look it up
  const { data, error } = await supabase
    .from('brokers')
    .select('id')
    .eq('broker_name', brokerNameOrId)
    .single();

  if (error || !data) {
    console.warn(`[resolveBrokerNameToId] Broker not found: ${brokerNameOrId}`);
    return null;
  }

  return data.id;
}
```

### Avantages

1. **Flexibilité** : Accepte les deux formats (nom et UUID)
2. **Performance** : Détection rapide des UUIDs (regex), pas de requête DB inutile
3. **Sécurité** : Validation stricte du format UUID
4. **Robustesse** : Gestion gracieuse des brokers inexistants
5. **Réutilisable** : Une seule fonction pour tous les cas d'usage

## Applications

### 1. Filtrage (getListings)

```typescript
export async function getListings(filters?: ListingFilters): Promise<Listing[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('listings')
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `)
    .order('nom_bateau', { ascending: true });

  // ... autres filtres ...

  if (filters?.broker) {
    // Resolve broker name to ID if needed
    const brokerId = await resolveBrokerNameToId(filters.broker);
    if (brokerId) {
      query = query.eq('broker_id', brokerId);
    } else {
      // If broker not found, return empty array
      console.warn(`[getListings] Broker not found: ${filters.broker}`);
      return [];
    }
  }

  // ... reste du code ...
}
```

**Résultat** :
- `/api/listings?broker=Charles` - Fonctionne !
- `/api/listings?broker=550e8400-e29b-41d4-a716-446655440000` - Fonctionne !
- `/api/listings?broker=NonExistent` - Retourne `[]` (au lieu de 500)

### 2. Création (createListing)

```typescript
export async function createListing(data: ListingInput): Promise<Listing> {
  const supabase = createAdminClient();

  // Resolve broker name/ID to ID if provided
  let brokerId: string | undefined = undefined;
  if (data.broker) {
    const resolved = await resolveBrokerNameToId(data.broker);
    if (!resolved) {
      throw new Error(`Broker not found: ${data.broker}`);
    }
    brokerId = resolved;
  }

  const { data: listing, error } = await supabase
    .from('listings')
    .insert({
      nom_bateau: data.nomBateau,
      constructeur: data.constructeur,
      longueur_m: data.longueur,
      annee: data.annee,
      proprietaire: data.proprietaire,
      capitaine: data.capitaine,
      broker_id: brokerId,  // UUID ou undefined
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
```

**Combiné avec** (app/api/listings/route.ts) :
```typescript
// All authenticated brokers can create listings for any broker
// If no broker specified, default to current user's brokerId
const data = {
  ...validation.data,
  broker: validation.data.broker || session.brokerId,  // UUID !
};
```

**Résultat** :
- Formulaire vide - Utilise le broker connecté (UUID)
- `broker: "Charles"` - Résout en UUID
- `broker: "550e8400-..."` - Utilise directement

### 3. Modification (updateListing)

```typescript
export async function updateListing(
  id: string,
  data: Partial<ListingInput>
): Promise<Listing> {
  const supabase = createAdminClient();

  const updates: Record<string, any> = {};

  // ... autres champs ...

  // Resolve broker name/ID to ID if provided
  if (data.broker !== undefined) {
    if (data.broker) {
      const brokerId = await resolveBrokerNameToId(data.broker);
      if (!brokerId) {
        throw new Error(`Broker not found: ${data.broker}`);
      }
      updates.broker_id = brokerId;
    } else {
      updates.broker_id = null;  // Suppression du broker
    }
  }

  // ... reste du code ...
}
```

**Résultat** :
- Modification avec nom - Fonctionne
- Modification avec UUID - Fonctionne
- Broker inexistant - Erreur explicite

## Cas d'Usage

### Scénario 1 : URL avec Nom de Broker
```
GET /api/listings?broker=Charles
```

**Flow** :
1. API route extrait `broker: "Charles"` des searchParams
2. `getListings({ broker: "Charles" })` appelé
3. `resolveBrokerNameToId("Charles")` appelé
4. Regex check - Pas un UUID
5. Requête DB - Trouve `{ id: "550e8400-..." }`
6. Filtre appliqué - `query.eq('broker_id', '550e8400-...')`
7. Résultat - Liste filtrée

### Scénario 2 : Création sans Broker
```typescript
// Formulaire soumis sans broker
const formData = {
  nomBateau: "Sunseeker 76",
  // ... autres champs ...
  broker: undefined
}
```

**Flow** :
1. API route reçoit data avec `broker: undefined`
2. Fallback : `broker = session.brokerId` (UUID)
3. `createListing({ ...data, broker: "550e8400-..." })` appelé
4. `resolveBrokerNameToId("550e8400-...")` appelé
5. Regex check - C'est un UUID !
6. Return immédiat - `"550e8400-..."`
7. Insert avec `broker_id: "550e8400-..."`

### Scénario 3 : Modification avec Nom
```typescript
// Formulaire de modification
const updateData = {
  nomBateau: "Nouveau nom",
  broker: "Marie"  // Changement de broker
}
```

**Flow** :
1. API route reçoit `broker: "Marie"`
2. `updateListing(id, { ...data, broker: "Marie" })` appelé
3. `resolveBrokerNameToId("Marie")` appelé
4. Regex check - Pas un UUID
5. Requête DB - Trouve `{ id: "660f9511-..." }`
6. Update avec `broker_id: "660f9511-..."`

### Scénario 4 : Broker Inexistant
```
GET /api/listings?broker=NonExistent
```

**Flow** :
1. API route extrait `broker: "NonExistent"`
2. `getListings({ broker: "NonExistent" })` appelé
3. `resolveBrokerNameToId("NonExistent")` appelé
4. Regex check - Pas un UUID
5. Requête DB - Aucun résultat
6. Return `null`
7. Log warning + return `[]`
8. Résultat - Tableau vide (pas d'erreur 500 !)

## Tests de Validation

### Test 1 : UUID Valide
```typescript
const result = await resolveBrokerNameToId('550e8400-e29b-41d4-a716-446655440000');
// Expected: '550e8400-e29b-41d4-a716-446655440000' (immédiat)
```

### Test 2 : Nom Existant
```typescript
const result = await resolveBrokerNameToId('Charles');
// Expected: UUID du broker Charles (après query DB)
```

### Test 3 : Nom Inexistant
```typescript
const result = await resolveBrokerNameToId('NonExistent');
// Expected: null (avec warning log)
```

### Test 4 : Cas Insensible (UUID)
```typescript
const result = await resolveBrokerNameToId('550E8400-E29B-41D4-A716-446655440000');
// Expected: UUID (regex case-insensitive)
```

## Améliorations Futures

### 1. Cache en Mémoire
```typescript
const brokerCache = new Map<string, string>();

async function resolveBrokerNameToId(brokerNameOrId: string): Promise<string | null> {
  // Check cache first
  if (brokerCache.has(brokerNameOrId)) {
    return brokerCache.get(brokerNameOrId)!;
  }

  // ... existing logic ...

  if (data?.id) {
    brokerCache.set(brokerNameOrId, data.id);
    return data.id;
  }

  return null;
}
```

### 2. Recherche Case-Insensitive
```typescript
const { data, error } = await supabase
  .from('brokers')
  .select('id')
  .ilike('broker_name', brokerNameOrId)  // Case-insensitive
  .single();
```

### 3. Support des Emails
```typescript
// Chercher par nom OU email
const { data, error } = await supabase
  .from('brokers')
  .select('id')
  .or(`broker_name.eq.${brokerNameOrId},email.eq.${brokerNameOrId}`)
  .single();
```

## Impact sur les Performances

- **UUID direct** : 0 requêtes DB (regex only) - ~0ms
- **Nom de broker** : 1 requête DB SELECT - ~10-50ms
- **Cache activé** : 0 requêtes après première résolution
- **Broker inexistant** : 1 requête DB (échec rapide) - ~10-30ms

## Sécurité

### Injection SQL - Protégé
Supabase utilise des requêtes paramétrées :
```typescript
.eq('broker_name', brokerNameOrId)  // Safe
```

### UUID Validation - Strict
Regex assure que seuls les UUIDs valides sont acceptés :
```typescript
/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
```

## Conclusion

Cette solution unique résout tous les problèmes liés au mélange nom/UUID :
- ✅ Erreur 500 sur filtrage - Corrigée
- ✅ Création sans broker - Corrigée
- ✅ Modification de broker - Corrigée
- ✅ API flexible - Accepte les deux formats
- ✅ Robustesse - Gestion des erreurs gracieuse
- ✅ Performance - Optimisée (UUID direct)
- ✅ Maintenabilité - Code centralisé

---

**Date** : 2025-12-09
**Auteur** : Claude Code
**Status** : ✅ Build successful
