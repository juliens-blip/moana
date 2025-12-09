# Gestion Robuste des Champs Airtable

## Problème Initial

### Erreur Rencontrée
```
Error: INVALID_MULTIPLE_CHOICE_OPTIONS
Message: Insufficient permissions to create new select option """"
```

### Cause Racine
Airtable rejette les requêtes qui contiennent:
- Des chaînes vides (`""`) pour les champs optionnels
- Des valeurs `null` ou `undefined` explicitement envoyées
- Des valeurs qui ne correspondent pas aux options pré-définies pour les champs "Single select"

### Contraintes Airtable
1. **Champs Single Select**: N'acceptent que les valeurs pré-définies dans l'interface Airtable
2. **API Permissions**: L'API ne peut pas créer de nouvelles options de sélection sans permissions spéciales
3. **Validation Stricte**: Les champs vides doivent être omis de la requête, pas envoyés comme chaînes vides

## Solution Architecturale

### 1. Flux de Transformation des Données

```
┌─────────────────┐
│  Frontend Form  │
│  (React Hook    │
│   Form + Zod)   │
└────────┬────────┘
         │
         │ Validation côté client
         │
         v
┌─────────────────┐
│  API Route      │
│  (Next.js)      │
└────────┬────────┘
         │
         │ Validation côté serveur (Zod)
         │
         v
┌─────────────────┐
│  Listings.ts    │
│  (Airtable ops) │
└────────┬────────┘
         │
         │ Transformation des données
         │ cleanListingFields()
         │
         v
┌─────────────────┐
│  Airtable API   │
│  (Only valid    │
│   fields sent)  │
└─────────────────┘
```

### 2. Fonction de Nettoyage: `cleanListingFields()`

**Localisation**: `C:\Users\beatr\Documents\projets\moana\lib\utils.ts`

**Objectif**: Filtrer les valeurs invalides avant l'envoi à Airtable

**Implémentation**:
```typescript
export function cleanListingFields<T extends Record<string, any>>(fields: T): Partial<T> {
  const cleaned: Partial<T> = {};

  for (const [key, value] of Object.entries(fields)) {
    // Skip if value is null or undefined
    if (value == null) {
      continue;
    }

    // Skip empty strings (but keep 0 and false)
    if (typeof value === 'string' && value.trim() === '') {
      continue;
    }

    // Skip empty arrays
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }

    // Include the value (it's valid)
    cleaned[key as keyof T] = value;
  }

  return cleaned;
}
```

**Règles de Filtrage**:
- ✅ **Inclus**: Nombres (y compris 0), chaînes non-vides, booleans, objets non-vides
- ❌ **Exclus**: `null`, `undefined`, chaînes vides (`""`), tableaux vides (`[]`)

**Exemple d'Utilisation**:
```typescript
const rawFields = {
  'Nom du Bateau': 'Sunseeker 76',
  'Constructeur': 'Sunseeker',
  'Prix Actuel (€/$)': '',        // <- Sera filtré
  'Prix Précédent (€/$)': null,   // <- Sera filtré
  'Dernier message': undefined,   // <- Sera filtré
  'Commentaire': 'Excellent état', // <- Sera gardé
};

const cleaned = cleanListingFields(rawFields);
// Résultat:
// {
//   'Nom du Bateau': 'Sunseeker 76',
//   'Constructeur': 'Sunseeker',
//   'Commentaire': 'Excellent état'
// }
```

### 3. Validation de Valeurs: `isValidAirtableValue()`

**Objectif**: Vérifier si une valeur individuelle est acceptable pour Airtable

**Implémentation**:
```typescript
export function isValidAirtableValue(value: any): boolean {
  if (value == null) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (typeof value === 'number') return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'object' && Object.keys(value).length > 0) return true;
  return false;
}
```

**Cas d'Usage**:
- Validation pré-envoi
- Tests unitaires
- Debugging

### 4. Gestion d'Erreurs: `parseAirtableError()`

**Objectif**: Convertir les erreurs Airtable en messages user-friendly en français

**Erreurs Gérées**:
- `INVALID_MULTIPLE_CHOICE_OPTIONS` → "Valeur invalide pour un champ à choix multiples"
- `INVALID_VALUE_FOR_COLUMN` → "Valeur invalide pour un champ"
- `NOT_FOUND` → "Enregistrement non trouvé"
- `UNAUTHORIZED` → "Accès non autorisé"
- `INVALID_PERMISSIONS` → "Permissions insuffisantes"
- `INVALID_REQUEST` → "Requête invalide"

**Mode Développement**: Retourne le message d'erreur complet pour le debugging

## Implémentation dans le Code

### 1. Create Listing (`createListing`)

**Fichier**: `C:\Users\beatr\Documents\projets\moana\lib\airtable\listings.ts`

**Avant**:
```typescript
const fields: any = {
  'Nom du Bateau': data.nomBateau,
  'Constructeur': data.constructeur,
  // ...
};

// Handle optional fields
if (data.prix !== undefined && data.prix !== '') {
  fields['Prix Actuel (€/$)'] = data.prix;
}
// ... répété pour chaque champ optionnel
```

**Après**:
```typescript
// Build all fields (including optional)
const rawFields: Record<string, any> = {
  'Nom du Bateau': data.nomBateau,
  'Constructeur': data.constructeur,
  'Prix Actuel (€/$)': data.prix,
  'Prix Précédent (€/$)': data.prixPrecedent,
  // ...
};

// Clean: remove empty strings, null, undefined
const fields = cleanListingFields(rawFields);

console.log('[createListing] Raw fields:', rawFields);
console.log('[createListing] Cleaned fields:', fields);

const record = await listingsTable.create(fields);
```

**Avantages**:
- Code plus concis (pas de `if` répétitifs)
- Gestion cohérente de tous les champs optionnels
- Logging pour debugging
- Prévention des erreurs Airtable

### 2. Update Listing (`updateListing`)

**Même pattern appliqué**:
```typescript
const rawUpdates: Record<string, any> = {};
// Build updates...

const updates = cleanListingFields(rawUpdates);
const record = await listingsTable.update(id, updates);
```

### 3. Gestion d'Erreurs Unifiée

**Avant**:
```typescript
catch (error) {
  throw new Error('Failed to create listing');
}
```

**Après**:
```typescript
catch (error: any) {
  console.error('[createListing] Error:', error);
  const friendlyMessage = parseAirtableError(error);
  throw new Error(friendlyMessage);
}
```

## Pattern de Validation Multi-Couches

### Couche 1: Frontend (React Hook Form + Zod)
```typescript
const listingSchema = z.object({
  nomBateau: z.string().min(1, 'Requis').max(100),
  prix: z.string().max(100).optional().or(z.literal('')),
  // ...
});
```

**Objectif**: Validation UX, messages d'erreur immédiats

### Couche 2: API Route (Zod Server-side)
```typescript
const validation = listingSchema.safeParse(body);
if (!validation.success) {
  return NextResponse.json({ error: 'Données invalides' });
}
```

**Objectif**: Sécurité, validation côté serveur

### Couche 3: Airtable Operations (cleanListingFields)
```typescript
const fields = cleanListingFields(rawFields);
```

**Objectif**: Compatibilité Airtable, prévention des erreurs API

## Champs Airtable - Mapping

### Champs Requis (Required)
| Champ Frontend | Champ Airtable | Type | Validation |
|---------------|---------------|------|------------|
| `nomBateau` | `Nom du Bateau` | Long text | 1-100 chars |
| `constructeur` | `Constructeur` | Long text | 1-50 chars |
| `longueur` | `Longueur (M/pieds)` | Number | > 0, < 200 |
| `annee` | `Année` | Number | 1900-2027 |
| `proprietaire` | `Propriétaire` | Text | 1-100 chars |
| `capitaine` | `Capitaine` | Text | 1-100 chars |
| `broker` | `Broker` | Text | Required |
| `localisation` | `Localisation` | Single line text | Free text |

### Champs Optionnels (Optional)
| Champ Frontend | Champ Airtable | Type | Validation |
|---------------|---------------|------|------------|
| `prix` | `Prix Actuel (€/$)` | Text | Max 100 chars |
| `prixPrecedent` | `Prix Précédent (€/$)` | Text | Max 100 chars |
| `dernierMessage` | `Dernier message` | Single line text | Max 500 chars |
| `commentaire` | `Commentaire` | Long text | Max 2000 chars |

**Note**: Les champs optionnels sont filtrés par `cleanListingFields()` s'ils sont vides

## Tests Recommandés

### Test 1: Champs Vides
```typescript
test('cleanListingFields removes empty strings', () => {
  const input = {
    name: 'Test',
    description: '',
    price: null,
  };
  const result = cleanListingFields(input);
  expect(result).toEqual({ name: 'Test' });
});
```

### Test 2: Valeurs Valides
```typescript
test('cleanListingFields keeps valid values', () => {
  const input = {
    name: 'Test',
    price: 0,  // Keep 0
    active: false,  // Keep false
  };
  const result = cleanListingFields(input);
  expect(result).toEqual(input);
});
```

### Test 3: Création avec Champs Optionnels Vides
```typescript
test('createListing handles empty optional fields', async () => {
  const data = {
    nomBateau: 'Test',
    prix: '',  // Empty optional field
    commentaire: '',
  };

  const listing = await createListing(data);
  expect(listing).toBeDefined();
  expect(listing.fields['Prix Actuel (€/$)']).toBeUndefined();
});
```

## Debugging

### Logs Ajoutés
```typescript
console.log('[createListing] Raw fields:', rawFields);
console.log('[createListing] Cleaned fields:', fields);
```

### Comment Debugger
1. Ouvrir la console du navigateur
2. Déclencher la création/modification
3. Vérifier dans les logs serveur:
   - Les champs bruts envoyés par le frontend
   - Les champs nettoyés envoyés à Airtable
4. Comparer les deux pour identifier les champs problématiques

### Exemple de Log
```
[createListing] Raw fields: {
  'Nom du Bateau': 'Sunseeker 76',
  'Prix Actuel (€/$)': '',
  'Commentaire': ''
}
[createListing] Cleaned fields: {
  'Nom du Bateau': 'Sunseeker 76'
}
```

## Gestion d'Erreurs Avancée

### Erreurs Possibles et Solutions

#### 1. INVALID_MULTIPLE_CHOICE_OPTIONS
**Cause**: Tentative d'envoyer une chaîne vide pour un champ select
**Solution**: `cleanListingFields()` filtre automatiquement

#### 2. INVALID_VALUE_FOR_COLUMN
**Cause**: Type de données incorrect
**Solution**: Validation Zod + TypeScript

#### 3. NOT_FOUND
**Cause**: Record ID invalide
**Solution**: Vérifier l'existence avant update/delete

#### 4. Rate Limiting
**Cause**: Trop de requêtes
**Solution**: Implémenter un cache ou debouncing

## Bonnes Pratiques

### ✅ À Faire
1. **Toujours utiliser `cleanListingFields()`** avant d'envoyer à Airtable
2. **Logger les données** en mode développement
3. **Valider en multi-couches** (frontend + backend)
4. **Messages d'erreur user-friendly** en français
5. **Tester avec des champs vides** systématiquement

### ❌ À Éviter
1. **Ne pas envoyer de chaînes vides** à Airtable
2. **Ne pas ignorer les erreurs** Airtable
3. **Ne pas exposer les erreurs techniques** aux utilisateurs
4. **Ne pas supposer** que les champs optionnels sont toujours remplis
5. **Ne pas créer de nouvelles options** pour les champs select via l'API

## Évolutions Futures

### Court Terme
1. Implémenter un cache Redis pour réduire les appels Airtable
2. Ajouter des tests unitaires pour `cleanListingFields()`
3. Créer un middleware de validation global

### Moyen Terme
1. Récupérer dynamiquement les options de champs select depuis Airtable
2. Implémenter un système de retry pour les erreurs temporaires
3. Ajouter des métriques de performance

### Long Terme
1. Migration vers une base de données SQL pour plus de flexibilité
2. Webhook Airtable pour synchronisation en temps réel
3. API GraphQL pour des queries plus flexibles

## Références

### Fichiers Modifiés
- `C:\Users\beatr\Documents\projets\moana\lib\utils.ts` - Fonctions utilitaires
- `C:\Users\beatr\Documents\projets\moana\lib\airtable\listings.ts` - Opérations Airtable

### Documentation Externe
- [Airtable API - Field Types](https://airtable.com/developers/web/api/field-model)
- [Airtable API - Error Codes](https://airtable.com/developers/web/api/errors)
- [Zod Documentation](https://zod.dev/)

---

**Auteur**: Claude Sonnet 4.5
**Date**: 2025-12-07
**Version**: 1.0.0
