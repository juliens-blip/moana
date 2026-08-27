/**
 * Production regression checks for the YATCO Global Vercel route.
 *
 * Run: npx tsx tests/frontend/yatco-global-vercel-production.test.ts
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

const routeSource = read('app/api/yatco-global/route.ts');
const repositorySource = read('lib/supabase/yatco-global.ts');
const pageSource = read('app/dashboard/yatco-global/page.tsx');

assert.match(
  routeSource,
  /import \{ getYatcoGlobalListings \} from '@\/lib\/supabase\/yatco-global'/,
  'the Vercel route must use the Supabase-backed repository',
);
assert.doesNotMatch(
  routeSource,
  /getLiveYatcoBossListings|@\/lib\/yatco-boss\/live/,
  'the Vercel request path must not open a synchronous SSH session',
);
assert.match(
  routeSource,
  /getYatcoGlobalListings\(validation\.data\)/,
  'validated filters must be passed to the Supabase query',
);
assert.match(
  repositorySource,
  /listings: rows\.map\(\(listing\) => \(\{[\s\S]*\.\.\.listing,[\s\S]*listing\.dedup_key/,
  'the response must retain dedup_key for favorites and history',
);
assert.doesNotMatch(
  repositorySource,
  /rows\.map\(\(\{ dedup_key, \.\.\.listing \}\)/,
  'dedup_key must not be removed from returned listings',
);
assert.match(
  pageSource,
  /void fetchListings\(initialFiltersRef\.current, initialPageRef\.current\)/,
  'the dashboard must load the latest snapshot when opened',
);
assert.doesNotMatch(
  pageSource,
  /params\.set\('refresh', '1'\)/,
  'the dashboard must not request a synchronous production scrape',
);

console.log('7/7 YATCO Global production regression checks passed');
