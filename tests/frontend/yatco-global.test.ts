/**
 * YATCO Global Query Schema & Route Tests
 *
 * Tests:
 * - yatcoGlobalQuerySchema accepts model_year, length_m, country,
 *   price_usd_min, price_usd_max
 * - Schema rejects malformed values (including trailing garbage like
 *   "2020abc") and inverted price bounds
 * - Schema keeps existing defaults (freshnessHours/minLengthMeters/minYear/page)
 *   stable when no filters are supplied
 * - app/api/yatco-global/route.ts relays the new filters from searchParams
 *   into the schema, then hands validation.data straight to
 *   getYatcoGlobalListings after the validation guard (static source check —
 *   deterministic, no dev server)
 * - yatcoGlobalQuerySchema whitelists sortBy to updated_at/price_usd/model_year/
 *   length_m and sortDir to asc/desc, defaulting to updated_at/desc
 * - lib/supabase/yatco-global.ts orders by the whitelisted sortBy/sortDir then
 *   id for a stable order, applies freshnessHours/minLengthMeters/minYear as
 *   base filters before range() pagination, and applies the new filters
 *   conditionally (static source check)
 * - app/dashboard/yatco-global/page.tsx builds the T1 filter params (each key,
 *   min/max bounds, zone), always sends freshnessHours/page as base params,
 *   the T2 sort contract, drops empty values, resets pagination to 1 on every
 *   control change, and renders the server-sorted order directly (no
 *   client-side reorder) (static source checks)
 *
 * Run: npx tsx tests/frontend/yatco-global.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { yatcoGlobalQuerySchema } from '@/lib/validations';
import { createRequestCoordinator } from '@/lib/yatco-global-request';

const routeSource = fs.readFileSync(
  path.join(process.cwd(), 'app/api/yatco-global/route.ts'),
  'utf-8'
);
const supabaseSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/supabase/yatco-global.ts'),
  'utf-8'
);
const pageSource = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/yatco-global/page.tsx'),
  'utf-8'
);
const requestCoordinatorSource = fs.readFileSync(
  path.join(process.cwd(), 'lib/yatco-global-request.ts'),
  'utf-8'
);

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function run(name: string, fn: () => void) {
  try {
    fn();
    results.push({ test: name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: name, passed: false, error: message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${message}`);
  }
}

// Same contract as run(), for the two deferred-promise race tests below that
// must await real microtask interleaving instead of throwing synchronously.
async function runAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ test: name, passed: true });
    console.log(`✅ PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ test: name, passed: false, error: message });
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${message}`);
  }
}

run('schema accepts model_year, length_m, cabins, country, price_usd_min, price_usd_max', () => {
  const parsed = yatcoGlobalQuerySchema.parse({
    model_year: '2020',
    length_m: '20',
    cabins: '4',
    country: 'FR',
    price_usd_min: '100000',
    price_usd_max: '500000'
  });
  assert.equal(parsed.model_year, 2020);
  assert.equal(parsed.length_m, 20);
  assert.equal(parsed.cabins, 4);
  assert.equal(parsed.country, 'FR');
  assert.equal(parsed.price_usd_min, 100000);
  assert.equal(parsed.price_usd_max, 500000);
});

run('schema keeps new filters optional and existing defaults stable when omitted', () => {
  const parsed = yatcoGlobalQuerySchema.parse({});
  assert.equal(parsed.model_year, undefined);
  assert.equal(parsed.length_m, undefined);
  assert.equal(parsed.price_usd_min, undefined);
  assert.equal(parsed.price_usd_max, undefined);
  assert.equal(parsed.freshnessHours, 4380);
  assert.equal(parsed.minLengthMeters, 26);
  assert.equal(parsed.minYear, 2010);
  assert.equal(parsed.page, 1);
  assert.equal(parsed.sortBy, 'updated_at');
  assert.equal(parsed.sortDir, 'desc');
});

run('schema accepts each whitelisted sortBy column and both sortDir directions', () => {
  for (const column of ['updated_at', 'source_updated_at', 'price_usd', 'model_year', 'length_m']) {
    assert.equal(yatcoGlobalQuerySchema.safeParse({ sortBy: column }).success, true, `sortBy=${column} should be accepted`);
  }
  for (const direction of ['asc', 'desc']) {
    assert.equal(yatcoGlobalQuerySchema.safeParse({ sortDir: direction }).success, true, `sortDir=${direction} should be accepted`);
  }
});

run('schema rejects sortBy/sortDir values outside the closed whitelist', () => {
  assert.equal(yatcoGlobalQuerySchema.safeParse({ sortBy: 'external_id' }).success, false);
  assert.equal(yatcoGlobalQuerySchema.safeParse({ sortBy: 'id; DROP TABLE listings;' }).success, false);
  assert.equal(yatcoGlobalQuerySchema.safeParse({ sortDir: 'ascending' }).success, false);
});

run('schema rejects a non-numeric model_year', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ model_year: 'abc' });
  assert.equal(result.success, false);
});

run('schema rejects model_year with trailing garbage instead of truncating it', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ model_year: '2020abc' });
  assert.equal(result.success, false);
});

run('schema rejects a non-numeric length_m', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ length_m: 'abc' });
  assert.equal(result.success, false);
});

run('schema rejects non-numeric or fractional cabins', () => {
  assert.equal(yatcoGlobalQuerySchema.safeParse({ cabins: 'abc' }).success, false);
  assert.equal(yatcoGlobalQuerySchema.safeParse({ cabins: '4.5' }).success, false);
});

run('schema rejects non-numeric price_usd_min/price_usd_max', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ price_usd_min: 'abc', price_usd_max: 'xyz' });
  assert.equal(result.success, false);
});

run('schema rejects price_usd_min greater than price_usd_max', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ price_usd_min: '500000', price_usd_max: '100000' });
  assert.equal(result.success, false);
});

run('schema accepts price_usd_min equal to price_usd_max', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ price_usd_min: '100000', price_usd_max: '100000' });
  assert.equal(result.success, true);
});

run('schema keeps existing country filter working alongside new filters', () => {
  const result = yatcoGlobalQuerySchema.safeParse({ country: 'FR', model_year: '2019' });
  assert.equal(result.success, true);
});

run('GET route relays every yatcoGlobalQuerySchema key from searchParams', () => {
  const YATCO_GLOBAL_FILTER_MATRIX = [
    'freshnessHours', 'minLengthMeters', 'minYear', 'country', 'model_year',
    'length_m', 'cabins', 'price_usd_min', 'price_usd_max', 'page', 'sortBy', 'sortDir'
  ];
  for (const param of YATCO_GLOBAL_FILTER_MATRIX) {
    const pattern = new RegExp(`${param}:\\s*searchParams\\.get\\('${param}'\\)`);
    assert.ok(pattern.test(routeSource), `route.ts does not relay ${param} from searchParams`);
  }
});

run('GET route passes the validated data straight to getYatcoGlobalListings after the validation guard', () => {
  const guardIndex = routeSource.indexOf('if (!validation.success)');
  const handoffIndex = routeSource.indexOf('const result = await getYatcoGlobalListings(validation.data);');
  assert.notEqual(guardIndex, -1, 'missing the validation.success guard');
  assert.notEqual(handoffIndex, -1, 'route.ts must call getYatcoGlobalListings(validation.data), not raw searchParams or a re-derived object');
  assert.ok(handoffIndex > guardIndex, 'the validated-data handoff must happen after the guard rejects invalid params');
});

run('schema enforces bounds on freshnessHours/minLengthMeters/minYear instead of only defaulting them', () => {
  assert.equal(yatcoGlobalQuerySchema.safeParse({ freshnessHours: '0' }).success, false, 'freshnessHours must be positive');
  assert.equal(yatcoGlobalQuerySchema.safeParse({ freshnessHours: '8761' }).success, false, 'freshnessHours must respect its max bound');
  assert.equal(yatcoGlobalQuerySchema.safeParse({ freshnessHours: '8760' }).success, true, 'freshnessHours at the max bound must be accepted');
  assert.equal(yatcoGlobalQuerySchema.safeParse({ minLengthMeters: '-1' }).success, false, 'minLengthMeters must be positive');
  assert.equal(yatcoGlobalQuerySchema.safeParse({ minYear: '0' }).success, false, 'minYear must be positive');
});

run('getYatcoGlobalListings orders by the whitelisted sortColumn then id for a stable order', () => {
  const sortColumnIndex = supabaseSource.indexOf(".order(sortColumn, { ascending: sortAscending");
  const idIndex = supabaseSource.indexOf(".order('id', { ascending: true");
  assert.notEqual(sortColumnIndex, -1, 'missing .order(sortColumn, { ascending: sortAscending ... }) call');
  assert.notEqual(idIndex, -1, "missing .order('id', { ascending: true ... }) call");
  assert.ok(idIndex > sortColumnIndex, 'id order must come after the sort column order for a stable sort');
});

run('getYatcoGlobalListings whitelists sortBy to the four known columns before using it in .order()', () => {
  const whitelistStart = supabaseSource.indexOf('const SORT_COLUMNS');
  const whitelistEnd = supabaseSource.indexOf('as const', whitelistStart);
  assert.notEqual(whitelistStart, -1, 'missing SORT_COLUMNS whitelist');
  const whitelistBlock = supabaseSource.slice(whitelistStart, whitelistEnd);
  for (const column of ['updated_at', 'price_usd', 'model_year', 'length_m']) {
    assert.ok(whitelistBlock.includes(`${column}: '${column}'`), `SORT_COLUMNS missing ${column}`);
  }
  assert.ok(
    /const sortColumn = SORT_COLUMNS\[filters\.sortBy/.test(supabaseSource),
    'sortColumn must be resolved through the SORT_COLUMNS whitelist, never a raw filters.sortBy string'
  );
});

run('getYatcoGlobalListings applies model_year/length_m/price_usd_min/price_usd_max as conditional filters', () => {
  assert.ok(/filters\.model_year !== undefined/.test(supabaseSource), 'missing conditional model_year filter');
  assert.ok(/filters\.length_m !== undefined/.test(supabaseSource), 'missing conditional length_m filter');
  assert.ok(/filters\.price_usd_min !== undefined/.test(supabaseSource), 'missing conditional price_usd_min filter');
  assert.ok(/filters\.price_usd_max !== undefined/.test(supabaseSource), 'missing conditional price_usd_max filter');
  assert.ok(/query = query\.gte\('length_m', filters\.length_m\)/.test(supabaseSource), 'length must be filtered server-side before pagination');
  assert.ok(/query = query\.gte\('cabins', filters\.cabins\)/.test(supabaseSource), 'cabins must be filtered server-side before pagination');
  assert.ok(/city\.ilike\.%\$\{location\}%/.test(supabaseSource), 'location must search city with a partial match');
  assert.ok(supabaseSource.includes("source_updated_at: 'source_updated_at'"), 'publication date must be sortable');
});

run('getYatcoGlobalListings applies freshnessHours/minLengthMeters/minYear as base filters before range()', () => {
  const freshnessIndex = supabaseSource.indexOf("query = query.gte('source_updated_at', freshnessThreshold);");
  const minLengthIndex = supabaseSource.indexOf("query = query.gt('length_m', minLengthMeters);");
  const minYearIndex = supabaseSource.indexOf("query = query.gte('model_year', minYear);");
  const rangeIndex = supabaseSource.indexOf('await query.range(from, to);');
  assert.notEqual(freshnessIndex, -1, 'missing freshnessHours base filter on source_updated_at');
  assert.notEqual(minLengthIndex, -1, 'missing minLengthMeters base filter on length_m');
  assert.notEqual(minYearIndex, -1, 'missing minYear base filter on model_year');
  assert.notEqual(rangeIndex, -1, 'missing query.range(from, to) pagination call');
  assert.ok(freshnessIndex < rangeIndex, 'freshnessHours filter must be applied before range() pagination');
  assert.ok(minLengthIndex < rangeIndex, 'minLengthMeters filter must be applied before range() pagination');
  assert.ok(minYearIndex < rangeIndex, 'minYear filter must be applied before range() pagination');
});

run('page.tsx builds each T1 filter param when provided and omits it when empty', () => {
  for (const key of ['model_year', 'length_m', 'cabins', 'country', 'price_usd_min', 'price_usd_max']) {
    const pattern = key === 'length_m' || key === 'cabins'
      ? new RegExp(`filters\\.${key}\\.trim\\(\\) !== '' && Number\\(filters\\.${key}\\) > 0\\) params\\.set\\('${key}', filters\\.${key}\\.trim\\(\\)\\)`)
      : new RegExp(`filters\\.${key}\\.trim\\(\\) !== ''\\) params\\.set\\('${key}', filters\\.${key}\\.trim\\(\\)\\)`);
    assert.ok(pattern.test(pageSource), `missing conditional, empty-omitting param build for ${key}`);
  }
});

run('page.tsx always sends freshnessHours and the current page as base params', () => {
  assert.ok(
    /new URLSearchParams\(\{\s*freshnessHours:\s*String\(FRESHNESS_HOURS\),\s*page:\s*String\(page\)\s*\}\)/.test(pageSource),
    'buildYatcoGlobalParams must seed freshnessHours and page unconditionally, matching the server default contract'
  );
});

run('page.tsx always sends the selected sort as sortBy/sortDir params', () => {
  assert.ok(/params\.set\('sortBy', filters\.sortBy\)/.test(pageSource), 'missing sortBy param');
  assert.ok(/params\.set\('sortDir', filters\.sortDir\)/.test(pageSource), 'missing sortDir param');
});

run('page.tsx defines a closed list of sort columns and directions', () => {
  const optionsStart = pageSource.indexOf('const YATCO_GLOBAL_SORT_OPTIONS');
  const optionsEnd = pageSource.indexOf('\n];', optionsStart);
  assert.notEqual(optionsStart, -1, 'missing YATCO_GLOBAL_SORT_OPTIONS');
  const optionsBlock = pageSource.slice(optionsStart, optionsEnd);

  const allowedColumns = ['updated_at', 'source_updated_at', 'price_usd', 'model_year', 'length_m'];
  const allowedDirections = ['asc', 'desc'];
  const sortByMatches = [...optionsBlock.matchAll(/sortBy: '([a-z_]+)'/g)].map((m) => m[1]);
  const sortDirMatches = [...optionsBlock.matchAll(/sortDir: '(asc|desc)'/g)].map((m) => m[1]);

  assert.ok(sortByMatches.length >= 4, 'expected at least one option per sortable column');
  for (const column of sortByMatches) {
    assert.ok(allowedColumns.includes(column), `unexpected sort column: ${column}`);
  }
  for (const direction of sortDirMatches) {
    assert.ok(allowedDirections.includes(direction), `unexpected sort direction: ${direction}`);
  }
  for (const column of ['source_updated_at', 'price_usd', 'model_year', 'length_m']) {
    assert.ok(sortByMatches.includes(column), `missing sort option for column: ${column}`);
  }
});

run('page.tsx renders the API-returned order directly, with no client-side reorder', () => {
  assert.ok(
    /setListings\(data\.data\.listings\)/.test(pageSource),
    'listings must be set directly from the decoded API response now that sorting is server-side'
  );
  assert.ok(
    !/function sortListings/.test(pageSource),
    'client-side sortListings must stay removed: /api/yatco-global now sorts globally, re-adding a page-local reorder would fight it'
  );
});

run('page.tsx exposes accessible labels for every filter and the sort control', () => {
  for (const label of ['Année', 'Longueur min. (m)', 'Cabines min.', 'Zone', 'Prix min (USD)', 'Prix max (USD)', 'Tri']) {
    assert.ok(pageSource.includes(`label="${label}"`), `missing accessible label for ${label}`);
  }
});

run('page.tsx resets pagination to 1 on filter and sort changes', () => {
  const updateFilterIndex = pageSource.indexOf('const updateFilter');
  const updateFilterBody = pageSource.slice(updateFilterIndex, updateFilterIndex + 300);
  assert.notEqual(updateFilterIndex, -1, 'missing updateFilter handler');
  assert.ok(/setPage\(1\)/.test(updateFilterBody), 'updateFilter must reset page to 1');

  const handleSortChangeIndex = pageSource.indexOf('const handleSortChange');
  const handleSortChangeBody = pageSource.slice(handleSortChangeIndex, handleSortChangeIndex + 300);
  assert.notEqual(handleSortChangeIndex, -1, 'missing handleSortChange handler');
  assert.ok(/setPage\(1\)/.test(handleSortChangeBody), 'handleSortChange must reset page to 1');
});

run('page.tsx syncs filters to the URL and feeds the same params to the API fetch', () => {
  assert.ok(/router\.replace\(`\$\{pathname\}\?\$\{params\.toString\(\)\}`/.test(pageSource), 'missing router.replace URL sync');
  assert.ok(/fetch\(`\/api\/yatco-global\?\$\{params\.toString\(\)\}`\)/.test(pageSource), 'missing fetch call using the built params');
});

run('page.tsx URL sync effect seeds from existing search params and merges only whitelisted YATCO keys', () => {
  const effectStart = pageSource.indexOf('const canonical = buildYatcoGlobalParams(filters, page);');
  assert.notEqual(effectStart, -1, 'missing canonical YATCO params computation in the URL sync effect');
  const effectEnd = pageSource.indexOf('}, [filters, page, pathname, router]);', effectStart);
  assert.notEqual(
    effectEnd,
    -1,
    'URL sync effect must keep its dependency array as [filters, page, pathname, router] — adding searchParams ' +
      'would re-trigger the effect after every router.replace, even without an effective param change'
  );
  const effectBody = pageSource.slice(effectStart, effectEnd);

  assert.ok(
    /new URLSearchParams\(searchParamsRef\.current\.toString\(\)\)/.test(effectBody),
    'URL sync effect must seed params from the existing URL (via the ref), not a fresh URLSearchParams'
  );
  assert.ok(
    /for \(const key of YATCO_GLOBAL_PARAM_KEYS\)/.test(effectBody),
    'URL sync effect must only touch the whitelisted YATCO keys when merging'
  );
  assert.ok(
    /canonical\.has\(key\)/.test(effectBody) && /params\.delete\(key\)/.test(effectBody),
    'URL sync effect must clear stale YATCO keys the new filter set no longer sets'
  );
});

run('page.tsx URL sync preserves foreign query params (e.g. sort, category) while updating YATCO filters', () => {
  const whitelistMatch = pageSource.match(/const YATCO_GLOBAL_PARAM_KEYS = \[([\s\S]*?)\] as const;/);
  assert.ok(whitelistMatch, 'missing YATCO_GLOBAL_PARAM_KEYS whitelist used to scope the URL merge');
  const keys = [...whitelistMatch[1].matchAll(/'([a-zA-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(
    ['model_year', 'sortBy', 'sortDir', 'page'].every((key) => keys.includes(key)),
    'whitelist must cover the known YATCO filter/pagination/sort keys'
  );

  // Simulates the documented contract: a URL carrying foreign params (sort,
  // category) plus a stale YATCO filter, then a filter change producing a new
  // canonical param set — mirrors the merge loop the effect runs.
  const initial = new URLSearchParams('sort=price_desc&category=sail&model_year=2018&sortBy=updated_at&sortDir=desc');
  const canonical = new URLSearchParams({ freshnessHours: '72', page: '1', sortBy: 'length_m', sortDir: 'asc' });
  const merged = new URLSearchParams(initial.toString());
  for (const key of keys) {
    if (canonical.has(key)) merged.set(key, canonical.get(key) as string);
    else merged.delete(key);
  }

  assert.equal(merged.get('sort'), 'price_desc', 'foreign "sort" param must survive the merge');
  assert.equal(merged.get('category'), 'sail', 'foreign "category" param must survive the merge');
  assert.equal(merged.get('model_year'), null, 'stale YATCO model_year must be cleared when the new filter set omits it');
  assert.equal(merged.get('sortBy'), 'length_m', 'YATCO sortBy must reflect the newly selected filters');
  assert.equal(merged.get('sortDir'), 'asc', 'YATCO sortDir must reflect the newly selected filters');
});

run('page.tsx fires fetchListings unconditionally from updateFilter and handleSortChange', () => {
  const updateFilterIndex = pageSource.indexOf('const updateFilter');
  const updateFilterBody = pageSource.slice(updateFilterIndex, pageSource.indexOf('\n  };', updateFilterIndex));
  assert.notEqual(updateFilterIndex, -1, 'missing updateFilter handler');
  assert.ok(
    /\n\s*fetchListings\(nextFilters, 1\);/.test(updateFilterBody),
    'updateFilter must call fetchListings unconditionally — gating on listings.length or isLoading would swallow ' +
      'a filter change made during an in-flight request or right after an empty [] response'
  );
  assert.ok(!/if \(listings\.length > 0\)/.test(updateFilterBody), 'updateFilter must not gate the request on the current result count');

  const handleSortChangeIndex = pageSource.indexOf('const handleSortChange');
  const handleSortChangeBody = pageSource.slice(handleSortChangeIndex, pageSource.indexOf('\n  };', handleSortChangeIndex));
  assert.notEqual(handleSortChangeIndex, -1, 'missing handleSortChange handler');
  assert.ok(
    /\n\s*fetchListings\(nextFilters, 1\);/.test(handleSortChangeBody),
    'handleSortChange must call fetchListings unconditionally, same as updateFilter'
  );
  assert.ok(!/if \(listings\.length > 0\)/.test(handleSortChangeBody), 'handleSortChange must not gate the request on the current result count');
});

run('page.tsx wires fetchListings through the real request coordinator, keeping fetch/decode/success-error handling of its own', () => {
  assert.ok(
    /import \{ createRequestCoordinator \} from '@\/lib\/yatco-global-request';/.test(pageSource),
    'page.tsx must import the generic coordinator instead of tracking its own requestId inline'
  );
  assert.ok(
    /createRequestCoordinator<ApiResponse<YatcoGlobalListingsResponse>>\(\)/.test(pageSource),
    'the coordinator must be instantiated generic over the decoded ApiResponse — the coordinator itself must stay transport-agnostic'
  );

  const fetchListingsIndex = pageSource.indexOf('const fetchListings = useCallback');
  const fetchListingsEnd = pageSource.indexOf('}, []);', fetchListingsIndex);
  assert.notEqual(fetchListingsIndex, -1, 'missing fetchListings');
  const fetchListingsBody = pageSource.slice(fetchListingsIndex, fetchListingsEnd);

  assert.ok(
    /const outcome = await requestCoordinatorRef\.current\(async \(\) => \{/.test(fetchListingsBody),
    'fetchListings must delegate concurrency to the coordinator ref, passing it the request thunk to run'
  );
  assert.ok(
    /await fetch\(`\/api\/yatco-global\?\$\{params\.toString\(\)\}`\)/.test(fetchListingsBody),
    'the fetch call itself must stay in page.tsx, not move into the coordinator'
  );
  assert.ok(
    /as ApiResponse<YatcoGlobalListingsResponse>/.test(fetchListingsBody),
    'decoding the raw response into ApiResponse<YatcoGlobalListingsResponse> must stay in page.tsx'
  );
  assert.ok(
    /if \(outcome\.stale\) return;/.test(fetchListingsBody),
    'a stale outcome must be discarded before any setState runs, so a superseded response cannot overwrite the latest filter\'s data'
  );
  assert.ok(
    /if \(data\.success && data\.data\) \{/.test(fetchListingsBody),
    'success/error branching on the decoded ApiResponse must stay in page.tsx, after the stale guard'
  );
  assert.ok(
    /setListings\(data\.data\.listings\);/.test(fetchListingsBody),
    'the response listings (including an empty array) must be committed directly, with no special-case that skips an empty result'
  );
});

run('lib/yatco-global-request.ts createRequestCoordinator is generic on the resolved value and knows nothing about HTTP', () => {
  assert.ok(
    /export function createRequestCoordinator<T>\(\)/.test(requestCoordinatorSource),
    'the coordinator must be generic over the resolved value T, not fixed to any /api/yatco-global-specific shape'
  );
  assert.ok(
    !/fetch\(/.test(requestCoordinatorSource) && !/ApiResponse/.test(requestCoordinatorSource),
    'the coordinator module must stay transport-agnostic: no fetch call and no ApiResponse-specific decoding'
  );
  assert.ok(/let requestId = 0;/.test(requestCoordinatorSource), 'the coordinator must hold its own requestId closure state');
  assert.ok(
    /const thisRequestId = \+\+requestId;/.test(requestCoordinatorSource),
    'each call must claim a fresh requestId before awaiting its request'
  );
  assert.ok(
    /if \(thisRequestId !== requestId\) return \{ stale: true \};/.test(requestCoordinatorSource),
    'a stale-request check must run before returning a non-stale outcome'
  );
});

/**
 * The two runtime tests below drive createRequestCoordinator (imported from
 * lib/yatco-global-request.ts, the real module page.tsx itself calls from
 * fetchListings — see the "page.tsx wires fetchListings through the real
 * request coordinator" check above) with controlled deferred promises, so
 * the race behavior is proven against the actual production code path, not
 * a hand-copy of it. The coordinator is generic over the resolved value, so
 * these tests use plain domain markers (arrays of boat ids) rather than an
 * HTTP fixture — fetch, ApiResponse decoding, and success/error handling
 * are page.tsx's job now, not the coordinator's, and are covered separately
 * by the static source check above.
 *
 * Extracting the coordinator out of page.tsx (rather than importing
 * page.tsx directly) was required because page.tsx is a Next.js App Router
 * page file: tsc's page-export validation rejects any export beyond the
 * fixed allowlist (default/dynamic/metadata/…) — confirmed by running
 * `npx tsc --noEmit` against an export added directly to page.tsx for this
 * purpose, which failed with "does not satisfy the constraint
 * '{ [x: string]: never; }'". lib/yatco-global-request.ts is not a
 * page/route/layout file, so it has no such restriction and can be
 * imported by both page.tsx and this test.
 */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

// esbuild/tsx compiles this file to CJS, which rejects top-level await, so
// the two deferred-promise tests (and the summary that must follow them) run
// inside this IIFE instead of as top-level statements.
void (async () => {

await runAsync('the coordinator fires two calls immediately and, resolved in reverse order, only the latest filter\'s value is committable', async () => {
  const deferred: Record<string, Deferred<string[]>> = {
    initial: createDeferred(),
    changed: createDeferred()
  };
  const calls: string[] = [];
  // The exact production coordinator: same module, same closure-held
  // requestId, as the one app/dashboard/yatco-global/page.tsx constructs.
  // No HTTP, no fixture — the coordinator is generic over any resolved
  // value, so a plain domain marker (a list of boat ids) is enough to prove
  // its concurrency contract without pretending to model a captured payload.
  const run = createRequestCoordinator<string[]>();

  const initialOutcomePromise = run(() => { calls.push('initial'); return deferred.initial.promise; });
  assert.deepEqual(calls, ['initial'], 'the initial request must fire immediately');

  const changedOutcomePromise = run(() => { calls.push('changed'); return deferred.changed.promise; });
  assert.deepEqual(calls, ['initial', 'changed'], 'changing the filter must fire a second request immediately, without waiting for the first to resolve');

  // Resolve in reverse order: the newer ("changed") call answers first, the
  // stale ("initial") one arrives after — the classic race. Awaiting each
  // call's own returned promise (instead of counting microtask hops) proves
  // the coordinator's actual resolution, whatever its internal depth.
  deferred.changed.resolve(['boat-B']);
  const changedOutcome = await changedOutcomePromise;
  assert.ok(!changedOutcome.stale, 'the latest filter\'s value must be committable as soon as it arrives');
  assert.deepEqual(changedOutcome.stale ? undefined : changedOutcome.value, ['boat-B']);

  deferred.initial.resolve(['boat-A']);
  const initialOutcome = await initialOutcomePromise;
  assert.ok(
    initialOutcome.stale,
    'the stale initial call arriving after the newer one must resolve stale: true, so page.tsx discards it and never overwrites the latest filter\'s data'
  );
});

await runAsync('an empty [] value is committable, never treated as stale, and a further call still fires immediately', async () => {
  const deferred: Record<string, Deferred<string[]>> = {
    initial: createDeferred(),
    next: createDeferred()
  };
  const calls: string[] = [];
  const run = createRequestCoordinator<string[]>();

  const initialOutcomePromise = run(() => { calls.push('initial'); return deferred.initial.promise; });
  deferred.initial.resolve([]);
  const initialOutcome = await initialOutcomePromise;
  assert.ok(!initialOutcome.stale, 'an empty value must be committable, not treated as a stale/discardable outcome');
  assert.deepEqual(initialOutcome.stale ? undefined : initialOutcome.value, []);

  const nextOutcomePromise = run(() => { calls.push('next'); return deferred.next.promise; });
  assert.deepEqual(calls, ['initial', 'next'], 'a further call after an empty result must still fire immediately — an empty value must never gate the next call');

  deferred.next.resolve(['boat-C']);
  const nextOutcome = await nextOutcomePromise;
  assert.ok(!nextOutcome.stale);
  assert.deepEqual(nextOutcome.stale ? undefined : nextOutcome.value, ['boat-C'], 'the next call\'s value must become committable once it arrives');
});

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} deterministic checks passed`);

if (failed.length > 0) {
  process.exitCode = 1;
}

})();
