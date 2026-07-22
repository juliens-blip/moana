import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

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

async function listBrokers() {
  console.log('📋 Fetching brokers from Supabase...\n');

  try {
    const { data: brokers, error } = await supabase
      .from('brokers')
      .select('id, broker_name, email, created_at')
      .order('broker_name', { ascending: true });

    if (error) {
      console.error('❌ Error fetching brokers:', error);
      process.exit(1);
    }

    if (!brokers || brokers.length === 0) {
      console.log('⚠️  No brokers found in database');
      return;
    }

    console.log(`✅ Found ${brokers.length} broker(s):\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    brokers.forEach((broker, index) => {
      console.log(`\n${index + 1}. Broker: ${broker.broker_name}`);
      console.log(`   Email:         ${broker.email}`);
      console.log(`   ID:            ${broker.id}`);
      console.log(`   Created:       ${new Date(broker.created_at).toLocaleString()}`);
    });

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 Password material is intentionally never displayed by this script.\n');

  } catch (err) {
    console.error('❌ Exception:', err);
    process.exit(1);
  }
}

listBrokers();
