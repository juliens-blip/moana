# Quick Reference - Airtable Field Handling

## TL;DR

**Problem**: Airtable rejects empty strings (`""`) for optional fields
**Solution**: Use `cleanListingFields()` to filter out empty values before sending to Airtable

## Core Functions

### cleanListingFields()

```typescript
import { cleanListingFields } from '@/lib/utils';

const rawData = {
  'Name': 'Boat',
  'Price': '',  // Empty
  'Notes': null,  // Null
};

const cleaned = cleanListingFields(rawData);
// Result: { 'Name': 'Boat' }
```

**What it does**: Removes empty strings, null, undefined from objects

**Use cases**:
- Before `listingsTable.create()`
- Before `listingsTable.update()`
- Any Airtable API call with optional fields

### isValidAirtableValue()

```typescript
import { isValidAirtableValue } from '@/lib/utils';

isValidAirtableValue('test');  // true
isValidAirtableValue('');  // false
isValidAirtableValue(0);  // true
isValidAirtableValue(null);  // false
```

**What it does**: Checks if a value is acceptable for Airtable

### parseAirtableError()

```typescript
import { parseAirtableError } from '@/lib/utils';

try {
  await listingsTable.create(data);
} catch (error) {
  const message = parseAirtableError(error);
  // Returns user-friendly French message
}
```

**What it does**: Converts Airtable errors to French user messages

## Common Patterns

### Pattern 1: Create with Optional Fields

```typescript
import { createListing } from '@/lib/airtable/listings';

const data = {
  nomBateau: 'Boat Name',
  prix: '',  // Empty optional field - will be filtered
  commentaire: 'Some text',  // Will be kept
};

const listing = await createListing(data);
// Only non-empty fields sent to Airtable
```

### Pattern 2: Update with Partial Data

```typescript
import { updateListing } from '@/lib/airtable/listings';

const updates = {
  prix: '',  // Clear price (filtered out)
  commentaire: 'New comment',  // Update comment
};

const listing = await updateListing('recXXX', updates);
// Only 'Commentaire' field updated
```

### Pattern 3: Error Handling

```typescript
try {
  await createListing(data);
} catch (error) {
  const message = parseAirtableError(error);
  toast.error(message);  // Show to user
}
```

## Cheat Sheet

### Airtable Field Mapping

| Frontend Field | Airtable Field | Type | Required | Max Length |
|---------------|---------------|------|----------|------------|
| `nomBateau` | `Nom du Bateau` | Long text | Yes | 100 |
| `constructeur` | `Constructeur` | Long text | Yes | 50 |
| `longueur` | `Longueur (M/pieds)` | Number | Yes | - |
| `annee` | `Année` | Number | Yes | - |
| `proprietaire` | `Propriétaire` | Text | Yes | 100 |
| `capitaine` | `Capitaine` | Text | Yes | 100 |
| `broker` | `Broker` | Text | Yes | - |
| `localisation` | `Localisation` | Text | Yes | - |
| `prix` | `Prix Actuel (€/$)` | Text | No | 100 |
| `prixPrecedent` | `Prix Précédent (€/$)` | Text | No | 100 |
| `dernierMessage` | `Dernier message` | Text | No | 500 |
| `commentaire` | `Commentaire` | Long text | No | 2000 |

### Valid vs Invalid Values

| Value | Type | Valid? | Sent to Airtable? |
|-------|------|--------|-------------------|
| `"Boat"` | string | Yes | Yes |
| `""` | string | No | No (filtered) |
| `"   "` | string | No | No (filtered) |
| `0` | number | Yes | Yes |
| `42` | number | Yes | Yes |
| `true` | boolean | Yes | Yes |
| `false` | boolean | Yes | Yes |
| `null` | null | No | No (filtered) |
| `undefined` | undefined | No | No (filtered) |
| `[]` | array | No | No (filtered) |
| `["item"]` | array | Yes | Yes |
| `{}` | object | No | No (filtered) |
| `{key: "val"}` | object | Yes | Yes |

### Common Errors

| Error Code | Cause | Solution |
|-----------|-------|----------|
| `INVALID_MULTIPLE_CHOICE_OPTIONS` | Empty string for select field | Use `cleanListingFields()` |
| `INVALID_VALUE_FOR_COLUMN` | Wrong type | Check Zod validation |
| `NOT_FOUND` | Invalid record ID | Verify ID exists |
| `UNAUTHORIZED` | Missing/invalid API key | Check `.env.local` |
| `INVALID_PERMISSIONS` | Insufficient permissions | Check Airtable role |

## Files to Know

```
C:\Users\beatr\Documents\projets\moana\

lib/
  utils.ts                    # cleanListingFields(), parseAirtableError()
  validations.ts              # Zod schemas
  types.ts                    # TypeScript interfaces
  airtable/
    client.ts                 # Airtable connection
    listings.ts               # CRUD operations

app/
  api/
    listings/
      route.ts                # POST, GET endpoints
      [id]/
        route.ts              # PUT, DELETE endpoints

components/
  listings/
    ListingForm.tsx           # Form component
```

## Debug Commands

```bash
# Check environment variables
cat .env.local

# View logs (development)
npm run dev
# Watch console output for:
# [createListing] Raw fields: { ... }
# [createListing] Cleaned fields: { ... }

# Test API endpoint
curl -X POST http://localhost:3000/api/listings \
  -H "Content-Type: application/json" \
  -d '{"nomBateau":"Test",...}'
```

## Quick Fixes

### Issue: Empty fields causing errors
```typescript
// Before (causes error)
const fields = {
  'Name': 'Boat',
  'Price': '',  // Error!
};
await listingsTable.create(fields);

// After (works)
const fields = cleanListingFields({
  'Name': 'Boat',
  'Price': '',
});
await listingsTable.create(fields);
```

### Issue: Null/undefined values
```typescript
// Before (causes error)
const updates = {
  'Price': data.price || null,  // Error!
};

// After (works)
const updates = cleanListingFields({
  'Price': data.price,
});
```

### Issue: Wrong error message shown
```typescript
// Before (technical error)
catch (error) {
  toast.error(error.message);  // "INVALID_MULTIPLE_CHOICE_OPTIONS..."
}

// After (user-friendly)
catch (error) {
  const message = parseAirtableError(error);
  toast.error(message);  // "Valeur invalide pour un champ..."
}
```

## Testing

### Quick Test: cleanListingFields()
```typescript
// In browser console or Node REPL
const { cleanListingFields } = require('./lib/utils');

const test = {
  a: 'valid',
  b: '',
  c: null,
  d: 0,
};

console.log(cleanListingFields(test));
// Expected: { a: 'valid', d: 0 }
```

### Quick Test: Create Listing
```typescript
// In your app
const testData = {
  nomBateau: 'Test Boat',
  constructeur: 'Test Builder',
  longueur: 25,
  annee: 2020,
  proprietaire: 'Test Owner',
  capitaine: 'Test Captain',
  broker: 'test-broker',
  localisation: 'Test Location',
  prix: '',  // Empty optional field
  commentaire: '',  // Empty optional field
};

const listing = await createListing(testData);
// Should succeed without errors
```

## Environment Setup

```bash
# .env.local
AIRTABLE_API_KEY=patXXXXXXXXXXXXXX
AIRTABLE_BASE_ID=appNyZVynxa8shk4c
AIRTABLE_LISTINGS_TABLE_ID=tblxxQhUvQd2Haztz
AIRTABLE_BROKER_TABLE_ID=tbl9dTwK6RfutmqVY
```

## API Response Examples

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "recXXXXXXXXXX",
    "fields": {
      "Nom du Bateau": "Sunseeker 76",
      "Constructeur": "Sunseeker",
      ...
    },
    "createdTime": "2025-12-07T10:00:00.000Z"
  },
  "message": "Bateau créé avec succès"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Valeur invalide pour un champ à choix multiples. Veuillez sélectionner une option valide."
}
```

## Best Practices Checklist

- [ ] Always use `cleanListingFields()` before Airtable API calls
- [ ] Handle errors with `parseAirtableError()`
- [ ] Validate data with Zod schemas (frontend + backend)
- [ ] Log raw and cleaned data in development
- [ ] Test with empty optional fields
- [ ] Show user-friendly error messages in French
- [ ] Never expose Airtable API key to client
- [ ] Keep `0` and `false` values (they're valid)

## Need More Help?

- Full documentation: `docs/AIRTABLE_FIELD_HANDLING.md`
- Code examples: `docs/CODE_EXAMPLES.md`
- Architecture: `docs/ARCHITECTURE_DIAGRAM.md`
- Airtable API docs: https://airtable.com/developers/web/api

---

**Last Updated**: 2025-12-07
**Version**: 1.0.0
