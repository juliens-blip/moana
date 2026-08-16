import type {
  MarketSizeBandTable,
  YatcoMarketPulseEntry,
  YatcoMarketReviewSnapshot,
} from '@/lib/types';
import { createAdminClient } from './admin';

export const MARKET_PULSE_TREND_DAYS = 14;
export const MARKET_PULSE_TREND_LIMIT = 2_000;

const MAX_MARKET_PULSE_TREND_DAYS = 31;
const MAX_MARKET_PULSE_TREND_LIMIT = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeMarketSizeBandTable(value: unknown, metricName: string): MarketSizeBandTable {
  if (!isRecord(value)) {
    throw new Error(`Invalid market review snapshot: ${metricName} must be an object`);
  }

  const table: MarketSizeBandTable = {};

  for (const [band, values] of Object.entries(value)) {
    if (!isRecord(values)) {
      throw new Error(`Invalid market review snapshot: ${metricName}.${band} must be an object`);
    }

    table[band] = {};
    for (const [year, rawValue] of Object.entries(values)) {
      if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
        throw new Error(`Invalid market review snapshot: ${metricName}.${band}.${year} must be a string or number`);
      }

      table[band][year] = String(rawValue);
    }
  }

  return table;
}

function normalizeMarketReviewSnapshot(value: unknown): YatcoMarketReviewSnapshot {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.scraped_at !== 'string') {
    throw new Error('Invalid market review snapshot row');
  }

  if (!isRecord(value.size_bands)) {
    throw new Error('Invalid market review snapshot: size_bands must be an object');
  }

  const createdAt = typeof value.created_at === 'string' ? value.created_at : value.scraped_at;

  return {
    id: value.id,
    size_bands: {
      soldVessels: normalizeMarketSizeBandTable(value.size_bands.soldVessels, 'soldVessels'),
      totalSoldValue: normalizeMarketSizeBandTable(value.size_bands.totalSoldValue, 'totalSoldValue'),
      avgDaysOnMarket: normalizeMarketSizeBandTable(value.size_bands.avgDaysOnMarket, 'avgDaysOnMarket'),
    },
    scraped_at: value.scraped_at,
    created_at: createdAt,
  };
}

/**
 * Latest global market review snapshot (Sold Vessels/Total Sold Value/
 * Average Days on Market by size band). Read-only for the app; writes only
 * happen via scripts/sync-market-review.ts.
 */
export async function getLatestMarketReview(): Promise<YatcoMarketReviewSnapshot | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('yatco_market_review_snapshots')
    .select('*')
    .order('scraped_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[getLatestMarketReview] Error:', error);
    throw new Error(`Failed to fetch market review snapshot: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  try {
    return normalizeMarketReviewSnapshot(data);
  } catch (validationError) {
    console.error('[getLatestMarketReview] Invalid snapshot:', validationError);
    throw new Error('The latest market review snapshot has an invalid data format');
  }
}

export interface MarketPulseTrendOptions {
  days?: number;
  limit?: number;
}

function clampInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value as number), 1), maximum);
}

function getTrendStartDate(days: number): string {
  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startOfToday.setUTCDate(startOfToday.getUTCDate() - (days - 1));
  return startOfToday.toISOString();
}

/**
 * Bounded event-stream read for the prospective Market Pulse trend.
 * The chart aggregates the returned events by UTC day.
 */
export async function getMarketPulseTrendEntries(
  options: MarketPulseTrendOptions = {},
): Promise<YatcoMarketPulseEntry[]> {
  const days = clampInteger(options.days, MARKET_PULSE_TREND_DAYS, MAX_MARKET_PULSE_TREND_DAYS);
  const limit = clampInteger(options.limit, MARKET_PULSE_TREND_LIMIT, MAX_MARKET_PULSE_TREND_LIMIT);
  const since = getTrendStartDate(days);
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('yatco_market_pulse')
    .select('*')
    .gte('scraped_at', since)
    .order('scraped_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[getMarketPulseTrendEntries] Error:', error);
    throw new Error(`Failed to fetch market pulse trend: ${error.message}`);
  }

  return data || [];
}
