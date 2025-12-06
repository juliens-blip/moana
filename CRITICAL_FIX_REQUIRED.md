# CRITICAL FIX REQUIRED

## Issue: Edit Page Broker Ownership Check

### Location
`app\dashboard\listings\[id]\edit\page.tsx` (Lines 32-37)

### Problem
The edit page contains a client-side broker ownership check that prevents brokers from editing boats they don't own. This contradicts the API changes that allow all authenticated brokers to edit any boat.

### Current Code (INCORRECT)
```typescript
// Check if user owns this listing
if (data.data.fields.Broker !== session?.user.broker) {
  toast.error('Vous n\'êtes pas autorisé à modifier ce bateau');
  router.push('/dashboard');
  return;
}
```

### Required Fix
**REMOVE lines 32-37** from the `fetchListing` function.

### Updated Code (CORRECT)
```typescript
const fetchListing = async () => {
  try {
    const response = await fetch(`/api/listings/${listingId}`);
    const data = await response.json();

    if (data.success) {
      // Allow all brokers to edit any boat
      setListing(data.data);
    } else {
      toast.error('Bateau non trouvé');
      router.push('/dashboard');
    }
  } catch (error) {
    console.error('Error fetching listing:', error);
    toast.error('Erreur de connexion');
    router.push('/dashboard');
  } finally {
    setLoading(false);
  }
};
```

### Why This Fix Is Needed
1. The API already allows all brokers to edit any boat (verified in `app\api\listings\[id]\route.ts`)
2. The dashboard shows edit buttons for all boats (`canEdit={true}`)
3. This client-side check breaks the intended functionality
4. Users will click "Edit" but be redirected back to dashboard with an error

### Impact If Not Fixed
- Brokers cannot edit boats owned by other brokers
- Inconsistent UX (edit button visible but doesn't work)
- Feature is broken despite API supporting it

### Testing After Fix
1. Login as any broker
2. Click "Edit" on a boat owned by a different broker
3. Should successfully load the edit form
4. Should be able to save changes

### Priority
**HIGH - MUST FIX BEFORE DEPLOYMENT**

---

**Reported**: 2025-12-04
**Status**: Pending Fix
