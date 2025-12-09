import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ADMIN KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Make sure you have:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface AirtableBroker {
  id: string;
  fields: {
    broker: string;
    password: string;
    'Date de création'?: string;
  };
  createdTime: string;
}

interface AirtableListing {
  id: string;
  fields: {
    'Nom du Bateau': string;
    'Constructeur': string;
    'Longueur (M/pieds)': number;
    'Année': number;
    'Propriétaire': string;
    'Capitaine': string;
    'Broker': string;
    'Localisation': string;
    'Prix Actuel (€/$)'?: string;
    'Prix Précédent (€/$)'?: string;
    'Dernier message'?: string;
    'Commentaire'?: string;
  };
  createdTime: string;
}

async function importBrokers() {
  console.log('📥 Importing brokers...');

  const brokersPath = path.join(__dirname, '..', 'backup', 'brokers.json');

  if (!fs.existsSync(brokersPath)) {
    console.error(`❌ File not found: ${brokersPath}`);
    console.error('Please run "npm run export-airtable" first');
    process.exit(1);
  }

  const brokersData: AirtableBroker[] = JSON.parse(fs.readFileSync(brokersPath, 'utf-8'));

  const brokerMap = new Map<string, string>(); // airtable broker name -> supabase uuid

  for (const broker of brokersData) {
    const { data, error } = await supabase
      .from('brokers')
      .insert({
        email: `${broker.fields.broker}@moana-yachting.com`,
        broker_name: broker.fields.broker,
        password_hash: broker.fields.password, // TODO: hash if not already
        created_at: broker.createdTime,
      })
      .select('id, broker_name')
      .single();

    if (error) {
      console.error(`❌ Error importing broker ${broker.fields.broker}:`, error);
    } else {
      brokerMap.set(broker.fields.broker, data.id);
      console.log(`✅ Imported broker: ${broker.fields.broker}`);
    }
  }

  return brokerMap;
}

async function importListings(brokerMap: Map<string, string>) {
  console.log('\n📥 Importing listings...');

  const listingsPath = path.join(__dirname, '..', 'backup', 'listings.json');

  if (!fs.existsSync(listingsPath)) {
    console.error(`❌ File not found: ${listingsPath}`);
    process.exit(1);
  }

  const listingsData: AirtableListing[] = JSON.parse(fs.readFileSync(listingsPath, 'utf-8'));

  let successCount = 0;
  let errorCount = 0;

  for (const listing of listingsData) {
    const brokerId = brokerMap.get(listing.fields.Broker);

    if (!brokerId) {
      console.warn(`⚠️ Broker not found for listing: ${listing.fields['Nom du Bateau']} (broker: ${listing.fields.Broker})`);
      errorCount++;
      continue;
    }

    const { error } = await supabase.from('listings').insert({
      nom_bateau: listing.fields['Nom du Bateau'],
      constructeur: listing.fields['Constructeur'],
      longueur_m: listing.fields['Longueur (M/pieds)'],
      annee: listing.fields['Année'],
      proprietaire: listing.fields['Propriétaire'],
      capitaine: listing.fields['Capitaine'],
      broker_id: brokerId,
      localisation: listing.fields['Localisation'],
      prix_actuel: listing.fields['Prix Actuel (€/$)'],
      prix_precedent: listing.fields['Prix Précédent (€/$)'],
      dernier_message: listing.fields['Dernier message'],
      commentaire: listing.fields['Commentaire'],
      created_at: listing.createdTime,
      airtable_id: listing.id,
    });

    if (error) {
      console.error(`❌ Error importing listing ${listing.fields['Nom du Bateau']}:`, error.message);
      errorCount++;
    } else {
      successCount++;
      console.log(`✅ Imported listing: ${listing.fields['Nom du Bateau']}`);
    }
  }

  console.log(`\n📊 Summary: ${successCount} success, ${errorCount} errors`);
}

async function main() {
  console.log('🚀 Starting Supabase import...\n');

  const brokerMap = await importBrokers();
  await importListings(brokerMap);

  console.log('\n✅ Import complete!');
}

main().catch(console.error);
