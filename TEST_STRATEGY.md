# Moana Yachting SaaS - Comprehensive Testing Strategy

## Executive Summary

This document outlines the complete testing strategy for the Moana Yachting SaaS application, focusing on the new filter features (Broker, Size Range, Price Range) and CRUD operations with broker isolation.

**Version**: 1.0.0
**Date**: 2025-12-03
**Status**: Ready for Implementation

---

## 1. Current State Analysis

### Test Framework Status
- **No test framework currently installed**
- **Existing test files**: Manual JavaScript test scripts for Airtable connection
  - `test-airtable.js` - Airtable connection test
  - `test-api.js` - API endpoint test
  - `test-empty-formula.js` - Filter formula test
  - `test-listings-function.js` - Listings function test

### Technology Stack
- **Frontend**: Next.js 14, React 19, TypeScript
- **Backend**: Next.js API Routes
- **Database**: Airtable (REST API)
- **Authentication**: NextAuth.js
- **Validation**: Zod schemas
- **Styling**: Tailwind CSS

### Required Test Frameworks
We need to install and configure:
1. **Jest** - Unit/Integration testing
2. **React Testing Library** - Component testing
3. **Playwright** - E2E testing
4. **MSW (Mock Service Worker)** - API mocking

---

## 2. Testing Pyramid Strategy

### Distribution
- **Unit Tests**: 70% (Fast, isolated component/function tests)
- **Integration Tests**: 20% (API routes, Airtable integration)
- **E2E Tests**: 10% (Critical user workflows)

### Coverage Goals
- **Line Coverage**: 80% minimum
- **Branch Coverage**: 75% minimum
- **Function Coverage**: 85% minimum
- **Critical Paths**: 100% coverage

---

## 3. Test Categories & Scenarios

### 3.1 UNIT TESTS

#### A. Filter Logic Tests (`lib/airtable/listings.ts`)

**Test File**: `lib/airtable/__tests__/listings.test.ts`

**Scenarios**:

1. **Single Broker Filter**
   - Input: `{ broker: "john.doe" }`
   - Expected: Formula contains `{Broker} = 'john.doe'`
   - Assertion: Only listings with broker "john.doe" returned

2. **Single Size Range Filter**
   - Input: `{ minLength: 20, maxLength: 40 }`
   - Expected: Formula contains `AND({Longueur (M/pieds)} >= 20, {Longueur (M/pieds)} <= 40)`
   - Edge cases: minLength only, maxLength only, both null

3. **Single Price Range Filter**
   - Input: `{ minPrice: 100000, maxPrice: 500000 }`
   - Expected: Formula contains `AND({Prix} >= 100000, {Prix} <= 500000)`
   - Edge cases: minPrice only, maxPrice only, both null

4. **Combined Filters**
   - Input: All filters active
   - Expected: Complex AND formula with all conditions
   - Assertion: Correct formula structure

5. **Search with Filters**
   - Input: `{ search: "Sunseeker", broker: "john.doe" }`
   - Expected: Search + broker filter combined
   - Assertion: Both conditions in formula

6. **Empty Filters**
   - Input: `{}`
   - Expected: Empty formula string
   - Assertion: All listings returned

7. **Invalid Range Handling**
   - Input: `{ minLength: 50, maxLength: 20 }` (min > max)
   - Expected: Error or swap values
   - Assertion: Graceful handling

**Code Example**:
```typescript
// lib/airtable/__tests__/listings.test.ts
import { getListings } from '../listings';
import { listingsTable } from '../client';

jest.mock('../client', () => ({
  listingsTable: {
    select: jest.fn().mockReturnValue({
      all: jest.fn()
    })
  }
}));

describe('getListings - Filter Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should apply broker filter correctly', async () => {
    const mockRecords = [
      { id: 'rec1', get: (field: string) => field === 'Broker' ? 'john.doe' : 'Test' }
    ];

    (listingsTable.select as jest.Mock).mockReturnValue({
      all: jest.fn().mockResolvedValue(mockRecords)
    });

    await getListings({ broker: 'john.doe' });

    expect(listingsTable.select).toHaveBeenCalledWith(
      expect.objectContaining({
        filterByFormula: expect.stringContaining("{Broker} = 'john.doe'")
      })
    );
  });

  it('should apply size range filter correctly', async () => {
    await getListings({ minLength: 20, maxLength: 40 });

    expect(listingsTable.select).toHaveBeenCalledWith(
      expect.objectContaining({
        filterByFormula: expect.stringContaining("{Longueur (M/pieds)} >= 20")
      })
    );
  });

  it('should combine multiple filters with AND', async () => {
    await getListings({
      broker: 'john.doe',
      minPrice: 100000,
      maxPrice: 500000
    });

    const call = (listingsTable.select as jest.Mock).mock.calls[0][0];
    expect(call.filterByFormula).toMatch(/AND\(/);
    expect(call.filterByFormula).toContain("{Broker}");
    expect(call.filterByFormula).toContain("{Prix}");
  });
});
```

#### B. Validation Schema Tests (`lib/validations.ts`)

**Test File**: `lib/__tests__/validations.test.ts`

**Scenarios**:

1. **Valid Listing Data**
   - Input: Complete valid listing
   - Expected: Validation passes
   - Assertion: No errors

2. **Missing Required Fields**
   - Input: Listing without "Nom du Bateau"
   - Expected: Validation fails
   - Assertion: Error message "Le nom du bateau est requis"

3. **Invalid Number Ranges**
   - Input: Negative length
   - Expected: Validation fails
   - Assertion: Error "La longueur doit être positive"

4. **Prix Field Validation**
   - Input: Negative price
   - Expected: Validation fails
   - Assertion: Error "Le prix doit être positif"

5. **Year Validation**
   - Input: Year 2050
   - Expected: Validation fails
   - Assertion: Error "Année invalide"

**Code Example**:
```typescript
// lib/__tests__/validations.test.ts
import { listingSchema } from '../validations';

describe('listingSchema', () => {
  const validListing = {
    nomBateau: 'Sunseeker 76',
    constructeur: 'Sunseeker',
    longueur: 23.2,
    annee: 2020,
    proprietaire: 'John Smith',
    capitaine: 'Captain Jack',
    broker: 'john.doe',
    localisation: 'Monaco',
    prix: 1500000
  };

  it('should validate correct listing data', () => {
    const result = listingSchema.safeParse(validListing);
    expect(result.success).toBe(true);
  });

  it('should reject listing without nom du bateau', () => {
    const { nomBateau, ...invalid } = validListing;
    const result = listingSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('requis');
    }
  });

  it('should reject negative prix', () => {
    const invalid = { ...validListing, prix: -1000 };
    const result = listingSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0].message).toContain('positif');
    }
  });
});
```

#### C. Component Unit Tests

**Test Files**:
- `components/listings/__tests__/ListingFilters.test.tsx`
- `components/listings/__tests__/ListingCard.test.tsx`
- `components/listings/__tests__/ListingForm.test.tsx`

**Scenarios**:

1. **ListingFilters Component**
   - Renders all filter inputs
   - Broker dropdown populated
   - Size range inputs (min/max)
   - Price range inputs (min/max)
   - Clear filters button works
   - Filter change callbacks fire

2. **ListingCard Component**
   - Displays listing data correctly
   - Edit button visible for own listings
   - Edit button hidden for other broker's listings
   - Delete button triggers confirmation
   - Prix displayed with currency formatting

3. **ListingForm Component**
   - All fields render
   - Prix field present
   - Form validation works
   - Submit callback fires with correct data
   - Error states display

---

### 3.2 INTEGRATION TESTS

#### A. API Route Tests

**Test File**: `app/api/listings/__tests__/route.test.ts`

**Scenarios**:

1. **GET /api/listings - No Filters**
   - Request: GET without query params
   - Expected: 200 status, all listings
   - Assertion: Response format correct

2. **GET /api/listings - With Broker Filter**
   - Request: GET `?broker=john.doe`
   - Expected: 200 status, filtered listings
   - Assertion: All listings have broker "john.doe"

3. **GET /api/listings - With Size Range**
   - Request: GET `?minLength=20&maxLength=40`
   - Expected: 200 status, filtered listings
   - Assertion: All listings within range

4. **GET /api/listings - With Price Range**
   - Request: GET `?minPrice=100000&maxPrice=500000`
   - Expected: 200 status, filtered listings
   - Assertion: All listings within price range

5. **GET /api/listings - Combined Filters**
   - Request: GET with all filters
   - Expected: 200 status, filtered listings
   - Assertion: All conditions satisfied

6. **GET /api/listings - Unauthorized**
   - Request: GET without session
   - Expected: 401 status
   - Assertion: Error message "Non authentifié"

7. **POST /api/listings - Create Success**
   - Request: POST valid listing data
   - Expected: 201 status, created listing
   - Assertion: Listing created in Airtable

8. **POST /api/listings - Create with Prix**
   - Request: POST with prix field
   - Expected: 201 status, prix saved
   - Assertion: Prix field in response

9. **POST /api/listings - Validation Error**
   - Request: POST invalid data
   - Expected: 400 status, validation errors
   - Assertion: Error details returned

10. **POST /api/listings - Broker Auto-Assignment**
    - Request: POST listing (broker from session)
    - Expected: 201 status, broker set from session
    - Assertion: Broker matches session user

**Code Example**:
```typescript
// app/api/listings/__tests__/route.test.ts
import { GET, POST } from '../route';
import { getServerSession } from 'next-auth';
import { getListings, createListing } from '@/lib/airtable/listings';

jest.mock('next-auth');
jest.mock('@/lib/airtable/listings');

describe('GET /api/listings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 401 if not authenticated', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);

    const request = new Request('http://localhost:3000/api/listings');
    const response = await GET(request as any);

    expect(response.status).toBe(401);
  });

  it('should return filtered listings with broker filter', async () => {
    const mockSession = { user: { broker: 'john.doe' } };
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);

    const mockListings = [
      { id: 'rec1', fields: { Broker: 'john.doe' } }
    ];
    (getListings as jest.Mock).mockResolvedValue(mockListings);

    const url = new URL('http://localhost:3000/api/listings?broker=john.doe');
    const request = new Request(url);
    const response = await GET(request as any);

    expect(response.status).toBe(200);
    expect(getListings).toHaveBeenCalledWith({ broker: 'john.doe' });
  });

  it('should apply size range filters', async () => {
    const mockSession = { user: { broker: 'john.doe' } };
    (getServerSession as jest.Mock).mockResolvedValue(mockSession);
    (getListings as jest.Mock).mockResolvedValue([]);

    const url = new URL('http://localhost:3000/api/listings?minLength=20&maxLength=40');
    const request = new Request(url);
    await GET(request as any);

    expect(getListings).toHaveBeenCalledWith({
      minLength: 20,
      maxLength: 40
    });
  });
});
```

#### B. Airtable Integration Tests

**Test File**: `lib/airtable/__tests__/integration.test.ts`

**Scenarios**:

1. **Create and Retrieve**
   - Create listing via API
   - Retrieve same listing
   - Assertion: Data matches

2. **Update and Verify**
   - Update listing via API
   - Retrieve updated listing
   - Assertion: Changes persisted

3. **Delete and Verify**
   - Delete listing via API
   - Attempt to retrieve
   - Assertion: 404 or null

4. **Filter Performance**
   - Apply complex filters
   - Measure response time
   - Assertion: Response < 500ms

---

### 3.3 END-TO-END (E2E) TESTS

#### Critical User Workflows

**Test File**: `tests/e2e/listings.spec.ts`

**Scenarios**:

1. **Complete CRUD Workflow**
   ```
   1. Login as broker
   2. Navigate to listings
   3. Create new listing with prix
   4. Verify listing appears
   5. Edit listing
   6. Verify changes saved
   7. Delete listing
   8. Verify listing removed
   ```

2. **Filter Workflow**
   ```
   1. Login as broker
   2. Navigate to listings
   3. Apply broker filter
   4. Verify filtered results
   5. Apply size range filter
   6. Verify combined filters
   7. Apply price range filter
   8. Verify all filters work together
   9. Clear filters
   10. Verify all listings shown
   ```

3. **Broker Isolation Workflow**
   ```
   1. Login as broker A
   2. Create listing
   3. Logout
   4. Login as broker B
   5. Navigate to listings
   6. Verify broker A's listing visible but not editable
   7. Attempt to edit broker A's listing
   8. Verify edit button disabled/hidden
   9. Create own listing
   10. Verify own listing is editable
   ```

4. **Empty State Workflow**
   ```
   1. Login as broker
   2. Apply filters with no results
   3. Verify "No listings found" message
   4. Clear filters
   5. Verify listings reappear
   ```

5. **Form Validation Workflow**
   ```
   1. Login as broker
   2. Click "Create Listing"
   3. Submit empty form
   4. Verify validation errors displayed
   5. Fill form with invalid data (negative prix)
   6. Verify prix validation error
   7. Fill form correctly
   8. Submit successfully
   ```

**Code Example**:
```typescript
// tests/e2e/listings.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Listings Filter Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="broker"]', 'john.doe');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
  });

  test('should filter by broker', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/listings');

    // Apply broker filter
    await page.selectOption('select[name="broker"]', 'john.doe');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Verify all listings have correct broker
    const brokerCells = await page.locator('[data-testid="listing-broker"]').allTextContents();
    brokerCells.forEach(broker => {
      expect(broker).toBe('john.doe');
    });
  });

  test('should filter by size range', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/listings');

    // Apply size range filter
    await page.fill('input[name="minLength"]', '20');
    await page.fill('input[name="maxLength"]', '40');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Verify all listings within range
    const lengths = await page.locator('[data-testid="listing-length"]').allTextContents();
    lengths.forEach(length => {
      const value = parseFloat(length);
      expect(value).toBeGreaterThanOrEqual(20);
      expect(value).toBeLessThanOrEqual(40);
    });
  });

  test('should combine multiple filters', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/listings');

    // Apply all filters
    await page.selectOption('select[name="broker"]', 'john.doe');
    await page.fill('input[name="minLength"]', '20');
    await page.fill('input[name="maxLength"]', '40');
    await page.fill('input[name="minPrice"]', '100000');
    await page.fill('input[name="maxPrice"]', '500000');

    // Wait for filtered results
    await page.waitForTimeout(500);

    // Verify results match all criteria
    const listings = await page.locator('[data-testid="listing-row"]').count();
    expect(listings).toBeGreaterThan(0);
  });

  test('should clear filters', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/listings');

    // Apply filters
    await page.selectOption('select[name="broker"]', 'john.doe');
    await page.fill('input[name="minLength"]', '20');

    const filteredCount = await page.locator('[data-testid="listing-row"]').count();

    // Clear filters
    await page.click('button[data-testid="clear-filters"]');
    await page.waitForTimeout(500);

    const allCount = await page.locator('[data-testid="listing-row"]').count();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
  });
});

test.describe('Broker Isolation', () => {
  test('broker A cannot edit broker B listings', async ({ page }) => {
    // Login as broker A
    await page.goto('http://localhost:3000/login');
    await page.fill('input[name="broker"]', 'broker-a');
    await page.fill('input[name="password"]', 'password123');
    await page.click('button[type="submit"]');

    await page.goto('http://localhost:3000/dashboard/listings');

    // Find listing from broker B
    const brokerBListing = page.locator('[data-testid="listing-row"]')
      .filter({ has: page.locator('[data-testid="listing-broker"]:text("broker-b")') })
      .first();

    // Verify edit button is hidden or disabled
    const editButton = brokerBListing.locator('[data-testid="edit-button"]');
    await expect(editButton).toBeHidden();
  });
});
```

---

### 3.4 PERFORMANCE TESTS

**Test File**: `tests/performance/listings.test.ts`

**Scenarios**:

1. **Filter Response Time**
   - Measure time for filter application
   - Target: < 500ms
   - Test with various filter combinations

2. **Page Load Time**
   - Measure initial listings page load
   - Target: < 2000ms
   - Test with 100+ listings

3. **Search Performance**
   - Measure search response time
   - Target: < 300ms
   - Test with various search terms

**Code Example**:
```typescript
// tests/performance/listings.test.ts
import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test('filter response time should be under 500ms', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/listings');

    const startTime = Date.now();

    await page.selectOption('select[name="broker"]', 'john.doe');
    await page.waitForLoadState('networkidle');

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(500);
  });
});
```

---

### 3.5 SECURITY TESTS

**Test File**: `tests/security/authorization.test.ts`

**Scenarios**:

1. **Unauthorized Access**
   - Attempt API calls without session
   - Expected: 401 status

2. **Cross-Broker Editing**
   - Broker A attempts to edit Broker B's listing
   - Expected: 403 status or operation fails

3. **SQL Injection via Filters**
   - Input malicious filter values
   - Expected: Sanitized, no errors

4. **XSS in Search**
   - Input `<script>alert('xss')</script>` in search
   - Expected: Escaped, not executed

---

## 4. Test Data Requirements

### Seed Data Structure

**Brokers**:
```javascript
[
  { broker: 'john.doe', password: 'hashed-password-1' },
  { broker: 'jane.smith', password: 'hashed-password-2' },
  { broker: 'bob.jones', password: 'hashed-password-3' }
]
```

**Listings**:
```javascript
[
  {
    'Nom du Bateau': 'Sunseeker 76',
    'Constructeur': 'Sunseeker',
    'Longueur (M/pieds)': 23.2,
    'Année': 2020,
    'Propriétaire': 'John Smith',
    'Capitaine': 'Captain Jack',
    'Broker': 'john.doe',
    'Localisation': 'Monaco',
    'Prix': 1500000
  },
  {
    'Nom du Bateau': 'Azimut 60',
    'Constructeur': 'Azimut',
    'Longueur (M/pieds)': 18.5,
    'Année': 2019,
    'Propriétaire': 'Jane Doe',
    'Capitaine': 'Captain Jane',
    'Broker': 'jane.smith',
    'Localisation': 'Cannes',
    'Prix': 850000
  },
  {
    'Nom du Bateau': 'Princess 65',
    'Constructeur': 'Princess',
    'Longueur (M/pieds)': 19.8,
    'Année': 2021,
    'Propriétaire': 'Bob Johnson',
    'Capitaine': 'Captain Bob',
    'Broker': 'john.doe',
    'Localisation': 'Monaco',
    'Prix': 2200000
  },
  // Edge cases
  {
    'Nom du Bateau': 'Small Yacht',
    'Constructeur': 'Test',
    'Longueur (M/pieds)': 10.0,
    'Année': 2022,
    'Propriétaire': 'Test Owner',
    'Capitaine': 'Test Captain',
    'Broker': 'john.doe',
    'Localisation': 'Nice',
    'Prix': 50000
  },
  {
    'Nom du Bateau': 'Large Yacht',
    'Constructeur': 'Test',
    'Longueur (M/pieds)': 50.0,
    'Année': 2023,
    'Propriétaire': 'Test Owner 2',
    'Capitaine': 'Test Captain 2',
    'Broker': 'jane.smith',
    'Localisation': 'Saint-Tropez',
    'Prix': 5000000
  }
]
```

### Test Database Setup

**File**: `tests/setup/seed.ts`

```typescript
import Airtable from 'airtable';
import bcrypt from 'bcryptjs';

export async function seedTestData() {
  const base = Airtable.base(process.env.AIRTABLE_BASE_ID!);

  // Clear existing test data
  await clearTestData(base);

  // Seed brokers
  const brokers = [
    { broker: 'test-broker-1', password: await bcrypt.hash('password123', 10) },
    { broker: 'test-broker-2', password: await bcrypt.hash('password123', 10) }
  ];

  for (const broker of brokers) {
    await base(process.env.AIRTABLE_BROKER_TABLE_ID!).create(broker);
  }

  // Seed listings
  // ... (as shown above)
}
```

---

## 5. Acceptance Criteria Checklist

### Filter Features

- [ ] Broker filter dropdown populated with all brokers
- [ ] Broker filter shows only selected broker's listings
- [ ] Size range filter accepts min value only
- [ ] Size range filter accepts max value only
- [ ] Size range filter accepts both min and max
- [ ] Size range filter validates min < max
- [ ] Price range filter accepts min value only
- [ ] Price range filter accepts max value only
- [ ] Price range filter accepts both min and max
- [ ] Price range filter validates min < max
- [ ] All filters can be combined (broker + size + price)
- [ ] Clear filters button resets all filters
- [ ] Clear filters button shows all listings
- [ ] Empty result shows "No listings found" message
- [ ] Filter application shows loading state
- [ ] Filter response time < 500ms
- [ ] URL updates with filter parameters
- [ ] Filter state persists on page refresh
- [ ] Invalid filter values show error messages

### CRUD Operations

**Create**:
- [ ] Create button visible on listings page
- [ ] Create form opens in modal/page
- [ ] All fields present (including Prix)
- [ ] Prix field accepts numeric input only
- [ ] Prix field formatted as currency
- [ ] Form validation works for all fields
- [ ] Required fields marked with asterisk
- [ ] Submit disabled until form valid
- [ ] Success message shown after creation
- [ ] New listing appears in list immediately
- [ ] Broker auto-assigned from session

**Read**:
- [ ] All listings displayed in table/grid
- [ ] Listing details show all fields including Prix
- [ ] Prix displayed with currency symbol
- [ ] Pagination works (if implemented)
- [ ] Sorting works (if implemented)
- [ ] Loading state shown while fetching

**Update**:
- [ ] Edit button visible for own listings only
- [ ] Edit button hidden for other broker's listings
- [ ] Edit form pre-filled with current values
- [ ] Prix field editable
- [ ] Form validation works on edit
- [ ] Success message shown after update
- [ ] Updated values reflected immediately
- [ ] Cannot change broker field

**Delete**:
- [ ] Delete button visible for own listings only
- [ ] Delete button hidden for other broker's listings
- [ ] Confirmation modal appears
- [ ] Confirmation modal shows listing name
- [ ] Cancel button closes modal without deleting
- [ ] Confirm button deletes listing
- [ ] Success message shown after deletion
- [ ] Deleted listing removed from list immediately

### Security & Authorization

- [ ] Unauthenticated users redirected to login
- [ ] Broker A cannot edit Broker B's listings
- [ ] Broker A cannot delete Broker B's listings
- [ ] API returns 403 for unauthorized operations
- [ ] Session timeout handled gracefully
- [ ] CSRF protection in place

### Performance

- [ ] Listings page loads in < 2 seconds
- [ ] Filter application responds in < 500ms
- [ ] Create operation completes in < 1 second
- [ ] Update operation completes in < 1 second
- [ ] Delete operation completes in < 1 second
- [ ] No console errors
- [ ] No memory leaks

### UI/UX

- [ ] Responsive design works on mobile
- [ ] Filter UI intuitive and clear
- [ ] Loading states visible during operations
- [ ] Error messages clear and helpful
- [ ] Success messages confirm actions
- [ ] Form inputs accessible (labels, ARIA)
- [ ] Keyboard navigation works
- [ ] Focus management correct

---

## 6. Manual Testing Checklist

### Pre-Testing Setup
- [ ] Development server running (`npm run dev`)
- [ ] Test data seeded in Airtable
- [ ] Multiple broker accounts available
- [ ] Clear browser cache and cookies

### Filter Testing

**Broker Filter**:
1. [ ] Navigate to listings page
2. [ ] Click broker filter dropdown
3. [ ] Verify all brokers listed
4. [ ] Select broker "john.doe"
5. [ ] Verify only john.doe's listings shown
6. [ ] Check listing count accurate
7. [ ] Clear filter
8. [ ] Verify all listings shown again

**Size Range Filter**:
1. [ ] Enter min length: 20
2. [ ] Click apply or wait for auto-filter
3. [ ] Verify all listings >= 20m
4. [ ] Enter max length: 40
5. [ ] Verify all listings between 20-40m
6. [ ] Try invalid range (min 50, max 20)
7. [ ] Verify error message or swap
8. [ ] Clear filter

**Price Range Filter**:
1. [ ] Enter min price: 100000
2. [ ] Verify all listings >= 100000
3. [ ] Enter max price: 500000
4. [ ] Verify all listings between 100000-500000
5. [ ] Try invalid range
6. [ ] Verify error handling
7. [ ] Clear filter

**Combined Filters**:
1. [ ] Apply broker filter
2. [ ] Add size range filter
3. [ ] Add price range filter
4. [ ] Verify results match ALL criteria
5. [ ] Remove one filter at a time
6. [ ] Verify results update correctly
7. [ ] Clear all filters

### CRUD Testing

**Create Workflow**:
1. [ ] Login as broker "john.doe"
2. [ ] Click "Create Listing" button
3. [ ] Leave all fields empty
4. [ ] Click submit
5. [ ] Verify validation errors displayed
6. [ ] Fill "Nom du Bateau": "Test Yacht"
7. [ ] Fill "Constructeur": "Test Manufacturer"
8. [ ] Fill "Longueur": 25
9. [ ] Fill "Année": 2023
10. [ ] Fill "Propriétaire": "Test Owner"
11. [ ] Fill "Capitaine": "Test Captain"
12. [ ] Fill "Localisation": "Monaco"
13. [ ] Fill "Prix": 1000000
14. [ ] Submit form
15. [ ] Verify success message
16. [ ] Verify new listing appears in list
17. [ ] Verify broker is "john.doe"
18. [ ] Verify Prix displayed correctly

**Edit Workflow**:
1. [ ] Login as broker "john.doe"
2. [ ] Find listing owned by john.doe
3. [ ] Verify edit button visible
4. [ ] Click edit button
5. [ ] Verify form pre-filled
6. [ ] Change "Prix" to 1200000
7. [ ] Submit form
8. [ ] Verify success message
9. [ ] Verify updated prix displayed
10. [ ] Find listing owned by another broker
11. [ ] Verify edit button NOT visible/disabled

**Delete Workflow**:
1. [ ] Login as broker "john.doe"
2. [ ] Find listing owned by john.doe
3. [ ] Click delete button
4. [ ] Verify confirmation modal appears
5. [ ] Verify listing name shown in modal
6. [ ] Click cancel
7. [ ] Verify modal closes
8. [ ] Verify listing still exists
9. [ ] Click delete again
10. [ ] Click confirm
11. [ ] Verify success message
12. [ ] Verify listing removed from list
13. [ ] Find listing owned by another broker
14. [ ] Verify delete button NOT visible/disabled

### Security Testing

**Broker Isolation**:
1. [ ] Login as broker "john.doe"
2. [ ] Create a test listing
3. [ ] Note the listing ID
4. [ ] Logout
5. [ ] Login as broker "jane.smith"
6. [ ] Navigate to listings
7. [ ] Verify john.doe's listing visible
8. [ ] Verify edit button hidden/disabled
9. [ ] Attempt direct URL access to edit page
10. [ ] Verify access denied or redirect

**Session Management**:
1. [ ] Login as broker
2. [ ] Wait for session timeout
3. [ ] Attempt to create listing
4. [ ] Verify redirected to login
5. [ ] Login again
6. [ ] Verify can continue working

### Performance Testing

**Filter Performance**:
1. [ ] Open browser DevTools Network tab
2. [ ] Apply broker filter
3. [ ] Measure response time
4. [ ] Verify < 500ms
5. [ ] Apply size range filter
6. [ ] Measure response time
7. [ ] Verify < 500ms
8. [ ] Apply all filters together
9. [ ] Measure response time
10. [ ] Verify < 500ms

**Page Load Performance**:
1. [ ] Open browser DevTools Performance tab
2. [ ] Start recording
3. [ ] Navigate to listings page
4. [ ] Stop recording
5. [ ] Verify load time < 2 seconds
6. [ ] Check for console errors
7. [ ] Verify no memory leaks

### Browser Compatibility
- [ ] Test in Chrome
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test in Edge
- [ ] Test on mobile (iOS Safari)
- [ ] Test on mobile (Android Chrome)

### Accessibility Testing
- [ ] Tab through all form fields
- [ ] Verify focus indicators visible
- [ ] Screen reader announces labels
- [ ] Error messages announced
- [ ] Success messages announced
- [ ] All images have alt text
- [ ] Color contrast meets WCAG AA

---

## 7. Test Implementation Plan

### Phase 1: Setup (Week 1)

**Day 1-2: Install Test Frameworks**
```bash
npm install --save-dev jest @types/jest ts-jest
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install --save-dev @playwright/test
npm install --save-dev msw
```

**Day 3: Configure Jest**
Create `jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/*.stories.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 85,
      lines: 80,
      statements: 80,
    },
  },
};
```

**Day 4: Configure Playwright**
Create `playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

**Day 5: Setup Test Data & Mocks**
- Create test data seed script
- Setup MSW for API mocking
- Create test utilities

### Phase 2: Unit Tests (Week 2)

**Priority**:
1. Validation schemas (Day 1)
2. Filter logic (Day 2-3)
3. Component tests (Day 4-5)

**Target**: 70% of total test suite

### Phase 3: Integration Tests (Week 3)

**Priority**:
1. API route tests (Day 1-3)
2. Airtable integration tests (Day 4-5)

**Target**: 20% of total test suite

### Phase 4: E2E Tests (Week 4)

**Priority**:
1. Critical workflows (Day 1-3)
2. Edge cases (Day 4)
3. Performance tests (Day 5)

**Target**: 10% of total test suite

### Phase 5: CI/CD Integration (Week 5)

**Tasks**:
- Setup GitHub Actions workflow
- Configure test environments
- Setup coverage reporting
- Configure quality gates

---

## 8. Test Execution Commands

### Package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest --testPathPattern=__tests__",
    "test:integration": "jest --testPathPattern=integration.test",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:all": "npm run test:coverage && npm run test:e2e",
    "test:ci": "npm run test:coverage && npm run test:e2e -- --reporter=github"
  }
}
```

### Running Tests

**Run all unit tests**:
```bash
npm run test
```

**Run tests in watch mode**:
```bash
npm run test:watch
```

**Run with coverage report**:
```bash
npm run test:coverage
```

**Run E2E tests**:
```bash
npm run test:e2e
```

**Run E2E tests with UI**:
```bash
npm run test:e2e:ui
```

**Run all tests**:
```bash
npm run test:all
```

---

## 9. Quality Gates

### Pre-Commit Hooks

```bash
npm install --save-dev husky lint-staged
```

**.husky/pre-commit**:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run type-check
npm run lint
npm run test:unit
```

### Pull Request Requirements

- [ ] All tests passing
- [ ] Code coverage >= 80%
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] Linting passed
- [ ] Manual testing checklist completed

### CI/CD Pipeline

**GitHub Actions Workflow** (`.github/workflows/test.yml`):

```yaml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run type check
      run: npm run type-check

    - name: Run linter
      run: npm run lint

    - name: Run unit tests
      run: npm run test:coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info

    - name: Install Playwright
      run: npx playwright install --with-deps

    - name: Run E2E tests
      run: npm run test:e2e
      env:
        AIRTABLE_API_KEY: ${{ secrets.AIRTABLE_API_KEY }}
        AIRTABLE_BASE_ID: ${{ secrets.AIRTABLE_BASE_ID }}

    - name: Upload E2E results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: playwright-report
        path: playwright-report/
```

---

## 10. Test Maintenance Guidelines

### When to Update Tests

1. **New Feature Added**: Write tests before or during implementation (TDD)
2. **Bug Fixed**: Add regression test to prevent recurrence
3. **Refactoring**: Update tests to match new implementation
4. **API Changed**: Update integration/E2E tests
5. **UI Changed**: Update component and E2E tests

### Test Naming Convention

```typescript
// Good
describe('getListings', () => {
  describe('when filtering by broker', () => {
    it('should return only listings for specified broker', () => {
      // ...
    });
  });
});

// Bad
describe('test', () => {
  it('works', () => {
    // ...
  });
});
```

### Test Organization

```
moana/
├── __tests__/                    # Global test utilities
│   ├── setup.ts
│   ├── utils.ts
│   └── fixtures.ts
├── lib/
│   ├── airtable/
│   │   ├── __tests__/           # Co-located unit tests
│   │   │   ├── listings.test.ts
│   │   │   └── brokers.test.ts
│   │   ├── listings.ts
│   │   └── brokers.ts
│   └── __tests__/
│       └── validations.test.ts
├── components/
│   └── listings/
│       ├── __tests__/           # Co-located component tests
│       │   ├── ListingCard.test.tsx
│       │   ├── ListingForm.test.tsx
│       │   └── ListingFilters.test.tsx
│       ├── ListingCard.tsx
│       ├── ListingForm.tsx
│       └── ListingFilters.tsx
└── tests/
    ├── e2e/                     # E2E tests
    │   ├── listings.spec.ts
    │   └── auth.spec.ts
    ├── integration/             # Integration tests
    │   └── api.test.ts
    └── performance/             # Performance tests
        └── listings.test.ts
```

---

## 11. Success Metrics

### Coverage Targets
- **Overall**: 80% line coverage
- **Critical paths**: 100% coverage
- **New code**: 90% coverage

### Performance Targets
- **Filter response**: < 500ms
- **Page load**: < 2s
- **Test suite execution**: < 5 minutes

### Quality Metrics
- **Test reliability**: 99% (< 1% flaky tests)
- **Bug escape rate**: < 5% (bugs found in production)
- **Test maintenance time**: < 10% of development time

---

## 12. Risk Assessment

### High-Risk Areas
1. **Broker Isolation**: Security-critical, needs thorough testing
2. **Filter Logic**: Complex combinations, edge cases
3. **Airtable Integration**: External dependency, rate limiting
4. **Session Management**: Security and UX impact

### Mitigation Strategies
1. **Comprehensive test coverage** for high-risk areas
2. **Integration tests** with actual Airtable (test base)
3. **E2E tests** for critical workflows
4. **Security testing** for authorization logic

---

## 13. Next Steps

### Immediate Actions (Week 1)
1. Review and approve test strategy
2. Install test frameworks
3. Configure test environment
4. Create test data seed script

### Short-term (Week 2-4)
1. Implement unit tests
2. Implement integration tests
3. Implement E2E tests
4. Setup CI/CD pipeline

### Long-term (Ongoing)
1. Maintain test suite
2. Add tests for new features
3. Refactor tests as needed
4. Monitor test metrics

---

## Appendix A: Test Data Examples

### Valid Listing Data
```typescript
export const validListing = {
  nomBateau: 'Sunseeker 76',
  constructeur: 'Sunseeker',
  longueur: 23.2,
  annee: 2020,
  proprietaire: 'John Smith',
  capitaine: 'Captain Jack',
  broker: 'john.doe',
  localisation: 'Monaco',
  prix: 1500000
};
```

### Edge Case Listings
```typescript
export const edgeCaseListing = {
  nomBateau: 'A',                    // Minimum length
  constructeur: 'X' * 50,            // Maximum length
  longueur: 0.1,                     // Minimum valid length
  annee: 1900,                       // Minimum valid year
  proprietaire: 'Owner',
  capitaine: 'Captain',
  broker: 'test',
  localisation: 'Nice',
  prix: 1                            // Minimum valid price
};
```

### Invalid Listing Data
```typescript
export const invalidListing = {
  nomBateau: '',                     // Empty
  constructeur: '',                  // Empty
  longueur: -5,                      // Negative
  annee: 1800,                       // Too old
  proprietaire: '',                  // Empty
  capitaine: '',                     // Empty
  broker: '',                        // Empty
  localisation: '',                  // Empty
  prix: -1000                        // Negative
};
```

---

## Appendix B: Mock Data Generators

```typescript
// __tests__/utils/generators.ts

export function generateListing(overrides = {}) {
  return {
    id: `rec${Math.random().toString(36).substr(2, 9)}`,
    fields: {
      'Nom du Bateau': 'Test Yacht',
      'Constructeur': 'Test Manufacturer',
      'Longueur (M/pieds)': 25,
      'Année': 2020,
      'Propriétaire': 'Test Owner',
      'Capitaine': 'Test Captain',
      'Broker': 'test-broker',
      'Localisation': 'Monaco',
      'Prix': 1000000,
      ...overrides
    },
    createdTime: new Date().toISOString()
  };
}

export function generateListings(count: number, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    generateListing({ ...overrides, 'Nom du Bateau': `Test Yacht ${i + 1}` })
  );
}

export function generateBroker(overrides = {}) {
  return {
    id: `rec${Math.random().toString(36).substr(2, 9)}`,
    fields: {
      broker: 'test-broker',
      password: 'hashed-password',
      ...overrides
    },
    createdTime: new Date().toISOString()
  };
}
```

---

## Document Control

**Author**: Test Engineering Team
**Reviewers**: Development Team, Product Owner
**Approval Date**: TBD
**Next Review**: After Phase 1 completion

**Change Log**:
- 2025-12-03: Initial version created
