import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findBrokerByName(name: string) {
  const { data: exact } = await supabase
    .from('brokers')
    .select('id, broker_name, email')
    .eq('broker_name', name)
    .maybeSingle();

  if (exact) return exact;

  const { data: insensitive } = await supabase
    .from('brokers')
    .select('id, broker_name, email')
    .ilike('broker_name', name)
    .maybeSingle();

  return insensitive ?? null;
}

async function ensureBroker(name: string, email: string) {
  const existing = await findBrokerByName(name);
  if (existing) {
    console.log(`⚠️  Broker already exists: ${existing.broker_name}`);
    return existing;
  }

  const { data, error } = await supabase
    .from('brokers')
    .insert({
      broker_name: name,
      email,
      password_hash: 'changeme'
    })
    .select('id, broker_name, email')
    .single();

  if (error) {
    console.error(`❌ Failed to create broker ${name}:`, error.message);
    return null;
  }

  console.log(`✅ Created broker: ${data.broker_name} (${data.email})`);
  return data;
}

async function createJmoAndMarc() {
  console.log('🔧 Creating broker profiles JMO and Marc...');

  await ensureBroker('JMO', 'jmo@moana-yachting.com');
  await ensureBroker('Marc', 'marc@moana-yachting.com');
}

createJmoAndMarc()
  .then(() => {
    console.log('✅ Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
