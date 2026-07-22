import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ScrapedStatsRow {
  mlsId: string | null;
  vesselName: string;
  loaText: string;
  impressions: number;
  detailViews: number;
  phoneClicks: number;
  galleryViews: number;
  leads: number;
}

interface FleetListingRow {
  id: string;
  vid: string;
  mls_id: string | null;
  vessel_name: string;
  builder: string | null;
}

// Extracts the meters figure from a mixed LOA string, e.g. "278' 11\" (85.00m)" -> 85.00, "26.88m" -> 26.88.
function parseLoaMeters(text: string | null | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([\d.]+)\s*m\b/i);
  return m ? parseFloat(m[1]) : undefined;
}

async function main() {
  const jsonPath = process.argv[2];
  const bridgeOutPath = process.argv[3] ?? path.resolve(path.dirname(jsonPath || '.'), 'yatco-stats-bridge.json');

  if (!jsonPath) {
    console.error('❌ Usage: dotenv -e .env.local -- tsx scripts/sync-vessel-visibility-stats.ts <path-to-vessel-stats.json> [bridge-out-path]');
    process.exit(1);
  }

  const fullPath = path.resolve(jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const rows: ScrapedStatsRow[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  if (!Array.isArray(rows)) {
    console.error('❌ Expected a JSON array of vessel stats rows');
    process.exit(1);
  }

  console.log(`🚀 Syncing ${rows.length} vessel visibility stats rows...\n`);

  const { data: fleetListings, error: fetchError } = await supabase
    .from('yatco_fleet_listings')
    .select('id, vid, mls_id, vessel_name, builder');

  if (fetchError) {
    console.error('❌ Failed to fetch yatco_fleet_listings:', fetchError.message);
    process.exit(1);
  }

  const allFleetListings: FleetListingRow[] = fleetListings || [];
  const syncedAt = new Date().toISOString();

  let matched = 0;
  let unmatched = 0;
  let errorCount = 0;
  const bridgeRows: Array<Record<string, unknown>> = [];

  for (const row of rows) {
    const target = allFleetListings.find((l) => l.mls_id === row.mlsId);

    if (!target) {
      console.warn(`⚠️  No yatco_fleet_listings match for "${row.vesselName}" (MLS ${row.mlsId}) — skipping`);
      unmatched++;
      continue;
    }

    const { error } = await supabase
      .from('yatco_fleet_listings')
      .update({
        stats_impressions: row.impressions,
        stats_detail_views: row.detailViews,
        stats_phone_clicks: row.phoneClicks,
        stats_gallery_views: row.galleryViews,
        stats_leads: row.leads,
        stats_synced_at: syncedAt,
      })
      .eq('id', target.id);

    if (error) {
      console.error(`❌ ${row.vesselName} (vID ${target.vid}):`, error.message);
      errorCount++;
      continue;
    }

    matched++;
    console.log(`✅ ${row.vesselName} (vID ${target.vid}) — ${row.impressions} impressions, ${row.leads} leads`);

    // Bridge row for the existing scripts/sync-yatco-stats.ts (unmodified),
    // which links listings.yatco_vessel_id and appends to yatco_listing_stats.
    bridgeRows.push({
      vesselName: row.vesselName,
      builder: target.builder ?? '',
      vesselId: target.vid,
      impressions: row.impressions,
      detailViews: row.detailViews,
      phoneClicks: row.phoneClicks,
      galleryViews: row.galleryViews,
      leads: row.leads,
      loaMeters: parseLoaMeters(row.loaText),
    });
  }

  fs.writeFileSync(bridgeOutPath, JSON.stringify(bridgeRows, null, 2));

  console.log(`\n📊 Résumé: ${matched} matched (fleet cards updated), ${unmatched} unmatched, ${errorCount} errors`);
  console.log(`📄 Bridge file written for scripts/sync-yatco-stats.ts: ${bridgeOutPath}`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
