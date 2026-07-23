import cityData from './city-coords.json';
import countryData from './country-centroids.json';

// Offline geocoder for yatco_market_pulse `location` values, which follow the
// shape "City, Region, Country" (e.g. "Genoa, Liguria, Italy",
// "Cruising Budva, Budva Municipality, Montenegro"). City resolves first, with a
// guaranteed country-centroid fallback. Zero runtime network / no external deps.

type CoordTable = Record<string, unknown>;
const CITY_COORDS = cityData as CoordTable;
const COUNTRY_CENTROIDS = countryData as CoordTable;

// U+0300-U+036F: combining diacritical marks left behind by NFD normalization.
// Built from char codes (not a literal escape) so the source file stays plain ASCII.
const COMBINING_DIACRITICS = new RegExp(`[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`, 'g');

// Copied (not imported — scripts/ is excluded from the build) from
// scripts/sync-yatco-stats.ts:48 so the geocoder stays self-contained.
export function normalize(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Copied from scripts/sync-yatco-stats.ts:102, extended with a few extra
// French/English country spellings seen in the yacht market.
const COUNTRY_ALIASES: Record<string, string> = {
  turquie: 'turkey',
  turkiye: 'turkey',
  grece: 'greece',
  espagne: 'spain',
  italie: 'italy',
  malte: 'malta',
  croatie: 'croatia',
  singapour: 'singapore',
  emirats: 'united arab emirates',
  allemagne: 'germany',
  'etats unis': 'united states',
  usa: 'united states',
  uae: 'united arab emirates',
  bahamas: 'the bahamas',
};

export type GeocodeResult =
  | { lat: number; lon: number; resolved: 'city'; city: string; country: string }
  | { lat: number; lon: number; resolved: 'country'; city?: string; country: string }
  | { lat: null; lon: null; resolved: 'none'; city?: string; country?: string };

function lookup(table: CoordTable, key: string): [number, number] | null {
  if (!key || key.startsWith('_')) return null;
  const value = table[key];
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    return [value[0], value[1]];
  }
  return null;
}

/**
 * Resolve a free-text "City, Region, Country" location to coordinates.
 * City match wins; otherwise falls back to the country centroid.
 */
export function geocodeLocation(raw: string | null | undefined): GeocodeResult {
  if (!raw || !raw.trim()) return { lat: null, lon: null, resolved: 'none' };

  const tokens = raw.split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return { lat: null, lon: null, resolved: 'none' };

  const countryRaw = tokens[tokens.length - 1];
  const cityRaw = tokens[0].replace(/^cruising\s+/i, '').trim();

  const cityKey = normalize(cityRaw);
  const countryNorm = normalize(countryRaw);
  const countryKey = COUNTRY_ALIASES[countryNorm] ?? countryNorm;

  const cityHit = lookup(CITY_COORDS, cityKey);
  if (cityHit) {
    return { lon: cityHit[0], lat: cityHit[1], resolved: 'city', city: cityRaw, country: countryRaw };
  }

  const countryHit = lookup(COUNTRY_CENTROIDS, countryKey);
  if (countryHit) {
    return { lon: countryHit[0], lat: countryHit[1], resolved: 'country', city: cityRaw || undefined, country: countryRaw };
  }

  return { lat: null, lon: null, resolved: 'none', city: cityRaw || undefined, country: countryRaw || undefined };
}
