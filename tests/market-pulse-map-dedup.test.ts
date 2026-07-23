import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMovementsResult } from '../lib/supabase/market-pulse-map';
import type { YatcoMarketPulseEntry } from '../lib/types';

function makeEntry(overrides: Partial<YatcoMarketPulseEntry>): YatcoMarketPulseEntry {
  return {
    id: overrides.id ?? 'row-id',
    feed_type: 'new',
    vid: 'v1',
    vessel_name: 'TEST VESSEL',
    location: 'Cannes, Provence-Alpes-Cote-d\'Azur, France',
    is_price_drop: false,
    scraped_at: '2026-07-22T10:00:00.000Z',
    created_at: '2026-07-22T10:00:00.000Z',
    ...overrides,
  };
}

test('dedupes repeated vid+feed_type rows, keeping only one movement', () => {
  const rows = [
    makeEntry({ id: 'a', vid: 'v1', feed_type: 'new', scraped_at: '2026-07-22T10:00:00.000Z' }),
    makeEntry({ id: 'b', vid: 'v1', feed_type: 'new', scraped_at: '2026-07-20T10:00:00.000Z' }),
  ];

  const result = buildMovementsResult(rows, 14);

  assert.equal(result.totalMovements, 1);
  assert.equal(result.locations[0].total, 1);
});

test('treats the same vid with different feed_type as two distinct movements', () => {
  const rows = [
    makeEntry({ id: 'a', vid: 'v1', feed_type: 'new' }),
    makeEntry({ id: 'b', vid: 'v1', feed_type: 'sold' }),
  ];

  const result = buildMovementsResult(rows, 14);

  assert.equal(result.totalMovements, 2);
  assert.equal(result.locations[0].newCount, 1);
  assert.equal(result.locations[0].soldCount, 1);
});

test('ignores modified feed entries entirely', () => {
  const rows = [makeEntry({ id: 'a', vid: 'v1', feed_type: 'modified' as YatcoMarketPulseEntry['feed_type'] })];

  const result = buildMovementsResult(rows, 14);

  assert.equal(result.totalMovements, 0);
  assert.equal(result.locations.length, 0);
});

test('groups multiple vessels at the same city into one location', () => {
  const rows = [
    makeEntry({ id: 'a', vid: 'v1', feed_type: 'new', location: 'Cannes, PACA, France' }),
    makeEntry({ id: 'b', vid: 'v2', feed_type: 'new', location: 'Cannes, PACA, France' }),
    makeEntry({ id: 'c', vid: 'v3', feed_type: 'sold', location: 'Cannes, PACA, France' }),
  ];

  const result = buildMovementsResult(rows, 14);

  assert.equal(result.locations.length, 1);
  assert.equal(result.locations[0].total, 3);
  assert.equal(result.locations[0].vessels.length, 3);
  assert.equal(result.locations[0].newCount, 2);
  assert.equal(result.locations[0].soldCount, 1);
});

test('counts unresolved locations without adding them to locations[]', () => {
  const rows = [makeEntry({ id: 'a', vid: 'v1', feed_type: 'new', location: null as unknown as string })];

  const result = buildMovementsResult(rows, 14);

  assert.equal(result.unlocatedCount, 1);
  assert.equal(result.locations.length, 0);
});
