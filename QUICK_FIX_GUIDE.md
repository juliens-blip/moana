# Quick Fix Guide - Field Name Corrections

**CRITICAL FIXES REQUIRED IMMEDIATELY**

This guide provides exact code changes needed to fix the field name mismatches discovered in the MCP integration testing.

---

## Overview of Changes

All references to these fields must be updated:
- `Prix` → `Prix Actuel (€/$)`
- `Prix précédent` → `Prix Précédent (€/$)`

Additionally, type changes are required since these fields are stored as text/select, not numbers.

---

## File 1: lib/types.ts

### Location: Lines 12-15

**REPLACE:**
```typescript
'Prix'?: number; // Optional - in EUR
'Prix précédent'?: number; // Optional - previous price in EUR
'Dernier message'?: string; // Optional - last message/note
'Commentaire'?: string; // Optional - comment/remarks
```

**WITH:**
```typescript
'Prix Actuel (€/$)'?: string; // Optional - current price (stored as text in Airtable)
'Prix Précédent (€/$)'?: string; // Optional - previous price (stored as select in Airtable)
'Dernier message'?: string; // Optional - last message/note
'Commentaire'?: string; // Optional - comment/remarks
```

---

## File 2: lib/airtable/listings.ts

### Change 1: getListings function (Lines 20-34)

**REPLACE:**
```typescript
return records.map((record) => ({
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix': (record.get('Prix') || undefined) as number | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
}));
```

**WITH:**
```typescript
return records.map((record) => ({
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
    'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
    'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
    'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
}));
```

### Change 2: getListing function (Lines 48-62)

**REPLACE:**
```typescript
return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix': (record.get('Prix') || undefined) as number | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

**WITH:**
```typescript
return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
    'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
    'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
    'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

### Change 3: createListing function (Lines 74-105)

**REPLACE:**
```typescript
const fields: any = {
  'Nom du Bateau': data.nomBateau,
  'Constructeur': data.constructeur,
  'Longueur (M/pieds)': data.longueur,
  'Année': data.annee,
  'Propriétaire': data.proprietaire,
  'Capitaine': data.capitaine,
  'Broker': data.broker,
  'Localisation': data.localisation,
};

if (data.prix !== undefined) {
  fields['Prix'] = data.prix;
}

const record: any = await listingsTable.create(fields);

return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix': (record.get('Prix') || undefined) as number | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

**WITH:**
```typescript
const fields: any = {
  'Nom du Bateau': data.nomBateau,
  'Constructeur': data.constructeur,
  'Longueur (M/pieds)': data.longueur,
  'Année': data.annee,
  'Propriétaire': data.proprietaire,
  'Capitaine': data.capitaine,
  'Broker': data.broker,
  'Localisation': data.localisation,
};

if (data.prixActuel !== undefined) {
  fields['Prix Actuel (€/$)'] = data.prixActuel;
}
if (data.prixPrecedent !== undefined) {
  fields['Prix Précédent (€/$)'] = data.prixPrecedent;
}
if (data.dernierMessage !== undefined) {
  fields['Dernier message'] = data.dernierMessage;
}
if (data.commentaire !== undefined) {
  fields['Commentaire'] = data.commentaire;
}

const record: any = await listingsTable.create(fields);

return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
    'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
    'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
    'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

### Change 4: updateListing function (Lines 115-148)

**REPLACE:**
```typescript
const updates: any = {};

if (data.nomBateau !== undefined) updates['Nom du Bateau'] = data.nomBateau;
if (data.constructeur !== undefined) updates['Constructeur'] = data.constructeur;
if (data.longueur !== undefined) updates['Longueur (M/pieds)'] = data.longueur;
if (data.annee !== undefined) updates['Année'] = data.annee;
if (data.proprietaire !== undefined) updates['Propriétaire'] = data.proprietaire;
if (data.capitaine !== undefined) updates['Capitaine'] = data.capitaine;
if (data.broker !== undefined) updates['Broker'] = data.broker;
if (data.localisation !== undefined) updates['Localisation'] = data.localisation;
if (data.prix !== undefined) updates['Prix'] = data.prix;

const record: any = await listingsTable.update(id, updates);

return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix': (record.get('Prix') || undefined) as number | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

**WITH:**
```typescript
const updates: any = {};

if (data.nomBateau !== undefined) updates['Nom du Bateau'] = data.nomBateau;
if (data.constructeur !== undefined) updates['Constructeur'] = data.constructeur;
if (data.longueur !== undefined) updates['Longueur (M/pieds)'] = data.longueur;
if (data.annee !== undefined) updates['Année'] = data.annee;
if (data.proprietaire !== undefined) updates['Propriétaire'] = data.proprietaire;
if (data.capitaine !== undefined) updates['Capitaine'] = data.capitaine;
if (data.broker !== undefined) updates['Broker'] = data.broker;
if (data.localisation !== undefined) updates['Localisation'] = data.localisation;
if (data.prixActuel !== undefined) updates['Prix Actuel (€/$)'] = data.prixActuel;
if (data.prixPrecedent !== undefined) updates['Prix Précédent (€/$)'] = data.prixPrecedent;
if (data.dernierMessage !== undefined) updates['Dernier message'] = data.dernierMessage;
if (data.commentaire !== undefined) updates['Commentaire'] = data.commentaire;

const record: any = await listingsTable.update(id, updates);

return {
  id: record.id,
  fields: {
    'Nom du Bateau': (record.get('Nom du Bateau') || '') as string,
    'Constructeur': (record.get('Constructeur') || '') as string,
    'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) as number,
    'Année': (record.get('Année') || 0) as number,
    'Propriétaire': (record.get('Propriétaire') || '') as string,
    'Capitaine': (record.get('Capitaine') || '') as string,
    'Broker': (record.get('Broker') || '') as string,
    'Localisation': (record.get('Localisation') || '') as string,
    'Prix Actuel (€/$)': (record.get('Prix Actuel (€/$)') || undefined) as string | undefined,
    'Prix Précédent (€/$)': (record.get('Prix Précédent (€/$)') || undefined) as string | undefined,
    'Dernier message': (record.get('Dernier message') || undefined) as string | undefined,
    'Commentaire': (record.get('Commentaire') || undefined) as string | undefined,
  },
  createdTime: record._rawJson?.createdTime || new Date().toISOString(),
};
```

---

## File 3: lib/airtable/filters.ts

### Location: Lines 109-119

**REPLACE:**
```typescript
// Price range filters (handle null prices)
if (filters.minPrix !== undefined) {
  conditions.push(
    `AND(NOT({Prix} = BLANK()), {Prix} >= ${filters.minPrix})`
  );
}
if (filters.maxPrix !== undefined) {
  conditions.push(
    `AND(NOT({Prix} = BLANK()), {Prix} <= ${filters.maxPrix})`
  );
}
```

**WITH:**
```typescript
// Price range filters (handle null prices and text-to-number conversion)
if (filters.minPrix !== undefined) {
  conditions.push(
    `AND(NOT({Prix Actuel (€/$)} = BLANK()), {Prix Actuel (€/$)} != "N/A", VALUE({Prix Actuel (€/$)}) >= ${filters.minPrix})`
  );
}
if (filters.maxPrix !== undefined) {
  conditions.push(
    `AND(NOT({Prix Actuel (€/$)} = BLANK()), {Prix Actuel (€/$)} != "N/A", VALUE({Prix Actuel (€/$)}) <= ${filters.maxPrix})`
  );
}
```

**Note:** The `VALUE()` function converts text to number. Also added check for "N/A" string.

---

## File 4: lib/validations.ts

### Location: Lines 18-26

**REPLACE:**
```typescript
localisation: z.string().min(1, 'La localisation est requise'),
prix: z.number({
  invalid_type_error: 'Le prix doit être un nombre'
}).positive('Le prix doit être positif').max(1000000000, 'Prix invalide').optional(),
prixPrecedent: z.number({
  invalid_type_error: 'Le prix précédent doit être un nombre'
}).positive('Le prix précédent doit être positif').max(1000000000, 'Prix précédent invalide').optional(),
dernierMessage: z.string().max(500, 'Le message est trop long').optional(),
commentaire: z.string().max(2000, 'Le commentaire est trop long').optional()
```

**WITH:**
```typescript
localisation: z.string().min(1, 'La localisation est requise'),
prixActuel: z.string().max(50, 'Le prix est trop long').optional(),
prixPrecedent: z.string().max(50, 'Le prix précédent est trop long').optional(),
dernierMessage: z.string().max(500, 'Le message est trop long').optional(),
commentaire: z.string().max(2000, 'Le commentaire est trop long').optional()
```

**Note:** Changed from number to string validation since Airtable stores these as text/select.

---

## File 5: components/listings/ListingCard.tsx

### Location: Lines 49-55

**REPLACE:**
```typescript
{/* Price (if available) */}
{fields.Prix && (
  <div className="flex items-center gap-2 text-primary-700 font-semibold text-lg pb-3 border-b border-gray-200">
    <Euro className="h-5 w-5" />
    <span>{formatNumber(fields.Prix, 0)} €</span>
  </div>
)}
```

**WITH:**
```typescript
{/* Price (if available) */}
{fields['Prix Actuel (€/$)'] && fields['Prix Actuel (€/$)'] !== 'N/A' && (
  <div className="flex items-center gap-2 text-primary-700 font-semibold text-lg pb-3 border-b border-gray-200">
    <Euro className="h-5 w-5" />
    <span>{fields['Prix Actuel (€/$)']}</span>
  </div>
)}
```

**Note:** Removed formatNumber since price is now a string. Added check for "N/A" value.

---

## Verification Steps

After making all changes:

1. **Run Type Check:**
   ```bash
   npm run type-check
   ```

2. **Test Create Listing:**
   ```bash
   # Start dev server
   npm run dev

   # Navigate to create listing form
   # Fill in all fields including price
   # Submit and verify no 500 error
   ```

3. **Test Price Display:**
   ```bash
   # Navigate to listings page
   # Verify prices are displayed on cards
   ```

4. **Test Price Filtering:**
   ```bash
   # Use price range filters
   # Verify results are filtered correctly
   ```

5. **Run Integration Test:**
   ```bash
   node mcp-integration-test.js
   ```

   Expected result: 100% pass rate

---

## Additional Changes (Optional but Recommended)

### Add Price Formatting Utility

Since prices are now strings, create a helper to display them nicely:

**File:** lib/utils.ts

**ADD:**
```typescript
/**
 * Format price string from Airtable
 * Handles various formats: "1500000", "1,500,000", "1.5M", etc.
 */
export function formatPrice(priceString: string | undefined): string {
  if (!priceString || priceString === 'N/A') return '';

  // Remove non-numeric characters except decimal point
  const cleaned = priceString.replace(/[^0-9.]/g, '');
  const number = parseFloat(cleaned);

  if (isNaN(number)) return priceString;

  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(number);
}
```

**Then update ListingCard.tsx:**
```typescript
import { formatPrice } from '@/lib/utils';

// ...

{fields['Prix Actuel (€/$)'] && fields['Prix Actuel (€/$)'] !== 'N/A' && (
  <div className="flex items-center gap-2 text-primary-700 font-semibold text-lg pb-3 border-b border-gray-200">
    <Euro className="h-5 w-5" />
    <span>{formatPrice(fields['Prix Actuel (€/$)'])}</span>
  </div>
)}
```

---

## Summary

**Total Files Modified:** 5
**Total Lines Changed:** ~100
**Estimated Time:** 30-45 minutes
**Testing Time:** 15 minutes
**Total Time:** 1 hour

**Critical Success Factors:**
1. All field name references updated consistently
2. Type changes from number to string applied
3. Filter formulas use VALUE() for text-to-number conversion
4. UI components handle "N/A" values correctly
5. Validation schemas match new field types

**Post-Fix Verification:**
- All create operations succeed
- Price data displays on UI
- Price filters work correctly
- No TypeScript errors
- Integration tests pass 100%
