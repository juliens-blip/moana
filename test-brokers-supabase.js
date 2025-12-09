/**
 * TEST BROKERS IN SUPABASE
 * Verify broker data and resolve broker names to IDs
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testBrokers() {
  console.log('\n=== TESTING BROKERS IN SUPABASE ===\n');

  // 1. List all brokers
  console.log('1. Listing all brokers...');
  const { data: brokers, error: brokersError } = await supabase
    .from('brokers')
    .select('*')
    .order('broker_name');

  if (brokersError) {
    console.error('Error fetching brokers:', brokersError);
  } else {
    console.log(`Found ${brokers.length} brokers:`);
    brokers.forEach(broker => {
      console.log(`  - ${broker.broker_name} (ID: ${broker.id}, Email: ${broker.email})`);
    });
  }

  // 2. Test broker name resolution
  console.log('\n2. Testing broker name resolution...');
  const testBrokerName = 'Charles';
  console.log(`   Looking up broker: "${testBrokerName}"`);

  const { data: broker, error: brokerError } = await supabase
    .from('brokers')
    .select('*')
    .eq('broker_name', testBrokerName)
    .single();

  if (brokerError) {
    console.error(`   ERROR: Could not find broker "${testBrokerName}":`, brokerError);
  } else {
    console.log(`   SUCCESS: Found broker "${testBrokerName}"`);
    console.log(`   - ID: ${broker.id}`);
    console.log(`   - Email: ${broker.email}`);
    console.log(`   - Password Hash: ${broker.password_hash}`);
  }

  // 3. Test case sensitivity
  console.log('\n3. Testing case sensitivity...');
  const variations = ['Charles', 'charles', 'CHARLES'];

  for (const variation of variations) {
    const { data, error } = await supabase
      .from('brokers')
      .select('broker_name, id')
      .eq('broker_name', variation)
      .maybeSingle();

    if (error) {
      console.log(`   "${variation}" - ERROR: ${error.message}`);
    } else if (data) {
      console.log(`   "${variation}" - FOUND: ${data.broker_name} (${data.id})`);
    } else {
      console.log(`   "${variation}" - NOT FOUND`);
    }
  }

  // 4. Test case-insensitive search
  console.log('\n4. Testing case-insensitive search (ilike)...');
  const { data: ilikeBroker, error: ilikeError } = await supabase
    .from('brokers')
    .select('*')
    .ilike('broker_name', 'charles')
    .maybeSingle();

  if (ilikeError) {
    console.error('   ERROR:', ilikeError);
  } else if (ilikeBroker) {
    console.log(`   SUCCESS: Found "${ilikeBroker.broker_name}" using ilike search`);
  } else {
    console.log('   NOT FOUND using ilike search');
  }

  // 5. Check listings with broker_id
  console.log('\n5. Checking listings with broker_id...');
  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select('id, nom_bateau, broker_id, brokers:broker_id(broker_name)')
    .not('broker_id', 'is', null)
    .limit(10);

  if (listingsError) {
    console.error('   ERROR:', listingsError);
  } else {
    console.log(`   Found ${listings.length} listings with broker_id:`);
    listings.forEach(listing => {
      console.log(`   - ${listing.nom_bateau}: broker_id=${listing.broker_id}, broker_name=${listing.brokers?.broker_name || 'N/A'}`);
    });
  }

  // 6. Test filtering listings by broker name
  console.log('\n6. Testing filtering listings by broker name...');
  if (broker) {
    const { data: filteredListings, error: filterError } = await supabase
      .from('listings')
      .select(`
        id,
        nom_bateau,
        broker_id,
        brokers:broker_id (
          broker_name
        )
      `)
      .eq('broker_id', broker.id);

    if (filterError) {
      console.error('   ERROR:', filterError);
    } else {
      console.log(`   Found ${filteredListings.length} listings for broker "${testBrokerName}" (ID: ${broker.id})`);
      filteredListings.slice(0, 5).forEach(listing => {
        console.log(`   - ${listing.nom_bateau}`);
      });
    }
  }
}

testBrokers().catch(console.error);
