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

interface YatcoScrapedVessel {
  vesselName: string;
  builder: string;
  vesselId: string; // YATCO vID (from ?vID=... in the URL)
  impressions?: number;
  detailViews?: number;
  phoneClicks?: number;
  galleryViews?: number;
  leads?: number;
  snapshotDate?: string; // optional YYYY-MM-DD override, defaults to today
  // Optional specs, used as a secondary matching signal when the vessel's
  // YATCO name doesn't match any nom_bateau (e.g. YATCO shows a model name
  // like "SUNSEEKER 115" for a boat the app knows as "MAORO").
  loaMeters?: number;
  price?: number; // asking price, in the vessel's own listing currency (mostly EUR)
  city?: string;
  country?: string;
}

interface ListingRow {
  id: string;
  nom_bateau: string;
  constructeur: string;
  longueur_m: number | null;
  prix_actuel: string | null;
  localisation: string | null;
  yatco_vessel_id: string | null;
}

function normalize(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Best-effort parse of the free-text `prix_actuel` field ("12.3M\u20ac Ex VAT",
// "5.990.000\u20ac", "690K\u20ac", "2,200,000", "POA"...) into a plain EUR-ish number.
// Returns null for anything that isn't a real price (POA, N/A, off market...).
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/POA|N\/A|OFF\s*MARKET|^$/i.test(s)) return null;

  const m = s.match(/[\d.,]+\s*[MmKk]?/);
  if (!m) return null;
  const token = m[0].trim();
  const suffix = token.match(/[MmKk]$/);
  let numPart = suffix ? token.slice(0, -1) : token;

  if (suffix) {
    numPart = numPart.replace(/,/g, '');
    const val = parseFloat(numPart);
    if (isNaN(val)) return null;
    return val * (suffix[0].toLowerCase() === 'm' ? 1e6 : 1e3);
  }

  const commaCount = (numPart.match(/,/g) || []).length;
  const dotCount = (numPart.match(/\./g) || []).length;
  let cleaned = numPart;
  if (commaCount > 0 && dotCount > 0) {
    cleaned = numPart.replace(/[.,](?=.*[.,])/g, '');
  } else if (dotCount > 1) {
    cleaned = numPart.replace(/\./g, '');
  } else if (dotCount === 1) {
    const frac = numPart.split('.')[1];
    if (frac.length <= 2 && parseFloat(numPart) < 1000) return parseFloat(numPart) * 1e6;
    cleaned = numPart.replace(/\./g, '');
  } else if (commaCount > 1) {
    cleaned = numPart.replace(/,/g, '');
  } else if (commaCount === 1) {
    const frac = numPart.split(',')[1];
    if (frac.length <= 2 && parseFloat(numPart.replace(',', '.')) < 1000) {
      return parseFloat(numPart.replace(',', '.')) * 1e6;
    }
    cleaned = numPart.replace(/,/g, '');
  }
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : val;
}

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
};

function locationTokens(value: string | null | undefined): string[] {
  return normalize(value)
    .split(' ')
    .filter(Boolean)
    .map((t) => COUNTRY_ALIASES[t] || t);
}

// Secondary matcher: used only when exact name matching found zero (or more
// than one, i.e. ambiguous) candidates. Requires the listing's LOA to be
// within 15cm of the YATCO LOA, *plus* a tight price match (<=6%) OR both a
// location and builder match \u2014 deliberately conservative, since a wrong
// automatic link would silently corrupt another listing's stats history.
function findSpecMatch(row: YatcoScrapedVessel, candidates: ListingRow[]): ListingRow | null {
  if (!row.loaMeters) return null;

  const rowLocToks = [...locationTokens(row.city), ...locationTokens(row.country)];
  const rowBuilderNorm = normalize(row.builder);

  const hits = candidates.filter((l) => {
    if (!l.longueur_m || Math.abs(l.longueur_m - row.loaMeters!) > 0.15) return false;

    const listingPrice = parsePrice(l.prix_actuel);
    const priceMatch =
      listingPrice !== null && row.price !== undefined && row.price > 0
        ? Math.abs(listingPrice - row.price) / Math.max(listingPrice, row.price) <= 0.06
        : false;

    const listingLocToks = locationTokens(l.localisation);
    const locationMatch = listingLocToks.some((t) => t.length > 2 && rowLocToks.includes(t));

    const listingBuilderNorm = normalize(l.constructeur);
    const builderMatch =
      !!listingBuilderNorm &&
      !!rowBuilderNorm &&
      (listingBuilderNorm.includes(rowBuilderNorm) ||
        rowBuilderNorm.includes(listingBuilderNorm) ||
        listingBuilderNorm.split(' ').some((w) => w.length > 3 && rowBuilderNorm.includes(w)));

    return priceMatch || (locationMatch && builderMatch);
  });

  return hits.length === 1 ? hits[0] : null;
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('❌ Usage: dotenv -e .env.local -- tsx scripts/sync-yatco-stats.ts <path-to-json>');
    process.exit(1);
  }

  const fullPath = path.resolve(jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const rows: YatcoScrapedVessel[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  if (!Array.isArray(rows)) {
    console.error('❌ Expected a JSON array of vessel rows');
    process.exit(1);
  }

  console.log(`🚀 Syncing ${rows.length} YATCO vessel rows...\n`);

  const { data: listings, error: fetchError } = await supabase
    .from('listings')
    .select('id, nom_bateau, constructeur, longueur_m, prix_actuel, localisation, yatco_vessel_id');

  if (fetchError) {
    console.error('❌ Failed to fetch listings:', fetchError.message);
    process.exit(1);
  }

  const allListings: ListingRow[] = listings || [];

  let linkedNow = 0;
  let alreadyLinked = 0;
  let skippedNoMatch = 0;
  let skippedAmbiguous = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      if (!row.vesselId || !row.vesselName) {
        console.warn('⚠️  Skipping row with missing vesselId/vesselName:', row);
        skippedNoMatch++;
        continue;
      }

      // 1. Already linked by vID? Just append a snapshot, no re-matching.
      let target = allListings.find((l) => l.yatco_vessel_id === row.vesselId);

      if (target) {
        alreadyLinked++;
      } else {
        // 2. Match among UNLINKED listings only (never steal a link from
        //    an already-matched listing).
        const candidates = allListings.filter((l) => !l.yatco_vessel_id);
        const normName = normalize(row.vesselName);
        const normBuilder = normalize(row.builder);

        let exact = candidates.filter((l) => normalize(l.nom_bateau) === normName);

        if (exact.length > 1) {
          // Tie-break with builder.
          exact = exact.filter((l) => normalize(l.constructeur) === normBuilder);
        }

        if (exact.length === 1) {
          target = exact[0];
        } else if (exact.length === 0) {
          // Name matching failed — YATCO sometimes shows a generic model
          // name (e.g. "SUNSEEKER 115") for a boat the app knows by its
          // given name (e.g. "MAORO"). Fall back to LOA + price/location.
          const specMatch = findSpecMatch(row, candidates);
          if (specMatch) {
            target = specMatch;
            console.log(`   📐 Matched via size/price/location instead of name`);
          } else {
            console.warn(`⚠️  No match for "${row.vesselName}" (${row.builder}) — skipping`);
            skippedNoMatch++;
            continue;
          }
        } else {
          const specMatch = findSpecMatch(row, exact);
          if (specMatch) {
            target = specMatch;
            console.log(`   📐 Ambiguous name match resolved via size/price/location`);
          } else {
            console.warn(
              `⚠️  Ambiguous match for "${row.vesselName}" (${row.builder}): ${exact.length} candidates — skipping`
            );
            skippedAmbiguous++;
            continue;
          }
        }

        const { error: linkError } = await supabase
          .from('listings')
          .update({ yatco_vessel_id: row.vesselId })
          .eq('id', target.id);

        if (linkError) throw linkError;

        target.yatco_vessel_id = row.vesselId; // keep local cache consistent
        linkedNow++;
        console.log(`✅ Linked "${target.nom_bateau}" -> vID ${row.vesselId}`);
      }

      const { error: snapshotError } = await supabase
        .from('yatco_listing_stats')
        .upsert(
          {
            listing_id: target.id,
            snapshot_date: row.snapshotDate ?? new Date().toISOString().slice(0, 10),
            impressions: row.impressions,
            detail_views: row.detailViews,
            phone_clicks: row.phoneClicks,
            gallery_views: row.galleryViews,
            leads: row.leads,
          },
          { onConflict: 'listing_id,snapshot_date' }
        );

      if (snapshotError) throw snapshotError;

      console.log(`   📊 Snapshot saved for "${target.nom_bateau}"`);
    } catch (error) {
      errorCount++;
      console.error(`❌ Error processing row for "${row?.vesselName}":`, error);
      // Never rethrow — continue to the next row.
    }
  }

  console.log('\n📊 Summary:');
  console.log(`   ✅ Newly linked: ${linkedNow}`);
  console.log(`   🔗 Already linked (snapshot only): ${alreadyLinked}`);
  console.log(`   ⚠️  Skipped (no match): ${skippedNoMatch}`);
  console.log(`   ⚠️  Skipped (ambiguous): ${skippedAmbiguous}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\n❌ Sync failed:', error);
  process.exit(1);
});
