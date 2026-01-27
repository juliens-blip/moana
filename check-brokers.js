const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkBrokers() {
  console.log('🔍 Vérification de la table brokers...\n');
  
  const { data, error } = await supabase
    .from('brokers')
    .select('*');
  
  if (error) {
    console.error('❌ Erreur:', error);
    return;
  }
  
  console.log(`✅ Trouvé ${data.length} broker(s):\n`);
  data.forEach((broker, i) => {
    console.log(`${i + 1}. ID: ${broker.id}`);
    console.log(`   Nom: ${broker.broker_name}`);
    console.log(`   Email: ${broker.email}`);
    console.log(`   Password hash: ${broker.password_hash?.substring(0, 20)}...`);
    console.log('');
  });
}

checkBrokers().then(() => process.exit(0)).catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
