# Changelog

All notable changes to the Moana Yachting SaaS project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive Airtable field handling system
- `cleanListingFields()` utility function to filter empty values
- `isValidAirtableValue()` utility function for value validation
- `parseAirtableError()` utility function for user-friendly error messages
- Complete documentation suite in `docs/` directory:
  - `QUICK_REFERENCE.md` - Quick reference guide
  - `AIRTABLE_FIELD_HANDLING.md` - In-depth technical documentation
  - `CODE_EXAMPLES.md` - Practical code examples
  - `ARCHITECTURE_DIAGRAM.md` - System architecture diagrams
  - `README.md` - Documentation overview

### Changed
- Updated `lib/utils.ts` with new Airtable utility functions
- Modified `lib/airtable/listings.ts`:
  - `createListing()` now uses `cleanListingFields()` to filter empty values
  - `updateListing()` now uses `cleanListingFields()` to filter empty values
  - Both functions now use `parseAirtableError()` for better error messages
  - Added detailed logging in development mode

### Fixed
- **CRITICAL**: Fixed `INVALID_MULTIPLE_CHOICE_OPTIONS` error when creating/updating listings with empty optional fields
- Resolved issue where empty strings (`""`) were sent to Airtable causing API errors
- Fixed error messages not being user-friendly (now in French)

## [0.2.0] - 2025-12-07

### Fixed
- Removed unused NextAuth imports causing Vercel build failure
- Replaced NextAuth with simple cookie-based session management
- Fixed all NextAuth-related dependencies

## [0.1.0] - 2025-12-03

### Added
- Initial Next.js 14 project setup with App Router
- Basic project structure and configuration
- Airtable integration setup
- CLAUDE.md project documentation
- Environment configuration for Airtable

### Infrastructure
- Next.js 14 with TypeScript
- Tailwind CSS configuration
- ESLint and TypeScript configuration
- Basic project file structure

## Migration Guide (0.1.0 → Unreleased)

### For Developers

#### 1. Update Imports
If you were manually handling Airtable operations, update your imports:

```typescript
// Before
import { listingsTable } from '@/lib/airtable/client';

const fields = {
  'Name': 'Boat',
  'Price': data.price || '',  // Could cause errors
};
await listingsTable.create(fields);

// After
import { createListing } from '@/lib/airtable/listings';
import { cleanListingFields } from '@/lib/utils';

// Option 1: Use the high-level function (recommended)
await createListing(data);  // Automatically cleans fields

// Option 2: Manual cleaning (if needed)
const fields = cleanListingFields(rawFields);
await listingsTable.create(fields);
```

#### 2. Error Handling
Update error handling to use the new parser:

```typescript
// Before
try {
  await createListing(data);
} catch (error) {
  console.error(error);
  toast.error('Une erreur est survenue');
}

// After
import { parseAirtableError } from '@/lib/utils';

try {
  await createListing(data);
} catch (error) {
  const message = parseAirtableError(error);
  toast.error(message);  // User-friendly French message
}
```

#### 3. Testing
Ensure your tests account for the new field cleaning:

```typescript
// Test that empty fields are filtered
test('creates listing without empty optional fields', async () => {
  const data = {
    nomBateau: 'Test',
    prix: '',  // Empty - should be filtered
  };

  const listing = await createListing(data);
  expect(listing.fields['Prix Actuel (€/$)']).toBeUndefined();
});
```

### Breaking Changes
None - All changes are backward compatible. Existing code will continue to work.

### Deprecations
None

### Recommended Actions
1. Review the documentation in `docs/`
2. Update error handling to use `parseAirtableError()`
3. Test your code with empty optional fields
4. Add logging in development to monitor data transformation

## Future Roadmap

### Planned for Next Release
- [ ] Implement Redis caching for Airtable data
- [ ] Add unit tests for `cleanListingFields()` and related utilities
- [ ] Add integration tests for create/update operations
- [ ] Implement request rate limiting for Airtable API
- [ ] Add retry logic with exponential backoff for failed requests

### Under Consideration
- [ ] Real-time webhook integration with Airtable
- [ ] GraphQL API layer
- [ ] Migration to PostgreSQL for more flexibility
- [ ] Advanced analytics dashboard
- [ ] Multi-language support (English, Spanish)

## Notes

### Version Numbering
- **Major** (X.0.0): Breaking changes
- **Minor** (0.X.0): New features, backward compatible
- **Patch** (0.0.X): Bug fixes, backward compatible

### Git Tags
Releases are tagged in git as `vX.Y.Z` (e.g., `v0.2.0`)

---

**Maintainers**: Claude Sonnet 4.5
**Last Updated**: 2025-12-07
