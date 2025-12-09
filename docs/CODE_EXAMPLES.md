# Exemples de Code - Gestion des Champs Airtable

## Table des Matières
1. [Utilisation de cleanListingFields()](#utilisation-de-cleanlistingfields)
2. [Patterns de Validation](#patterns-de-validation)
3. [Gestion d'Erreurs](#gestion-derreurs)
4. [Tests Unitaires](#tests-unitaires)
5. [Exemples Complets](#exemples-complets)

## Utilisation de cleanListingFields()

### Exemple 1: Création d'un Listing avec Champs Optionnels

```typescript
import { cleanListingFields } from '@/lib/utils';
import { listingsTable } from '@/lib/airtable/client';

async function createBoatListing(formData: FormData) {
  // 1. Préparer les données brutes (potentiellement avec des champs vides)
  const rawFields = {
    'Nom du Bateau': formData.get('nomBateau') as string,
    'Constructeur': formData.get('constructeur') as string,
    'Longueur (M/pieds)': parseFloat(formData.get('longueur') as string),
    'Année': parseInt(formData.get('annee') as string),
    'Propriétaire': formData.get('proprietaire') as string,
    'Capitaine': formData.get('capitaine') as string,
    'Broker': formData.get('broker') as string,
    'Localisation': formData.get('localisation') as string,
    'Prix Actuel (€/$)': formData.get('prix') as string || '',  // Peut être vide
    'Prix Précédent (€/$)': formData.get('prixPrecedent') as string || '',
    'Dernier message': formData.get('dernierMessage') as string || '',
    'Commentaire': formData.get('commentaire') as string || '',
  };

  // 2. Nettoyer les champs (supprimer les valeurs vides)
  const cleanedFields = cleanListingFields(rawFields);

  // 3. Envoyer à Airtable (uniquement les champs valides)
  const record = await listingsTable.create(cleanedFields);

  return record;
}
```

### Exemple 2: Mise à Jour Partielle

```typescript
async function updateBoatPrice(listingId: string, newPrice: string | undefined) {
  const rawUpdates = {
    'Prix Actuel (€/$)': newPrice,
  };

  // Si newPrice est undefined ou '', il sera filtré
  const cleanedUpdates = cleanListingFields(rawUpdates);

  // Si cleanedUpdates est vide {}, aucune mise à jour n'est effectuée
  if (Object.keys(cleanedUpdates).length === 0) {
    console.log('Aucune mise à jour nécessaire');
    return null;
  }

  const record = await listingsTable.update(listingId, cleanedUpdates);
  return record;
}
```

### Exemple 3: Batch Update avec Validation

```typescript
async function batchUpdateLocations(updates: Array<{ id: string; location: string }>) {
  const results = [];

  for (const update of updates) {
    const rawFields = {
      'Localisation': update.location,
    };

    const cleanedFields = cleanListingFields(rawFields);

    if (Object.keys(cleanedFields).length > 0) {
      const record = await listingsTable.update(update.id, cleanedFields);
      results.push({ id: update.id, success: true, record });
    } else {
      results.push({ id: update.id, success: false, error: 'No valid data' });
    }
  }

  return results;
}
```

## Patterns de Validation

### Pattern 1: Validation Frontend + Backend + Airtable

**Frontend (React Hook Form + Zod)**:
```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema } from '@/lib/validations';

function ListingForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(listingSchema),
  });

  const onSubmit = async (data) => {
    // data est déjà validé par Zod
    const response = await fetch('/api/listings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('nomBateau')} />
      {errors.nomBateau && <span>{errors.nomBateau.message}</span>}
    </form>
  );
}
```

**Backend (API Route)**:
```typescript
import { listingSchema } from '@/lib/validations';
import { createListing } from '@/lib/airtable/listings';

export async function POST(request: Request) {
  const body = await request.json();

  // Validation serveur
  const validation = listingSchema.safeParse(body);
  if (!validation.success) {
    return Response.json({ error: 'Invalid data' }, { status: 400 });
  }

  // Création avec nettoyage automatique
  const listing = await createListing(validation.data);
  return Response.json({ success: true, data: listing });
}
```

**Airtable Layer**:
```typescript
import { cleanListingFields } from '@/lib/utils';

export async function createListing(data: ListingInput) {
  const rawFields = {
    'Nom du Bateau': data.nomBateau,
    // ...
  };

  // Nettoyage final avant envoi
  const fields = cleanListingFields(rawFields);
  const record = await listingsTable.create(fields);
  return record;
}
```

### Pattern 2: Validation Conditionnelle

```typescript
function validateAndCleanListing(data: any, mode: 'create' | 'update') {
  const rawFields: Record<string, any> = {};

  // Champs requis seulement en mode création
  if (mode === 'create') {
    if (!data.nomBateau) throw new Error('Nom du bateau requis');
    rawFields['Nom du Bateau'] = data.nomBateau;
  } else {
    // En mode update, tous les champs sont optionnels
    if (data.nomBateau !== undefined) {
      rawFields['Nom du Bateau'] = data.nomBateau;
    }
  }

  // Champs optionnels
  if (data.prix !== undefined) {
    rawFields['Prix Actuel (€/$)'] = data.prix;
  }

  // Nettoyage final
  return cleanListingFields(rawFields);
}
```

### Pattern 3: Validation avec Transformations

```typescript
import { cleanListingFields } from '@/lib/utils';

function prepareListingForAirtable(formData: any) {
  // Transformation des données
  const rawFields = {
    'Nom du Bateau': formData.nomBateau?.trim(),
    'Prix Actuel (€/$)': formData.prix?.toString().replace(/[^\d,€$\s]/g, ''),
    'Année': parseInt(formData.annee),
    'Longueur (M/pieds)': parseFloat(formData.longueur),
  };

  // Validation manuelle supplémentaire
  if (rawFields['Année'] < 1900 || rawFields['Année'] > new Date().getFullYear() + 2) {
    throw new Error('Année invalide');
  }

  // Nettoyage
  return cleanListingFields(rawFields);
}
```

## Gestion d'Erreurs

### Exemple 1: Try-Catch avec Messages User-Friendly

```typescript
import { parseAirtableError } from '@/lib/utils';

async function createListingWithErrorHandling(data: ListingInput) {
  try {
    const listing = await createListing(data);
    return { success: true, data: listing };
  } catch (error) {
    // Convertir l'erreur Airtable en message français
    const message = parseAirtableError(error);

    console.error('[createListingWithErrorHandling] Error:', {
      original: error,
      userMessage: message,
    });

    return { success: false, error: message };
  }
}
```

### Exemple 2: Gestion d'Erreurs Spécifiques

```typescript
async function safeCreateListing(data: ListingInput) {
  try {
    return await createListing(data);
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';

    if (errorMessage.includes('INVALID_MULTIPLE_CHOICE_OPTIONS')) {
      // Tentative de récupération: recréer sans les champs problématiques
      const minimalData = {
        nomBateau: data.nomBateau,
        constructeur: data.constructeur,
        longueur: data.longueur,
        annee: data.annee,
        proprietaire: data.proprietaire,
        capitaine: data.capitaine,
        broker: data.broker,
        localisation: data.localisation,
      };

      console.log('[safeCreateListing] Retrying with minimal data');
      return await createListing(minimalData);
    }

    throw error;
  }
}
```

### Exemple 3: Logging Structuré

```typescript
function logAirtableOperation(
  operation: string,
  rawData: any,
  cleanedData: any,
  result?: any,
  error?: any
) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    rawData,
    cleanedData,
    fieldsRemoved: Object.keys(rawData).filter(
      (key) => !(key in cleanedData)
    ),
    result: result ? { id: result.id } : undefined,
    error: error ? parseAirtableError(error) : undefined,
  };

  if (error) {
    console.error(`[Airtable] ${operation} failed:`, logEntry);
  } else {
    console.log(`[Airtable] ${operation} succeeded:`, logEntry);
  }
}

// Utilisation
async function createListingWithLogging(data: ListingInput) {
  const rawFields = { /* ... */ };
  const cleanedFields = cleanListingFields(rawFields);

  try {
    const record = await listingsTable.create(cleanedFields);
    logAirtableOperation('create', rawFields, cleanedFields, record);
    return record;
  } catch (error) {
    logAirtableOperation('create', rawFields, cleanedFields, undefined, error);
    throw error;
  }
}
```

## Tests Unitaires

### Test 1: cleanListingFields - Chaînes Vides

```typescript
import { cleanListingFields } from '@/lib/utils';

describe('cleanListingFields', () => {
  it('should remove empty strings', () => {
    const input = {
      'Nom du Bateau': 'Test Boat',
      'Prix Actuel (€/$)': '',
      'Commentaire': '   ',  // Whitespace only
    };

    const result = cleanListingFields(input);

    expect(result).toEqual({
      'Nom du Bateau': 'Test Boat',
    });
  });

  it('should keep zero values', () => {
    const input = {
      'Prix Actuel (€/$)': '0',
      'Longueur (M/pieds)': 0,
    };

    const result = cleanListingFields(input);

    expect(result).toEqual(input);
  });

  it('should keep false boolean values', () => {
    const input = {
      'Active': false,
      'Featured': true,
    };

    const result = cleanListingFields(input);

    expect(result).toEqual(input);
  });
});
```

### Test 2: isValidAirtableValue

```typescript
import { isValidAirtableValue } from '@/lib/utils';

describe('isValidAirtableValue', () => {
  it('should return false for invalid values', () => {
    expect(isValidAirtableValue(null)).toBe(false);
    expect(isValidAirtableValue(undefined)).toBe(false);
    expect(isValidAirtableValue('')).toBe(false);
    expect(isValidAirtableValue('   ')).toBe(false);
    expect(isValidAirtableValue([])).toBe(false);
  });

  it('should return true for valid values', () => {
    expect(isValidAirtableValue('test')).toBe(true);
    expect(isValidAirtableValue(0)).toBe(true);
    expect(isValidAirtableValue(false)).toBe(true);
    expect(isValidAirtableValue(['item'])).toBe(true);
    expect(isValidAirtableValue({ key: 'value' })).toBe(true);
  });
});
```

### Test 3: parseAirtableError

```typescript
import { parseAirtableError } from '@/lib/utils';

describe('parseAirtableError', () => {
  it('should parse INVALID_MULTIPLE_CHOICE_OPTIONS error', () => {
    const error = {
      message: 'INVALID_MULTIPLE_CHOICE_OPTIONS: Invalid option',
    };

    const result = parseAirtableError(error);

    expect(result).toContain('choix multiples');
  });

  it('should handle unknown errors', () => {
    const error = {
      message: 'Some random error',
    };

    const result = parseAirtableError(error);

    expect(result).toBeTruthy();
  });
});
```

### Test 4: Integration Test - Create Listing

```typescript
import { createListing } from '@/lib/airtable/listings';

describe('createListing Integration', () => {
  it('should create listing with optional empty fields', async () => {
    const data = {
      nomBateau: 'Test Boat',
      constructeur: 'Test Builder',
      longueur: 25.5,
      annee: 2020,
      proprietaire: 'John Doe',
      capitaine: 'Captain Jack',
      broker: 'test-broker',
      localisation: 'Monaco',
      prix: '',  // Empty optional field
      prixPrecedent: '',
      dernierMessage: '',
      commentaire: '',
    };

    const listing = await createListing(data);

    expect(listing).toBeDefined();
    expect(listing.id).toBeTruthy();
    expect(listing.fields['Nom du Bateau']).toBe('Test Boat');
    expect(listing.fields['Prix Actuel (€/$)']).toBeUndefined();
  });

  it('should handle Airtable errors gracefully', async () => {
    const invalidData = {
      // Missing required fields
      nomBateau: '',
    };

    await expect(createListing(invalidData as any)).rejects.toThrow();
  });
});
```

## Exemples Complets

### Exemple Complet 1: Formulaire de Création avec Validation

**Frontend Component**:
```typescript
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { listingSchema, type ListingInput } from '@/lib/validations';
import toast from 'react-hot-toast';

export function CreateListingForm() {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ListingInput>({
    resolver: zodResolver(listingSchema),
  });

  const onSubmit = async (data: ListingInput) => {
    setLoading(true);

    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau créé avec succès!');
        reset();
      } else {
        toast.error(result.error || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Champs requis */}
      <div>
        <label>Nom du Bateau *</label>
        <input {...register('nomBateau')} className="form-input" />
        {errors.nomBateau && (
          <span className="text-red-600">{errors.nomBateau.message}</span>
        )}
      </div>

      {/* Champs optionnels */}
      <div>
        <label>Prix Actuel (optionnel)</label>
        <input {...register('prix')} className="form-input" />
        {errors.prix && (
          <span className="text-red-600">{errors.prix.message}</span>
        )}
      </div>

      <button type="submit" disabled={loading}>
        {loading ? 'Création...' : 'Créer le bateau'}
      </button>
    </form>
  );
}
```

**API Route**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { listingSchema } from '@/lib/validations';
import { createListing } from '@/lib/airtable/listings';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 1. Vérifier l'authentification
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Non authentifié' },
        { status: 401 }
      );
    }

    // 2. Parser et valider les données
    const body = await request.json();
    const validation = listingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Données invalides',
          details: validation.error.errors,
        },
        { status: 400 }
      );
    }

    // 3. Créer le listing (avec nettoyage automatique)
    const listing = await createListing({
      ...validation.data,
      broker: session.broker,
    });

    // 4. Retourner le résultat
    return NextResponse.json({
      success: true,
      data: listing,
      message: 'Bateau créé avec succès',
    });
  } catch (error: any) {
    console.error('[POST /api/listings] Error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Erreur serveur',
      },
      { status: 500 }
    );
  }
}
```

### Exemple Complet 2: Hook Personnalisé pour CRUD

```typescript
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';

export function useListings() {
  const [loading, setLoading] = useState(false);
  const [listings, setListings] = useState([]);

  const fetchListings = useCallback(async (filters?: any) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(filters);
      const response = await fetch(`/api/listings?${params}`);
      const result = await response.json();

      if (result.success) {
        setListings(result.data);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  const createListing = useCallback(async (data: any) => {
    setLoading(true);
    try {
      const response = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau créé!');
        await fetchListings();
        return result.data;
      } else {
        toast.error(result.error);
        return null;
      }
    } catch (error) {
      toast.error('Erreur de création');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchListings]);

  const updateListing = useCallback(async (id: string, data: any) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/listings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau modifié!');
        await fetchListings();
        return result.data;
      } else {
        toast.error(result.error);
        return null;
      }
    } catch (error) {
      toast.error('Erreur de modification');
      return null;
    } finally {
      setLoading(false);
    }
  }, [fetchListings]);

  const deleteListing = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/listings/${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Bateau supprimé!');
        await fetchListings();
        return true;
      } else {
        toast.error(result.error);
        return false;
      }
    } catch (error) {
      toast.error('Erreur de suppression');
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchListings]);

  return {
    listings,
    loading,
    fetchListings,
    createListing,
    updateListing,
    deleteListing,
  };
}
```

---

**Note**: Ces exemples utilisent les fonctions utilitaires définies dans `C:\Users\beatr\Documents\projets\moana\lib\utils.ts` et suivent les patterns recommandés dans `AIRTABLE_FIELD_HANDLING.md`.
