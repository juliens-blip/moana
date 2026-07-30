import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMovementsResult, clusterNearbyLocations } from '../lib/supabase/market-pulse-map';
import type { MarketMovementLocation, YatcoMarketPulseEntry } from '../lib/types';

function makeLocation(overrides: Partial<MarketMovementLocation>): MarketMovementLocation {
  const label = overrides.label ?? 'Test Place, Testland';
  return {
    key: `city:${label}`,
    lat: 0,
    lon: 0,
    resolved: 'city',
    label,
    country: 'Testland',
    newCount: 1,
    soldCount: 0,
    total: 1,
    vessels: [
      {
        vid: `v-${label}`,
        feed_type: 'new',
        vessel_name: `Vessel ${label}`,
        location_label: label,
      },
    ],
    ...overrides,
  };
}

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

test('clusterNearbyLocations merges places within the threshold into one zone', () => {
  // Antibes and Cannes are ~9km apart on the French Riviera.
  const antibes = makeLocation({ label: 'Antibes, France', lat: 43.5808, lon: 7.125 });
  const cannes = makeLocation({ label: 'Cannes, France', lat: 43.5528, lon: 7.0174 });

  const zones = clusterNearbyLocations([antibes, cannes], 40);

  assert.equal(zones.length, 1);
  assert.equal(zones[0].total, 2);
  assert.equal(zones[0].vessels.length, 2);
  assert.equal(zones[0].label, 'Antibes, France, Cannes, France');
});

test('clusterNearbyLocations keeps distant places separate', () => {
  const paris = makeLocation({ label: 'Paris, France', lat: 48.8566, lon: 2.3522 });
  const london = makeLocation({ label: 'London, UK', lat: 51.5074, lon: -0.1278 });

  const zones = clusterNearbyLocations([paris, london], 40);

  assert.equal(zones.length, 2);
});

test('clusterNearbyLocations transitively bridges a chain of nearby places', () => {
  // A-B ~22km, B-C ~22km, A-C ~44km (over the 40km threshold on its own),
  // but A and C must still land in the same zone because B bridges them.
  const a = makeLocation({ label: 'A', lat: 0, lon: 0 });
  const b = makeLocation({ label: 'B', lat: 0, lon: 0.2 });
  const c = makeLocation({ label: 'C', lat: 0, lon: 0.4 });

  const zones = clusterNearbyLocations([a, b, c], 40);

  assert.equal(zones.length, 1);
  assert.equal(zones[0].total, 3);
});

test('clusterNearbyLocations leaves a single location untouched', () => {
  const solo = makeLocation({ label: 'Solo Port' });

  const zones = clusterNearbyLocations([solo], 40);

  assert.equal(zones.length, 1);
  assert.deepEqual(zones[0], solo);
});
