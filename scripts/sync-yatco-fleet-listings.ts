import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ADMIN KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Make sure you have:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface FleetAuditRow {
  vid: string;
  mlsId: string;
  vesselName: string;
  askingPriceText: string;
  builder: string;
  modelYear: string;
  brokerName: string;
  loaText: string;
  status: string;
  agreementType: string;
  hasPhotoCover: boolean;
  photoCount: number;
  hasDescription: boolean;
  hasBrokerMessage: boolean;
  hasHullDeckSpecs: boolean;
  hasEngineSpecs: boolean;
  hasDimensions: boolean;
  hasSpeedCapacitySpecs: boolean;
  daysOnMarket: number | null;
  scrapeError?: string;
}

interface ListingRow {
  id: string;
  nom_bateau: string;
  yatco_vessel_id: string | null;
}

// U+0300-U+036F: combining diacritical marks left behind by NFD normalization
const COMBINING_DIACRITICS = new RegExp(`[\\u0300-\\u036f]`, 'g');

function normalize(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findLinkedListingId(row: FleetAuditRow, listings: ListingRow[]): string | null {
  const byVid = listings.find((l) => l.yatco_vessel_id === row.vid);
  if (byVid) return byVid.id;

  const rowNameNorm = normalize(row.vesselName);
  const nameMatches = listings.filter((l) => normalize(l.nom_bateau) === rowNameNorm);
  return nameMatches.length === 1 ? nameMatches[0].id : null;
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('❌ Usage: dotenv -e .env.local -- tsx scripts/sync-yatco-fleet-listings.ts <path-to-json>');
    process.exit(1);
  }

  const fullPath = path.resolve(jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const rows: FleetAuditRow[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  if (!Array.isArray(rows)) {
    console.error('❌ Expected a JSON array of vessel rows');
    process.exit(1);
  }

  console.log(`🚀 Syncing ${rows.length} YATCO fleet audit rows...\n`);

  const { data: listings, error: fetchError } = await supabase
    .from('listings')
    .select('id, nom_bateau, yatco_vessel_id');

  if (fetchError) {
    console.error('❌ Failed to fetch listings:', fetchError.message);
    process.exit(1);
  }

  const allListings: ListingRow[] = listings || [];

  let synced = 0;
  let linked = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (!row.vid || !row.vesselName) {
      console.warn('⚠️  Skipping row with missing vid/vesselName:', row);
      continue;
    }

    const linkedListingId = findLinkedListingId(row, allListings);
    if (linkedListingId) linked++;

    const modelYear = row.modelYear ? parseInt(row.modelYear, 10) : null;

    const { error } = await supabase.from('yatco_fleet_listings').upsert(
      {
        vid: row.vid,
        mls_id: row.mlsId || null,
        vessel_name: row.vesselName,
        status: row.status || null,
        agreement_type: row.agreementType || null,
        builder: row.builder || null,
        model_year: Number.isFinite(modelYear) ? modelYear : null,
        asking_price_text: row.askingPriceText || null,
        loa_text: row.loaText || null,
        broker_name: row.brokerName || null,
        photo_count: row.photoCount ?? 0,
        has_description: !!row.hasDescription,
        has_broker_message: !!row.hasBrokerMessage,
        has_hull_deck_specs: !!row.hasHullDeckSpecs,
        has_engine_specs: !!row.hasEngineSpecs,
        has_dimensions: !!row.hasDimensions,
        has_speed_capacity_specs: !!row.hasSpeedCapacitySpecs,
        days_on_market: row.daysOnMarket ?? null,
        linked_listing_id: linkedListingId,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'vid' }
    );

    if (error) {
      console.error(`❌ ${row.vesselName} (vID ${row.vid}):`, error.message);
      errorCount++;
      continue;
    }

    synced++;
    console.log(`✅ ${row.vesselName} (vID ${row.vid}) — ${row.photoCount} photos, linked=${!!linkedListingId}`);
  }

  console.log(`\n📊 Résumé: ${synced} synced, ${linked} linked to Moana listings, ${errorCount} errors`);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
