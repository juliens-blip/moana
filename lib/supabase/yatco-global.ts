import { createAdminClient } from '@/lib/supabase/admin';
import { YatcoGlobalListing, YatcoGlobalListingsResponse, YatcoPriceFluctuation } from '@/lib/types';
import { YatcoGlobalQueryInput } from '@/lib/validations';

const PAGE_SIZE = 25;

interface YatcoSelectionCandidateRow {
  id: string;
  source: string;
  external_id: string;
  listing_url?: string;
  boat_name?: string;
  builder?: string;
  model?: string;
  model_year?: number;
  length_m?: number;
  price_amount?: number;
  price_currency?: string;
  price_usd?: number;
  country?: string;
  country_code?: string;
  city?: string;
  source_updated_at?: string;
  dedup_key: string;
}

interface YatcoPriceDeltaRow {
  dedup_key: string;
  observed_at: string;
  price_usd: number | null;
  previous_price_usd: number | null;
  price_delta_usd: number | null;
  price_delta_pct: number | null;
}

/**
 * Fetch the latest price fluctuation (previous/current/delta/percentage) per
 * dedup_key from public.yatco_listing_price_deltas.
 */
async function getLatestPriceFluctuations(
  dedupKeys: string[]
): Promise<Map<string, YatcoPriceFluctuation>> {
  const fluctuations = new Map<string, YatcoPriceFluctuation>();
  if (dedupKeys.length === 0) return fluctuations;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('yatco_listing_price_deltas')
    .select('dedup_key, observed_at, price_usd, previous_price_usd, price_delta_usd, price_delta_pct')
    .in('dedup_key', dedupKeys)
    .order('observed_at', { ascending: false });

  if (error) {
    console.error('[YatcoGlobal] Error fetching price deltas:', error);
    return fluctuations;
  }

  for (const row of (data ?? []) as YatcoPriceDeltaRow[]) {
    if (fluctuations.has(row.dedup_key)) continue;
    fluctuations.set(row.dedup_key, {
      previous_price_usd: row.previous_price_usd,
      current_price_usd: row.price_usd,
      price_delta_usd: row.price_delta_usd,
      price_delta_pct: row.price_delta_pct
    });
  }

  return fluctuations;
}

/**
 * List deduplicated YATCO global listings selected on freshness
 * (first_seen_at/updated_at — our ingestion timestamps, not YATCO's own
 * source_created_at/source_updated_at which barely ever fall within a 72h
 * window) within freshnessHours, minLengthMeters, and minYear, ordered by
 * updated_at DESC, enriched with price fluctuation. Server-only: relies on
 * the service_role admin client, never import from client-side code.
 */
export async function getYatcoGlobalListings(
  filters: YatcoGlobalQueryInput
): Promise<YatcoGlobalListingsResponse> {
  const supabase = createAdminClient();
  const page = filters.page ?? 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const freshnessHours = filters.freshnessHours ?? 72;
  const minLengthMeters = filters.minLengthMeters ?? 26;
  const minYear = filters.minYear ?? 2010;

  let query = supabase
    .from('yatco_selection_candidates')
    .select(
      'id, source, external_id, listing_url, boat_name, builder, model, model_year, length_m, price_amount, price_currency, price_usd, country, country_code, city, source_updated_at, dedup_key',
      { count: 'exact' }
    )
    .order('updated_at', { ascending: false, nullsFirst: false });

  const freshnessThreshold = new Date(Date.now() - freshnessHours * 60 * 60 * 1000).toISOString();
  query = query.or(
    `first_seen_at.gte.${freshnessThreshold},updated_at.gte.${freshnessThreshold}`
  );
  query = query.gt('length_m', minLengthMeters);
  query = query.gte('model_year', minYear);

  if (filters.country) {
    query = query.ilike('country', filters.country);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error('[YatcoGlobal] Error fetching listings:', error);
    throw new Error(`Failed to fetch YATCO global listings: ${error.message}`);
  }

  const rows = (data ?? []) as YatcoSelectionCandidateRow[];
  const fluctuations = await getLatestPriceFluctuations(rows.map((row) => row.dedup_key));

  const total = count ?? 0;

  return {
    listings: rows.map(({ dedup_key, ...listing }) => ({
      ...listing,
      price_fluctuation: fluctuations.get(dedup_key) ?? null
    })) as YatcoGlobalListing[],
    pagination: {
      page,
      limit: PAGE_SIZE,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / PAGE_SIZE)
    }
  };
}
