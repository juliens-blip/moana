import type { MarketMovementsResult, YatcoMarketPulseEntry } from '@/lib/types';
import { geocodeLocation } from '@/lib/geo/geocode';
import { createAdminClient } from './admin';

export const MARKET_PULSE_MAP_DAYS = 14;

const MAX_MARKET_PULSE_MAP_DAYS = 31;
const MAX_MARKET_PULSE_MAP_ROWS = 5_000;

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

  return buildMovementsResult(data || [], days);
}
