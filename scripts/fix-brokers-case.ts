import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixBrokers() {
  console.log('🔧 Fixing broker case sensitivity...\n');

  // Mettre à jour pe -> PE et cedric -> Cedric
  const updates = [
    { old: 'pe', new: 'PE' },
    { old: 'cedric', new: 'Cedric' },
  ];

  for (const { old, new: newName } of updates) {
    const { data, error } = await supabase
      .from('brokers')
      .update({ broker_name: newName })
      .eq('broker_name', old)
      .select();

    if (error) {
      console.error(`❌ Error updating ${old}:`, error.message);
    } else if (data && data.length > 0) {
      console.log(`✅ Updated broker: ${old} -> ${newName}`);
    }
  }

  console.log('\n✅ Broker names fixed!');
}

fixBrokers();
