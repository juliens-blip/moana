#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase runtime configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [
  {
    table: 'yatco_fleet_listings',
    columns: 'id,vid,mls_id,stats_impressions,stats_detail_views,stats_phone_clicks,stats_gallery_views,stats_leads,stats_synced_at',
  },
  { table: 'yatco_listing_stats', columns: 'id,listing_id,snapshot_date' },
  { table: 'yatco_market_review_snapshots', columns: 'id,size_bands,scraped_at' },
  { table: 'yatco_market_pulse', columns: 'id,feed_type,vid,scraped_at' },
];

let failed = 0;
for (const check of checks) {
  const { count, error } = await supabase
    .from(check.table)
    .select(check.columns, { count: 'exact' })
    .limit(1);
  if (error) {
    failed += 1;
    console.error(`${check.table}: ERROR ${error.code || 'unknown'} ${error.message}`);
  } else {
    console.log(`${check.table}: OK (${count ?? 0} rows)`);
  }
}

process.exitCode = failed === 0 ? 0 : 1;
