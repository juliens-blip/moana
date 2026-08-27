import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildGlobalListingPatch, parseBossNumber, type MarketPulseRow } from '../../scripts/sync-market-pulse';

const observedAt = '2026-08-27T18:00:00.000Z';

function row(overrides: Partial<MarketPulseRow> = {}): MarketPulseRow {
  return {
    feedType: 'new',
    vid: '467759',
    vesselName: 'LUMINA',
    mlsId: '484409',
    builder: 'Custom Builder',
    modelYear: '2026',
    category: 'Motor Yacht',
    loaText: "44.19m (145')",
    priceText: '€12,000,000 EUR',
    location: 'Viareggio, Tuscany, Italy',
    soldDate: null,
    brokerName: 'Example Brokerage',
    historyText: null,
    isPriceDrop: false,
    priceBeforeText: null,
    priceAfterText: null,
    ...overrides,
  };
}

assert.equal(parseBossNumber('€12,000,000 EUR'), 12_000_000);
assert.equal(parseBossNumber('44.19m'), 44.19);

const current = buildGlobalListingPatch(row(), observedAt, { listing_url: 'preserved' });
assert.ok(current);
assert.equal(current.externalId, '484409');
assert.equal(current.patch.source_updated_at, observedAt);
assert.equal(current.patch.last_seen_at, observedAt);
assert.equal(current.patch.listing_status, 'Active');
assert.equal(current.patch.length_m, 44.19);
assert.equal(current.patch.price_amount, 12_000_000);
assert.equal(current.patch.price_currency, 'EUR');
assert.deepEqual(current.patch.raw_payload, {
  listing_url: 'preserved',
  yatco_boss: row(),
  boss_observed_at: observedAt,
  boss_feed_type: 'new',
});

const sold = buildGlobalListingPatch(row({ feedType: 'sold', soldDate: '08/26/2026' }), observedAt);
assert.ok(sold);
assert.equal(sold.patch.source_updated_at, observedAt);
assert.equal(sold.patch.listing_status, 'Sold');

const fallbackId = buildGlobalListingPatch(row({ mlsId: null, vid: '467759' }), observedAt);
assert.equal(fallbackId?.externalId, '467759');
assert.equal(buildGlobalListingPatch(row({ mlsId: null, vid: '' }), observedAt), null);

const repositorySource = fs.readFileSync(path.join(process.cwd(), 'lib/supabase/yatco-global.ts'), 'utf8');
const pageSource = fs.readFileSync(path.join(process.cwd(), 'app/dashboard/yatco-global/page.tsx'), 'utf8');
const cardSource = fs.readFileSync(path.join(process.cwd(), 'components/yatco-global/YatcoGlobalCard.tsx'), 'utf8');
assert.match(repositorySource, /query = query\.gte\('source_updated_at', freshnessThreshold\)/);
assert.doesNotMatch(repositorySource, /first_seen_at\.gte\.\$\{freshnessThreshold\},updated_at\.gte/);
assert.match(pageSource, /sortBy: 'source_updated_at'/);
assert.match(cardSource, /Repérée dans YATCO BOSS/);

console.log('18/18 Market Pulse → YATCO Global checks passed');
