#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';

const mode = process.argv[2];
if (!['--check', '--apply'].includes(mode)) {
  console.error('Usage: apply-market-review-schema.mjs --check|--apply');
  process.exit(64);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase runtime configuration');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let sqlQuery = 'SELECT 1';
if (mode === '--apply') {
  sqlQuery = await fs.readFile('/app/sql/market-review-schema.sql', 'utf8');
}

const { error } = await supabase.rpc('exec_sql', { sql_query: sqlQuery });
if (error) {
  console.error(`Supabase exec_sql failed: ${error.code || 'unknown'} ${error.message}`);
  process.exit(1);
}

console.log(mode === '--check' ? 'Supabase exec_sql is available' : 'Market Review schema applied');
