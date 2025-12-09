# Fix: Erreur 500 sur le filtre broker

## Problème Identifié

L'URL `/api/listings?broker=Charles` provoquait une erreur 500 car :

1. **Ligne 30-32 de `lib/supabase/listings.ts`** : Le code essayait de filtrer par `broker_id` avec la valeur "Charles"
2. **Type incompatible** : "Charles" est un nom de broker (string), pas un UUID broker_id
3. **Supabase** : Ne pouvait pas matcher un UUID contre une string arbitraire

```typescript
// AVANT (INCORRECT)
if (filters?.broker) {
  query = query.eq('broker_id', filters.broker);  // "Charles" n'est pas un UUID !
}
```

## Solution Implémentée

### 1. Fonction de Résolution de Broker (lib/supabase/listings.ts)

Création d'une fonction `resolveBrokerNameToId()` qui :
- Détecte si la valeur est déjà un UUID (regex pattern)
- Si c'est un UUID, le retourne tel quel
- Sinon, fait une requête Supabase pour trouver le broker par nom
- Retourne l'ID correspondant ou null si non trouvé

```typescript
async function resolveBrokerNameToId(brokerNameOrId: string): Promise<string | null> {
  const supabase = createAdminClient();

  // Check if it's already a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(brokerNameOrId)) {
    return brokerNameOrId;
  }

  // Otherwise, look it up by name
  const { data, error } = await supabase
    .from('brokers')
    .select('id')
    .eq('broker_name', brokerNameOrId)
    .single();

  if (error || !data) {
    console.warn(`Broker not found: ${brokerNameOrId}`);
    return null;
  }

  return data.id;
}
```

### 2. Mise à Jour du Filtrage (getListings)

```typescript
// APRES (CORRECT)
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
```

### 3. Mise à Jour de la Création (createListing)

Correction pour s'assurer que le broker est résolu en ID avant insertion :

```typescript
// Resolve broker name/ID to ID if provided
let brokerId: string | undefined = undefined;
if (data.broker) {
  const resolved = await resolveBrokerNameToId(data.broker);
  if (!resolved) {
    throw new Error(`Broker not found: ${data.broker}`);
  }
  brokerId = resolved;
}
```

Bonus : Si aucun broker n'est fourni, l'API route utilise maintenant `session.brokerId` (UUID) au lieu de `session.broker` (nom).

### 4. Mise à Jour de la Modification (updateListing)

Même logique de résolution pour les mises à jour :

```typescript
// Resolve broker name/ID to ID if provided
if (data.broker !== undefined) {
  if (data.broker) {
    const brokerId = await resolveBrokerNameToId(data.broker);
    if (!brokerId) {
      throw new Error(`Broker not found: ${data.broker}`);
    }
    updates.broker_id = brokerId;
  } else {
    updates.broker_id = null;
  }
}
```

### 5. Documentation des Types

Mise à jour de `lib/types.ts` pour clarifier que le filtre broker accepte les deux formats :

```typescript
export interface ListingFilters {
  search?: string;           // Search in boat name and constructor
  broker?: string;           // Broker name or Broker ID (UUID) - will be resolved automatically
  localisation?: string;     // Free text localisation
  minLength?: number;        // Minimum length in meters
  maxLength?: number;        // Maximum length in meters
}
```

## Fichiers Modifiés

1. **lib/supabase/listings.ts**
   - Ajout de `resolveBrokerNameToId()`
   - Mise à jour de `getListings()`
   - Mise à jour de `createListing()`
   - Mise à jour de `updateListing()`

2. **lib/types.ts**
   - Documentation du champ `ListingFilters.broker`

3. **app/api/listings/route.ts**
   - Correction : utilise `session.brokerId` au lieu de `session.broker`

## Bénéfices

1. **Flexibilité** : L'API accepte maintenant les deux formats (nom ou UUID)
2. **Compatibilité** : Les URLs avec noms de brokers fonctionnent (`?broker=Charles`)
3. **Robustesse** : Si un broker n'existe pas, retourne une liste vide au lieu d'erreur 500
4. **Sécurité** : Validation stricte du format UUID
5. **Maintenance** : Code plus clair avec une fonction dédiée

## Tests Suggérés

1. **Filtre par nom** : `/api/listings?broker=Charles`
2. **Filtre par UUID** : `/api/listings?broker=550e8400-e29b-41d4-a716-446655440000`
3. **Broker inexistant** : `/api/listings?broker=NonExistent` (doit retourner `[]`)
4. **Création sans broker** : Le bateau doit être attribué au broker connecté
5. **Modification du broker** : Changer le broker d'un bateau existant

## Date de Résolution

2025-12-09
