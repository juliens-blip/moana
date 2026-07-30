import type { YatcoMarketPulseEntry } from '@/lib/types';
import { createAdminClient } from './admin';

export interface MarketPulseFilter {
  feedType?: 'new' | 'modified' | 'sold';
  priceDropOnly?: boolean;
}

/**
 * Latest market pulse feed (comps, price drops), most recent scrape first.
 * Read-only for the app; writes only happen via scripts/sync-market-pulse.ts.
 */
export async function getMarketPulseFeed(filter?: MarketPulseFilter): Promise<YatcoMarketPulseEntry[]> {
  const supabase = createAdminClient();

  let query = supabase
    .from('yatco_market_pulse')
    .select('*')
    .order('scraped_at', { ascending: false });

  if (filter?.feedType) {
    query = query.eq('feed_type', filter.feedType);
  }
  if (filter?.priceDropOnly) {
    query = query.eq('is_price_drop', true);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[getMarketPulseFeed] Error:', error);
    throw new Error(`Failed to fetch market pulse feed: ${error.message}`);
  }

  return data || [];
}
