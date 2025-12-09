# Architecture - Gestion des Champs Airtable

## Vue d'Ensemble du Système

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MOANA YACHTING SAAS                          │
│                      Yacht Listing Management                        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│                       (Next.js Frontend)                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐        ┌──────────────────┐                  │
│  │  ListingForm     │        │  Dashboard       │                  │
│  │  (React Hook     │───────▶│  (Listings List) │                  │
│  │   Form + Zod)    │        │                  │                  │
│  └────────┬─────────┘        └──────────────────┘                  │
│           │                                                          │
│           │ 1. User Input                                           │
│           │ (May contain empty fields)                              │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                               │
│  │  Client-side     │                                               │
│  │  Validation      │                                               │
│  │  (Zod Schema)    │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ 2. Validated Data                                       │
│           │ (Still may have empty optional fields)                  │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            │ HTTP POST /api/listings
            │ { nomBateau: "...", prix: "", ... }
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          API LAYER                                   │
│                    (Next.js API Routes)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐                                               │
│  │  POST /api       │                                               │
│  │  /listings       │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ 3. Receive Request                                      │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                               │
│  │  Authentication  │                                               │
│  │  Check           │                                               │
│  │  (getSession)    │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ 4. Session Valid                                        │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                               │
│  │  Server-side     │                                               │
│  │  Validation      │                                               │
│  │  (listingSchema) │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ 5. Validated Data                                       │
│           │                                                          │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            │ Call createListing(data)
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BUSINESS LOGIC LAYER                            │
│                   (Airtable Operations)                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐                                               │
│  │  createListing() │                                               │
│  │  (listings.ts)   │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ 6. Prepare Raw Fields                                   │
│           │ rawFields = {                                           │
│           │   'Nom du Bateau': data.nomBateau,                      │
│           │   'Prix Actuel (€/$)': data.prix,  // May be ""         │
│           │   ...                                                   │
│           │ }                                                        │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────┐                       │
│  │  cleanListingFields(rawFields)           │                       │
│  │  ─────────────────────────────────────── │                       │
│  │  CRITICAL TRANSFORMATION:                │                       │
│  │  • Remove empty strings ("")             │                       │
│  │  • Remove null/undefined                 │                       │
│  │  • Keep valid values (0, false, etc)     │                       │
│  │  • Return only non-empty fields          │                       │
│  └────────┬─────────────────────────────────┘                       │
│           │                                                          │
│           │ 7. Cleaned Fields                                       │
│           │ cleanedFields = {                                       │
│           │   'Nom du Bateau': "Sunseeker 76",                      │
│           │   // 'Prix Actuel (€/$)' REMOVED (was empty)            │
│           │ }                                                        │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐                                               │
│  │  Logging         │                                               │
│  │  (Development)   │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           │ console.log('Raw:', rawFields)                          │
│           │ console.log('Cleaned:', cleanedFields)                  │
│           │                                                          │
└───────────┼─────────────────────────────────────────────────────────┘
            │
            │ 8. Airtable API Call
            │ listingsTable.create(cleanedFields)
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                                   │
│                    (Airtable Database)                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────┐           │
│  │  Airtable REST API                                   │           │
│  │  (https://api.airtable.com/v0/appNyZVynxa8shk4c)    │           │
│  └────────┬─────────────────────────────────────────────┘           │
│           │                                                          │
│           │ 9. Validate Request                                     │
│           │ • Check field types                                     │
│           │ • Validate select options                               │
│           │ • Check permissions                                     │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │  SUCCESS         │      │  ERROR           │                    │
│  │  Create Record   │      │  INVALID_MULTI.. │                    │
│  │  Return ID       │      │  Return Error    │                    │
│  └────────┬─────────┘      └────────┬─────────┘                    │
│           │                          │                               │
│           │                          │ 10. Error Caught              │
│           │                          │                               │
└───────────┼──────────────────────────┼───────────────────────────────┘
            │                          │
            │ 11. Success              │ parseAirtableError(error)
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       RESPONSE LAYER                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐      ┌──────────────────────────────┐        │
│  │  Success         │      │  Error                       │        │
│  │  Response        │      │  Response                    │        │
│  │  ───────────     │      │  ───────────                 │        │
│  │  {               │      │  {                           │        │
│  │   success: true, │      │   success: false,            │        │
│  │   data: {        │      │   error: "Valeur invalide    │        │
│  │     id: "...",   │      │           pour un champ à    │        │
│  │     fields: {...}│      │           choix multiples"   │        │
│  │   }              │      │  }                           │        │
│  │  }               │      │                              │        │
│  └────────┬─────────┘      └────────┬─────────────────────┘        │
│           │                          │                               │
└───────────┼──────────────────────────┼───────────────────────────────┘
            │                          │
            │ 12. Return to Client     │
            │                          │
            ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       CLIENT FEEDBACK                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────┐      ┌──────────────────┐                    │
│  │  ✓ Success Toast │      │  ✗ Error Toast   │                    │
│  │  "Bateau créé!"  │      │  "Valeur         │                    │
│  │                  │      │   invalide..."   │                    │
│  └──────────────────┘      └──────────────────┘                    │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Flux de Données Détaillé

### 1. Input Form Data (Frontend)

```typescript
// User fills form, some fields may be empty
{
  nomBateau: "Sunseeker 76",
  constructeur: "Sunseeker",
  longueur: 23.2,
  annee: 2020,
  proprietaire: "John Smith",
  capitaine: "Captain Jack",
  broker: "",  // Empty (will be set by API)
  localisation: "Monaco",
  prix: "",  // User left it empty
  prixPrecedent: "",
  dernierMessage: "",
  commentaire: "Excellent état"
}
```

### 2. Client Validation (Zod)

```typescript
// Validates types and required fields
// Optional fields can be empty strings
listingSchema.parse(data)
// ✓ Passes validation
```

### 3. API Route Processing

```typescript
// API receives data
const body = await request.json();

// Server-side validation
const validation = listingSchema.safeParse(body);
// ✓ Valid

// Add broker from session
const data = {
  ...validation.data,
  broker: session.broker
};

// Call business logic
await createListing(data);
```

### 4. Business Logic Transformation

```typescript
// In createListing()

// Step 4a: Build raw fields
const rawFields = {
  'Nom du Bateau': data.nomBateau,
  'Constructeur': data.constructeur,
  'Longueur (M/pieds)': data.longueur,
  'Année': data.annee,
  'Propriétaire': data.proprietaire,
  'Capitaine': data.capitaine,
  'Broker': data.broker,
  'Localisation': data.localisation,
  'Prix Actuel (€/$)': data.prix,  // ""
  'Prix Précédent (€/$)': data.prixPrecedent,  // ""
  'Dernier message': data.dernierMessage,  // ""
  'Commentaire': data.commentaire,  // "Excellent état"
};

// Step 4b: Clean fields (THE KEY STEP)
const fields = cleanListingFields(rawFields);
// Result:
// {
//   'Nom du Bateau': "Sunseeker 76",
//   'Constructeur': "Sunseeker",
//   'Longueur (M/pieds)': 23.2,
//   'Année': 2020,
//   'Propriétaire': "John Smith",
//   'Capitaine': "Captain Jack",
//   'Broker': "john.doe",
//   'Localisation': "Monaco",
//   'Commentaire': "Excellent état"
//   // Empty fields removed!
// }
```

### 5. Airtable API Call

```typescript
// Only valid fields sent to Airtable
const record = await listingsTable.create(fields);
// ✓ Success - no INVALID_MULTIPLE_CHOICE_OPTIONS error
```

## Architecture des Fichiers

```
moana/
│
├── lib/
│   ├── utils.ts
│   │   ├── cleanListingFields() ◄───── CORE UTILITY
│   │   ├── isValidAirtableValue()
│   │   └── parseAirtableError()
│   │
│   ├── airtable/
│   │   ├── client.ts
│   │   │   └── Airtable configuration
│   │   │
│   │   └── listings.ts
│   │       ├── createListing() ◄───── USES cleanListingFields()
│   │       ├── updateListing() ◄───── USES cleanListingFields()
│   │       ├── getListing()
│   │       ├── getListings()
│   │       └── deleteListing()
│   │
│   ├── validations.ts
│   │   └── listingSchema ◄───── ZOD VALIDATION
│   │
│   └── types.ts
│       └── TypeScript interfaces
│
├── app/
│   └── api/
│       └── listings/
│           ├── route.ts ◄───── POST, GET
│           └── [id]/
│               └── route.ts ◄───── GET, PUT, DELETE
│
└── components/
    └── listings/
        └── ListingForm.tsx ◄───── REACT HOOK FORM
```

## Stratégie de Gestion d'Erreurs

```
┌────────────────────────────────────────────┐
│  Airtable Error                            │
│  INVALID_MULTIPLE_CHOICE_OPTIONS           │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  catch (error) in createListing()          │
│  console.error('[createListing] Error:',   │
│    error)                                  │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  parseAirtableError(error)                 │
│  ─────────────────────────────────────     │
│  Converts technical error to French       │
│  user-friendly message                     │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  throw new Error(friendlyMessage)          │
│  "Valeur invalide pour un champ à choix    │
│   multiples. Veuillez sélectionner une     │
│   option valide."                          │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  API Route catches and returns             │
│  {                                         │
│    success: false,                         │
│    error: "Valeur invalide..."             │
│  }                                         │
└─────────────────┬──────────────────────────┘
                  │
                  ▼
┌────────────────────────────────────────────┐
│  Frontend displays                         │
│  toast.error(result.error)                 │
└────────────────────────────────────────────┘
```

## Validation Multi-Couches

```
Layer 1: Frontend (React Hook Form + Zod)
────────────────────────────────────────────
Purpose: UX validation, immediate feedback
Tools: react-hook-form, zod
Validates:
  • Required fields not empty
  • Data types (number, string)
  • Min/max length
  • Format (email, etc)

          │
          ▼

Layer 2: API Route (Zod Server-side)
────────────────────────────────────────────
Purpose: Security, prevent malicious data
Tools: zod safeParse
Validates:
  • Same rules as frontend
  • Protection against form manipulation
  • Type safety

          │
          ▼

Layer 3: Business Logic (cleanListingFields)
────────────────────────────────────────────
Purpose: Airtable compatibility
Tools: cleanListingFields(), custom logic
Transforms:
  • Remove empty strings
  • Filter null/undefined
  • Keep only valid Airtable values

          │
          ▼

Layer 4: Airtable (Database Constraints)
────────────────────────────────────────────
Purpose: Data integrity
Validates:
  • Field types match schema
  • Select options exist
  • Required fields present
  • Permissions valid
```

## Performance Considerations

```
┌─────────────────────────────────────────────────┐
│  OPTIMIZATION STRATEGIES                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Client-side Caching                         │
│     • Cache listings in React state             │
│     • Reduce API calls                          │
│     • Use SWR or React Query                    │
│                                                 │
│  2. Debouncing                                  │
│     • Debounce search inputs (500ms)            │
│     • Prevent excessive API calls               │
│                                                 │
│  3. Airtable Rate Limiting                      │
│     • Max 5 requests/second                     │
│     • Implement request queue                   │
│     • Add retry logic with backoff              │
│                                                 │
│  4. Field Filtering                             │
│     • cleanListingFields() is O(n)              │
│     • Minimal performance impact                │
│     • Runs only on create/update                │
│                                                 │
│  5. Logging (Development Only)                  │
│     • Disable in production                     │
│     • Use environment checks                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────┐
│  SECURITY LAYERS                                │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. Authentication                              │
│     ┌─────────────────────────────────┐        │
│     │  Session-based Auth             │        │
│     │  Cookie: broker_session         │        │
│     │  Validated on every API call    │        │
│     └─────────────────────────────────┘        │
│                                                 │
│  2. Input Validation                            │
│     ┌─────────────────────────────────┐        │
│     │  Zod Schema Validation          │        │
│     │  Type checking                  │        │
│     │  SQL Injection prevention       │        │
│     └─────────────────────────────────┘        │
│                                                 │
│  3. Authorization                               │
│     ┌─────────────────────────────────┐        │
│     │  Broker can only edit own       │        │
│     │  listings (future enhancement)  │        │
│     └─────────────────────────────────┘        │
│                                                 │
│  4. API Security                                │
│     ┌─────────────────────────────────┐        │
│     │  AIRTABLE_API_KEY in .env       │        │
│     │  Never exposed to client        │        │
│     │  HTTPS only in production       │        │
│     └─────────────────────────────────┘        │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

**Created**: 2025-12-07
**Last Updated**: 2025-12-07
**Version**: 1.0.0
