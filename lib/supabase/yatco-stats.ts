import type { Listing, YatcoListingStats } from '@/lib/types';
import { createAdminClient } from './admin';

/**
 * Get the full stats history for a listing, oldest first (chart-ready order).
 */
export async function getYatcoStatsHistory(listingId: string): Promise<YatcoListingStats[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('yatco_listing_stats')
    .select('*')
    .eq('listing_id', listingId)
    .order('snapshot_date', { ascending: true });

  if (error) {
    console.error('[getYatcoStatsHistory] Error:', error);
    throw new Error(`Failed to fetch YATCO stats history: ${error.message}`);
  }

  return data || [];
}

export interface YatcoStatsSnapshotInput {
  listingId: string;
  snapshotDate?: string; // YYYY-MM-DD, defaults to today if omitted
  impressions?: number;
  detailViews?: number;
  phoneClicks?: number;
  galleryViews?: number;
  leads?: number;
  source?: 'manual_refresh' | 'backfill';
}

/**
 * Append (or overwrite, if same day already exists) a stats snapshot.
 * Used exclusively by scripts/sync-yatco-stats.ts.
 */
export async function upsertYatcoStatsSnapshot(
  input: YatcoStatsSnapshotInput
): Promise<YatcoListingStats> {
  const supabase = createAdminClient();

  const row = {
    listing_id: input.listingId,
    snapshot_date: input.snapshotDate ?? new Date().toISOString().slice(0, 10),
    impressions: input.impressions,
    detail_views: input.detailViews,
    phone_clicks: input.phoneClicks,
    gallery_views: input.galleryViews,
    leads: input.leads,
    source: input.source ?? 'manual_refresh',
  };

  const { data, error } = await supabase
    .from('yatco_listing_stats')
    .upsert(row, { onConflict: 'listing_id,snapshot_date' })
    .select()
    .single();

  if (error) {
    console.error('[upsertYatcoStatsSnapshot] Error:', error);
    throw new Error(`Failed to upsert YATCO stats snapshot: ${error.message}`);
  }

  return data;
}

/**
 * All listings with just the fields needed for name+builder matching.
 * Used exclusively by scripts/sync-yatco-stats.ts.
 */
export async function getListingsForYatcoMatching(): Promise<
  Pick<Listing, 'id' | 'nom_bateau' | 'constructeur' | 'yatco_vessel_id'>[]
> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listings')
    .select('id, nom_bateau, constructeur, yatco_vessel_id');

  if (error) {
    console.error('[getListingsForYatcoMatching] Error:', error);
    throw new Error(`Failed to fetch listings for matching: ${error.message}`);
  }

  return data || [];
}

/**
 * Set/overwrite the YATCO vID link on a listing.
 */
export async function linkListingToYatcoVessel(
  listingId: string,
  vesselId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listings')
    .update({ yatco_vessel_id: vesselId })
    .eq('id', listingId);

  if (error) {
    console.error('[linkListingToYatcoVessel] Error:', error);
    throw new Error(`Failed to link listing to YATCO vessel: ${error.message}`);
  }
}
