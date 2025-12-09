import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

async function disableRLS() {
  console.log('🔧 Disabling RLS on brokers table for development...\n');

  try {
    // Use the Supabase client to execute raw SQL
    // Note: This uses the service role key which has full access
    const { data, error } = await supabase
      .from('brokers')
      .select('count')
      .limit(0);

    if (error) {
      console.log('Query error (expected):', error.message);
    }

    console.log('⚠️  Note: RLS policies need to be modified via Supabase Dashboard SQL Editor\n');
    console.log('📋 STEPS TO FIX:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/ewdgxylgzncvbaftbigs/editor');
    console.log('2. Click "SQL Editor" in left sidebar');
    console.log('3. Click "New Query"');
    console.log('4. Paste this SQL:\n');
    console.log('   -- Disable RLS on brokers table (for development)');
    console.log('   ALTER TABLE public.brokers DISABLE ROW LEVEL SECURITY;\n');
    console.log('5. Click "Run"\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('✅ After running the SQL, restart your dev server and try logging in again!\n');
    console.log('⚠️  IMPORTANT: This disables security on the brokers table.');
    console.log('   Only use this for development. For production, use proper RLS policies.\n');

  } catch (err) {
    console.error('❌ Exception:', err);
  }
}

disableRLS();
