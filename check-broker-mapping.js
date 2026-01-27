/**
 * Vérifier le mapping Yatco contactName → Brokers
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBrokers() {
  console.log('\n📋 BROKERS DISPONIBLES DANS L\'APP\n');
  console.log('═'.repeat(60));
  
  const { data: brokers, error } = await supabase
    .from('brokers')
    .select('id, broker_name, email')
    .order('broker_name');

  if (error) {
    console.error('❌ Erreur:', error.message);
    return;
  }

  console.log(`Total: ${brokers.length} broker(s)\n`);
  brokers.forEach((b, i) => {
    console.log(`${i+1}. ${b.broker_name}`);
    console.log(`   ID: ${b.id}`);
    console.log(`   Email: ${b.email || 'N/A'}`);
    console.log('');
  });

  console.log('═'.repeat(60));
  console.log('\n💡 CONFIGURATION YATCO\n');
  console.log('Dans Yatco LeadFlow, configurez:');
  console.log('  recipient.contactName = nom EXACT du broker\n');
  console.log('Exemples valides:');
  brokers.forEach(b => {
    console.log(`  ✓ "${b.broker_name}"`);
  });
  console.log('\n⚠️  Le matching est case-insensitive (PE = pe = Pe)');
  console.log('');
}

checkBrokers();
