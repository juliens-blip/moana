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

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('❌ Usage: dotenv -e .env.local -- tsx scripts/sync-market-review.ts <path-to-market-review.json>');
    process.exit(1);
  }

  const fullPath = path.resolve(jsonPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ File not found: ${fullPath}`);
    process.exit(1);
  }

  const sizeBands = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

  const dayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const { data: existingSnapshots, error: existingError } = await supabase
    .from('yatco_market_review_snapshots')
    .select('size_bands')
    .gte('scraped_at', dayStart)
    .order('scraped_at', { ascending: false })
    .limit(1);

  if (existingError) {
    console.error('❌ Failed to check existing market review snapshots:', existingError.message);
    process.exit(1);
  }

  if (existingSnapshots?.[0] && stableJson(existingSnapshots[0].size_bands) === stableJson(sizeBands)) {
    console.log('✅ Identical Market Review snapshot already saved today — skipping duplicate');
    return;
  }

  const { error } = await supabase.from('yatco_market_review_snapshots').insert({
    size_bands: sizeBands,
    scraped_at: new Date().toISOString(),
  });

  if (error) {
    console.error('❌ Failed to insert market review snapshot:', error.message);
    process.exit(1);
  }

  console.log('✅ Market review snapshot saved');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
