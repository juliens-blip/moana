import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function testBrokerFilter() {
  console.log('🧪 Testing broker filter...\n');

  // Test 1: Find broker by name
  console.log('Test 1: Finding broker "Charles"');
  const { data: broker, error: brokerError } = await supabase
    .from('brokers')
    .select('id, broker_name')
    .eq('broker_name', 'Charles')
    .single();

  if (brokerError) {
    console.error('❌ Error finding broker:', brokerError);
  } else {
    console.log('✅ Found broker:', broker);
  }

  if (!broker) {
    console.log('⚠️ No broker found, stopping tests');
    return;
  }

  // Test 2: Get listings for this broker
  console.log('\nTest 2: Getting listings for broker ID:', broker.id);
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `)
    .eq('broker_id', broker.id);

  if (listingsError) {
    console.error('❌ Error getting listings:', listingsError);
  } else {
    console.log(`✅ Found ${listings?.length || 0} listing(s) for Charles`);
    if (listings && listings.length > 0) {
      console.log('\nSample listing:');
      console.log(JSON.stringify(listings[0], null, 2));
    }
  }

  // Test 3: Get all listings
  console.log('\nTest 3: Getting all listings');
  const { data: allListings, error: allError } = await supabase
    .from('listings')
    .select(`
      *,
      brokers:broker_id (
        broker_name,
        email
      )
    `);

  if (allError) {
    console.error('❌ Error getting all listings:', allError);
  } else {
    console.log(`✅ Total listings in database: ${allListings?.length || 0}`);
  }
}

testBrokerFilter()
  .then(() => {
    console.log('\n✅ Tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
