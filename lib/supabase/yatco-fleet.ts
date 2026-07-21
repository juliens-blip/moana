import type { YatcoFleetListing } from '@/lib/types';
import { createAdminClient } from './admin';

/**
 * All fleet audit rows, most recently synced content first within each status.
 * Read-only for the app; writes only happen via scripts/sync-yatco-fleet-listings.ts.
 */
export async function getFleetAuditListings(): Promise<YatcoFleetListing[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('yatco_fleet_listings')
    .select('*')
    .order('status', { ascending: true })
    .order('vessel_name', { ascending: true });

  if (error) {
    console.error('[getFleetAuditListings] Error:', error);
    throw new Error(`Failed to fetch YATCO fleet audit listings: ${error.message}`);
  }

  return data || [];
}

export interface FleetListingUpsertInput {
  vid: string;
  mlsId?: string | null;
  vesselName: string;
  status?: string | null;
  agreementType?: string | null;
  builder?: string | null;
  modelYear?: number | null;
  askingPriceText?: string | null;
  loaText?: string | null;
  brokerName?: string | null;
  photoCount: number;
  hasDescription: boolean;
  hasBrokerMessage: boolean;
  hasHullDeckSpecs: boolean;
  hasEngineSpecs: boolean;
  hasDimensions: boolean;
  hasSpeedCapacitySpecs: boolean;
  daysOnMarket?: number | null;
  linkedListingId?: string | null;
}

/**
 * Upsert a single fleet audit row by vid. Used exclusively by
 * scripts/sync-yatco-fleet-listings.ts.
 */
export async function upsertFleetListing(input: FleetListingUpsertInput): Promise<void> {
  const supabase = createAdminClient();

  const row = {
    vid: input.vid,
    mls_id: input.mlsId ?? null,
    vessel_name: input.vesselName,
    status: input.status ?? null,
    agreement_type: input.agreementType ?? null,
    builder: input.builder ?? null,
    model_year: input.modelYear ?? null,
    asking_price_text: input.askingPriceText ?? null,
    loa_text: input.loaText ?? null,
    broker_name: input.brokerName ?? null,
    photo_count: input.photoCount,
    has_description: input.hasDescription,
    has_broker_message: input.hasBrokerMessage,
    has_hull_deck_specs: input.hasHullDeckSpecs,
    has_engine_specs: input.hasEngineSpecs,
    has_dimensions: input.hasDimensions,
    has_speed_capacity_specs: input.hasSpeedCapacitySpecs,
    days_on_market: input.daysOnMarket ?? null,
    linked_listing_id: input.linkedListingId ?? null,
    last_synced_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('yatco_fleet_listings')
    .upsert(row, { onConflict: 'vid' });

  if (error) {
    console.error('[upsertFleetListing] Error:', error);
    throw new Error(`Failed to upsert fleet listing ${input.vid}: ${error.message}`);
  }
}

/**
 * All listings with just the fields needed for vid/name matching.
 * Used exclusively by scripts/sync-yatco-fleet-listings.ts.
 */
export async function getListingsForFleetMatching(): Promise<
  { id: string; nom_bateau: string; yatco_vessel_id: string | null }[]
> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listings')
    .select('id, nom_bateau, yatco_vessel_id');

  if (error) {
    console.error('[getListingsForFleetMatching] Error:', error);
    throw new Error(`Failed to fetch listings for fleet matching: ${error.message}`);
  }

  return data || [];
}
