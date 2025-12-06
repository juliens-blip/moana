# Changelog - Airtable Moana MCP Server

## [1.1.0] - 2025-12-04

### Added
- Support for 4 new optional fields in Listings table:
  - `Prix` (Number) - Price in EUR
  - `Prix précédent` (Number) - Previous price in EUR
  - `Dernier message` (String, max 500 chars) - Last message/note
  - `Commentaire` (String, max 2000 chars) - Comment/remarks

### Changed
- Updated `ListingFieldsSchema` in Zod to include optional fields
- Updated `CreateListingInputSchema` to accept optional fields with validation:
  - `prix`: Positive number, optional
  - `prixPrecedent`: Positive number, optional
  - `dernierMessage`: String max 500 characters, optional
  - `commentaire`: String max 2000 characters, optional
- Updated `UpdateListingInputSchema` to allow updating optional fields
- Enhanced all tool implementations to handle new optional fields:
  - `list_listings`: Returns all 12 fields including optional ones
  - `get_listing`: Returns all 12 fields including optional ones
  - `create_listing`: Accepts and creates optional fields when provided
  - `update_listing`: Accepts and updates optional fields when provided
- Updated tool descriptions to document new optional parameters
- Updated `Localisation` field documentation from "Single select" to "Single line text"

### Documentation
- Updated README.md with comprehensive field documentation
- Created SETUP.md with complete setup instructions
- Created mcp-config.json for easy Claude Desktop configuration
- Updated CLAUDE.md in project root to reflect all changes
- Created CHANGELOG.md to track all modifications

### Technical Details

#### Type System Updates
All TypeScript interfaces and Zod schemas now include:
```typescript
'Prix'?: number;
'Prix précédent'?: number;
'Dernier message'?: string;
'Commentaire'?: string;
```

#### Implementation Changes
- `create_listing`: Conditionally adds optional fields to Airtable create payload
- `update_listing`: Conditionally adds optional fields to Airtable update payload
- All listing retrievals: Map optional fields with `| undefined` type annotation

#### Validation Rules
- `prix` and `prixPrecedent`: Must be positive numbers when provided
- `dernierMessage`: Maximum 500 characters
- `commentaire`: Maximum 2000 characters

### Files Modified
1. `src/types/index.ts`
   - Updated `ListingFieldsSchema`
   - Updated `CreateListingInputSchema`
   - Updated `UpdateListingInputSchema`

2. `src/index.ts`
   - Updated `create_listing` tool schema and implementation
   - Updated `update_listing` tool schema and implementation
   - Updated `list_listings` implementation
   - Updated `get_listing` implementation

3. `README.md`
   - Added documentation for optional fields
   - Updated tool parameter descriptions
   - Added field validation documentation

4. `SETUP.md` (New)
   - Complete setup guide
   - Troubleshooting section
   - Testing examples

5. `mcp-config.json` (New)
   - Ready-to-use Claude Desktop configuration

6. `CHANGELOG.md` (New)
   - Version history and changes

### Breaking Changes
None - All changes are backward compatible. Existing code will continue to work as the new fields are optional.

### Migration Notes
No migration required. The MCP server will:
- Continue to work with existing listings that don't have the optional fields
- Accept and store the new optional fields when provided
- Return `undefined` for optional fields that are not set

### Verification Checklist
- [x] All 12 fields are defined in type system
- [x] Create tool accepts all optional fields
- [x] Update tool accepts all optional fields
- [x] List tool returns all optional fields
- [x] Get tool returns all optional fields
- [x] Validation rules are enforced
- [x] Documentation is complete
- [x] Configuration files are ready

### Next Steps
1. Build the MCP server: `npm run build`
2. Update Claude Desktop configuration
3. Restart Claude Desktop
4. Test all CRUD operations with new fields
5. Verify integration with Next.js application

## [1.0.0] - 2025-12-03

### Initial Release
- Basic MCP server for Airtable integration
- 8 required fields support
- CRUD operations for listings
- Broker authentication
- List and authenticate brokers
