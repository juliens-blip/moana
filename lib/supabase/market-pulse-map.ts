import type { MarketMovementLocation, MarketMovementsResult, YatcoMarketPulseEntry } from '@/lib/types';
import { geocodeLocation, haversineKm } from '@/lib/geo/geocode';
import { createAdminClient } from './admin';

export const MARKET_PULSE_MAP_DAYS = 14;

const MAX_MARKET_PULSE_MAP_DAYS = 31;
const MAX_MARKET_PULSE_MAP_ROWS = 5_000;

// Places within this real-world distance are merged into a single map "zone"
// bubble (e.g. Antibes+Cannes+Nice on the French Riviera collapse into one
// dot instead of 3 overlapping ones), calibrated so it groups a genuine
// cluster of nearby ports without swallowing an entire coastline into one blob.
const ZONE_MERGE_THRESHOLD_KM = 40;

function clampInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value as number), 1), maximum);
}

function getWindowStartDate(days: number): string {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startOfToday.setUTCDate(startOfToday.getUTCDate() - (days - 1));
  return startOfToday.toISOString();
}

/**
 * Pure aggregation step, split out from the Supabase read so it can be unit
 * tested without a network call. Dedupes the event-stream by vid+feed_type
 * (keeping the most recent row), geocodes each remaining row, and groups the
 * result by resolved place (city, falling back to country).
 */
export function buildMovementsResult(
  rows: YatcoMarketPulseEntry[],
  windowDays: number,
): MarketMovementsResult {
  const seen = new Map<string, YatcoMarketPulseEntry>();

  for (const row of rows) {
    if (row.feed_type !== 'new' && row.feed_type !== 'sold') continue;
    const dedupeKey = `${row.vid}::${row.feed_type}`;
    // Rows arrive sorted by scraped_at desc, so the first one seen per key is the latest.
    if (!seen.has(dedupeKey)) {
      seen.set(dedupeKey, row);
    }
  }

  const locations = new Map<string, MarketMovementsResult['locations'][number]>();
  let unlocatedCount = 0;

  for (const row of seen.values()) {
    const feedType = row.feed_type as 'new' | 'sold';
    const geo = geocodeLocation(row.location);

    if (geo.resolved === 'none') {
      unlocatedCount++;
      continue;
    }

    const placeKey = geo.resolved === 'city' ? `city:${geo.city}` : `country:${geo.country}`;
    const label = geo.resolved === 'city' && geo.city ? `${geo.city}, ${geo.country}` : geo.country;

    let place = locations.get(placeKey);
    if (!place) {
      place = {
        key: placeKey,
        lat: geo.lat,
        lon: geo.lon,
        resolved: geo.resolved,
        label,
        country: geo.country,
        newCount: 0,
        soldCount: 0,
        total: 0,
        vessels: [],
      };
      locations.set(placeKey, place);
    }

    if (feedType === 'new') place.newCount++;
    else place.soldCount++;
    place.total++;
    place.vessels.push({
      vid: row.vid,
      feed_type: feedType,
      vessel_name: row.vessel_name,
      builder: row.builder,
      loa_text: row.loa_text,
      price_text: row.price_text,
      sold_date: row.sold_date,
      location_label: label,
    });
  }

  const sortedLocations = Array.from(locations.values()).sort((a, b) => b.total - a.total);

  return {
    locations: sortedLocations,
    totalMovements: seen.size - unlocatedCount,
    locatedPlaces: sortedLocations.length,
    unlocatedCount,
    windowDays,
  };
}

function mergeZoneGroup(members: MarketMovementLocation[]): MarketMovementLocation {
  if (members.length === 1) return members[0];

  const lat = members.reduce((sum, m) => sum + m.lat, 0) / members.length;
  const lon = members.reduce((sum, m) => sum + m.lon, 0) / members.length;
  const distinctLabels = Array.from(new Set(members.map((m) => m.label)));

  return {
    key: members.map((m) => m.key).sort().join('|'),
    lat,
    lon,
    resolved: members.some((m) => m.resolved === 'city') ? 'city' : 'country',
    label: distinctLabels.join(', '),
    country: members[0].country,
    newCount: members.reduce((sum, m) => sum + m.newCount, 0),
    soldCount: members.reduce((sum, m) => sum + m.soldCount, 0),
    total: members.reduce((sum, m) => sum + m.total, 0),
    vessels: members.flatMap((m) => m.vessels),
  };
}

/**
 * Merges places within ZONE_MERGE_THRESHOLD_KM of each other into a single
 * map bubble (union-find over real-world distance, not screen pixels, so the
 * result doesn't depend on zoom/projection). Exported standalone so nearby
 * clusters like the French Riviera can be unit tested without a network call.
 */
export function clusterNearbyLocations(
  locations: MarketMovementLocation[],
  thresholdKm: number = ZONE_MERGE_THRESHOLD_KM,
): MarketMovementLocation[] {
  const parent = locations.map((_, i) => i);

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }

  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  for (let i = 0; i < locations.length; i++) {
    for (let j = i + 1; j < locations.length; j++) {
      if (haversineKm(locations[i], locations[j]) <= thresholdKm) {
        union(i, j);
      }
    }
  }

  const groups = new Map<number, MarketMovementLocation[]>();
  for (let i = 0; i < locations.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(locations[i]);
  }

  return Array.from(groups.values())
    .map(mergeZoneGroup)
    .sort((a, b) => b.total - a.total);
}

/**
 * Recent (default: last 14 days) new/sold vessel movements from the MLS-wide
 * Market Pulse feed, geocoded and aggregated by place for the map. Read-only
 * for the app; writes only happen via scripts/sync-market-pulse.ts.
 */
export async function getRecentMarketPulseMovements(
  options: { days?: number } = {},
): Promise<MarketMovementsResult> {
  const days = clampInteger(options.days, MARKET_PULSE_MAP_DAYS, MAX_MARKET_PULSE_MAP_DAYS);
  const since = getWindowStartDate(days);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('yatco_market_pulse')
    .select('*')
    .in('feed_type', ['new', 'sold'])
    .gte('scraped_at', since)
    .order('scraped_at', { ascending: false })
    .limit(MAX_MARKET_PULSE_MAP_ROWS);

  if (error) {
    console.error('[getRecentMarketPulseMovements] Error:', error);
    throw new Error(`Failed to fetch market pulse movements: ${error.message}`);
  }

  const result = buildMovementsResult(data || [], days);
  const zones = clusterNearbyLocations(result.locations);

  return { ...result, locations: zones, locatedPlaces: zones.length };
}
