import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Make sure you have:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface MarketPulseRow {
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

async function main() {
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

  let synced = 0;
  let priceDrops = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (!row.vid || !row.vesselName) {
      console.warn('⚠️  Skipping row with missing vid/vesselName:', row);
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
    console.log(`✅ [${row.feedType}] ${row.vesselName} (vID ${row.vid})${row.isPriceDrop ? ` — PRICE DROP ${row.priceBeforeText} → ${row.priceAfterText}` : ''}`);
  }

  console.log(`\n📊 Résumé: ${synced} synced, ${priceDrops} price drops, ${errorCount} errors`);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
