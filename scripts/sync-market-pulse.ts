import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface MarketPulseRow {
  feedType: 'new' | 'modified' | 'sold';
  vid: string;
  vesselName: string;
  mlsId: string | null;
  builder: string | null;
  modelYear: string | null;
  category: string | null;
  loaText: string | null;
  priceText: string | null;
  location: string | null;
  soldDate: string | null;
  brokerName: string | null;
  historyText: string | null;
  isPriceDrop: boolean;
  priceBeforeText: string | null;
  priceAfterText: string | null;
}

export interface GlobalListingPatch {
  externalId: string;
  patch: Record<string, unknown>;
}

export function parseBossNumber(value: string | null): number | null {
  const match = value?.match(/\d[\d .,]*/);
  if (!match) return null;

  let raw = match[0].replace(/\s/g, '');
  const commaCount = (raw.match(/,/g) || []).length;
  const dotCount = (raw.match(/\./g) || []).length;

  if (commaCount > 0 && dotCount > 0) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if (commaCount > 1) {
    raw = raw.replace(/,/g, '');
  } else if (commaCount === 1) {
    const decimalPlaces = raw.length - raw.lastIndexOf(',') - 1;
    raw = decimalPlaces === 3 ? raw.replace(',', '') : raw.replace(',', '.');
  } else if (dotCount > 1) {
    raw = raw.replace(/\./g, '');
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitLocation(value: string | null): { city: string | null; country: string | null } {
  const parts = (value || '').split(',').map((part) => part.trim()).filter(Boolean);
  return {
    city: parts[0] || null,
    country: parts.length > 1 ? parts.at(-1) || null : null,
  };
}

export function buildGlobalListingPatch(
  row: MarketPulseRow,
  observedAt: string,
  previousRawPayload: Record<string, unknown> = {},
): GlobalListingPatch | null {
  const externalId = String(row.mlsId || row.vid || '').trim();
  if (!externalId || !row.vesselName) return null;

  const modelYear = row.modelYear ? Number.parseInt(row.modelYear, 10) : null;
  const lengthM = parseBossNumber(row.loaText);
  const priceAmount = parseBossNumber(row.priceText);
  const priceCurrency = row.priceText?.match(/\b(EUR|USD|GBP|CHF)\b/i)?.[1]?.toUpperCase() || null;
  const location = splitLocation(row.location);

  const patch: Record<string, unknown> = {
    last_seen_at: observedAt,
    // BOSS does not expose an exact publication timestamp for new/modified
    // rows. This is explicitly the moment the event was observed in the
    // authenticated report, not an invented publication date.
    source_updated_at: observedAt,
    listing_status: row.feedType === 'sold' ? 'Sold' : 'Active',
    raw_payload: {
      ...previousRawPayload,
      yatco_boss: row,
      boss_observed_at: observedAt,
      boss_feed_type: row.feedType,
    },
  };

  const optionalFields: Record<string, unknown> = {
    boat_name: row.vesselName,
    builder: row.builder,
    model_year: Number.isFinite(modelYear) ? modelYear : null,
    length_m: lengthM,
    price_amount: priceAmount,
    price_currency: priceCurrency,
    city: location.city,
    country: location.country,
    broker_company: row.brokerName,
  };
  for (const [field, value] of Object.entries(optionalFields)) {
    if (value !== null && value !== undefined && value !== '') patch[field] = value;
  }
  if (priceCurrency === 'USD' && priceAmount !== null) patch.price_usd = priceAmount;

  return { externalId, patch };
}

async function syncGlobalListing(
  supabase: SupabaseClient,
  row: MarketPulseRow,
  observedAt: string,
): Promise<boolean> {
  const identity = String(row.mlsId || row.vid || '').trim();
  if (!identity) return false;

  const { data: existing, error: readError } = await supabase
    .from('yatco_global_listings')
    .select('id, raw_payload')
    .eq('source', 'yatco')
    .eq('external_id', identity)
    .limit(1)
    .maybeSingle();
  if (readError) throw new Error(`global lookup failed: ${readError.message}`);

  const previousRawPayload = existing?.raw_payload && typeof existing.raw_payload === 'object'
    ? existing.raw_payload as Record<string, unknown>
    : {};
  const built = buildGlobalListingPatch(row, observedAt, previousRawPayload);
  if (!built) return false;

  const write = existing
    ? await supabase.from('yatco_global_listings').update(built.patch).eq('id', existing.id)
    : await supabase.from('yatco_global_listings').insert({
        source: 'yatco',
        external_id: built.externalId,
        ...built.patch,
      });
  if (write.error) throw new Error(`global write failed: ${write.error.message}`);
  return true;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('❌ Usage: dotenv -e .env.local -- tsx scripts/sync-market-pulse.ts <path-to-json>');
    process.exit(1);
  }

  const fullPath = path.resolve(jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const rows: MarketPulseRow[] = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  if (!Array.isArray(rows)) {
    console.error('❌ Expected a JSON array of market pulse rows');
    process.exit(1);
  }

  const scrapedAt = new Date().toISOString();
  console.log(`🚀 Syncing ${rows.length} market pulse rows (scraped_at=${scrapedAt})...\n`);

  const dayStart = `${scrapedAt.slice(0, 10)}T00:00:00.000Z`;
  const { data: existingRows, error: existingError } = await supabase
    .from('yatco_market_pulse')
    .select('vid, feed_type')
    .gte('scraped_at', dayStart);

  if (existingError) {
    console.error('❌ Failed to check existing Market Pulse rows:', existingError.message);
    process.exit(1);
  }

  const existingKeys = new Set(
    (existingRows || []).map((row) => `${row.vid}:${row.feed_type}`)
  );

  let synced = 0;
  let skippedExisting = 0;
  let priceDrops = 0;
  let errorCount = 0;
  let globalSynced = 0;
  let globalErrorCount = 0;

  for (const [rowIndex, row] of rows.entries()) {
    if (!row.vid || !row.vesselName) {
      console.warn('⚠️  Skipping row with missing vid/vesselName:', row);
      continue;
    }

    try {
      // Preserve BOSS report order (new, then modified, then sold) when all
      // rows are observed during the same run, without claiming distinct
      // source publication times in the UI.
      const observedAt = new Date(Date.parse(scrapedAt) - rowIndex).toISOString();
      if (await syncGlobalListing(supabase, row, observedAt)) globalSynced++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ YATCO Global ${row.vesselName} (MLS ${row.mlsId || row.vid}): ${message}`);
      globalErrorCount++;
    }

    const eventKey = `${row.vid}:${row.feedType}`;
    if (existingKeys.has(eventKey)) {
      skippedExisting++;
      continue;
    }

    const modelYear = row.modelYear ? parseInt(row.modelYear, 10) : null;

    const { error } = await supabase.from('yatco_market_pulse').upsert(
      {
        feed_type: row.feedType,
        vid: row.vid,
        mls_id: row.mlsId || null,
        vessel_name: row.vesselName,
        builder: row.builder || null,
        model_year: Number.isFinite(modelYear) ? modelYear : null,
        category: row.category || null,
        loa_text: row.loaText || null,
        price_text: row.priceText || null,
        location: row.location || null,
        broker_name: row.brokerName || null,
        history_text: row.historyText || null,
        is_price_drop: !!row.isPriceDrop,
        price_before_text: row.priceBeforeText || null,
        price_after_text: row.priceAfterText || null,
        sold_date: row.soldDate || null,
        scraped_at: scrapedAt,
      },
      { onConflict: 'vid,feed_type,scraped_at' }
    );

    if (error) {
      console.error(`❌ ${row.vesselName} (vID ${row.vid}, ${row.feedType}):`, error.message);
      errorCount++;
      continue;
    }

    if (row.isPriceDrop) priceDrops++;
    synced++;
    existingKeys.add(eventKey);
    console.log(`✅ [${row.feedType}] ${row.vesselName} (vID ${row.vid})${row.isPriceDrop ? ` — PRICE DROP ${row.priceBeforeText} → ${row.priceAfterText}` : ''}`);
  }

  console.log(`\n📊 Résumé Market Pulse: ${synced} synced, ${skippedExisting} already present today, ${priceDrops} price drops, ${errorCount} errors`);
  console.log(`📊 Résumé YATCO Global: ${globalSynced} current BOSS listings synced, ${globalErrorCount} errors`);

  if (errorCount > 0 || globalErrorCount > 0) {
    process.exitCode = 1;
  }
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;
if (isMainModule) {
  main().catch((err) => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
  });
}
