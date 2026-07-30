import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyRLSFix() {
  console.log('🔐 Applying server-only brokers RLS policy...\n');

  // Read SQL file
  const sqlPath = path.resolve(process.cwd(), 'scripts', 'fix-rls-policies.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('📄 SQL to execute:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(sql);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      console.error('❌ Error executing SQL:', error);
      console.log('\n⚠️  You need to execute this SQL manually in Supabase Dashboard:');
      console.log('   1. Go to https://supabase.com/dashboard');
      console.log('   2. Select your project');
      console.log('   3. Go to SQL Editor');
      console.log('   4. Paste and execute the SQL from scripts/fix-rls-policies.sql\n');
      process.exit(1);
    }

    console.log('✅ Server-only brokers RLS policy applied.');
    console.log('   • Anonymous and browser roles cannot read broker credentials.');
    console.log('   • Authentication continues through the server-side service role.\n');

  } catch (err) {
    console.error('❌ Exception:', err);
    console.log('\n⚠️  Manual SQL execution required. See scripts/fix-rls-policies.sql\n');
    process.exit(1);
  }
}

applyRLSFix();
