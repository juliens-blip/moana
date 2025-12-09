import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// Configuration Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function cleanValue(value: any): any {
  if (!value || value === 'N/A' || value === '') return undefined;
  return value;
}

function parseLength(value: string): number | undefined {
  if (!value || value === 'N/A' || value === '') return undefined;
  const num = parseFloat(value.toString().replace(',', '.'));
  return isNaN(num) || num === 0 ? undefined : num;
}

function parseYear(value: string): number | undefined {
  if (!value || value === 'N/A' || value === '') return undefined;
  const num = parseInt(value.toString().split('.')[0]);
  return isNaN(num) || num === 0 ? undefined : num;
}

async function importBrokers() {
  console.log('📥 Importing brokers from CSV...\n');

  const csvPath = path.join(__dirname, '..', 'backup', 'brokers.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const brokerMap = new Map<string, string>();

  // Ajouter les brokers du CSV
  for (const record of records) {
    const { broker, password } = record;

    if (!broker) continue;

    const { data, error } = await supabase
      .from('brokers')
      .insert({
        email: `${broker}@moana-yachting.com`,
        broker_name: broker,
        password_hash: password, // TODO: hash avec bcrypt en prod
      })
      .select('id, broker_name')
      .single();

    if (error) {
      if (error.code === '23505') {
        // Duplicate - récupérer l'ID existant
        const { data: existing } = await supabase
          .from('brokers')
          .select('id, broker_name')
          .eq('broker_name', broker)
          .single();

        if (existing) {
          brokerMap.set(broker, existing.id);
          console.log(`⚠️  Broker already exists: ${broker}`);
        }
      } else {
        console.error(`❌ Error importing broker ${broker}:`, error.message);
      }
    } else {
      brokerMap.set(broker, data.id);
      console.log(`✅ Imported broker: ${broker}`);
    }
  }

  // Ajouter les brokers manquants trouvés dans les listings
  const additionalBrokers = ['Charles', 'Foulques', 'Marc', 'Bart', 'Aldric'];

  for (const broker of additionalBrokers) {
    const { data, error } = await supabase
      .from('brokers')
      .insert({
        email: `${broker.toLowerCase()}@moana-yachting.com`,
        broker_name: broker,
        password_hash: 'changeme', // Mot de passe par défaut
      })
      .select('id, broker_name')
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: existing } = await supabase
          .from('brokers')
          .select('id, broker_name')
          .eq('broker_name', broker)
          .single();

        if (existing) {
          brokerMap.set(broker, existing.id);
        }
      } else {
        console.error(`❌ Error creating broker ${broker}:`, error.message);
      }
    } else {
      brokerMap.set(broker, data.id);
      console.log(`✅ Created additional broker: ${broker}`);
    }
  }

  console.log(`\n📊 Total brokers in map: ${brokerMap.size}\n`);

  return brokerMap;
}

async function importListings(brokerMap: Map<string, string>) {
  console.log('📥 Importing listings from CSV...\n');

  const csvPath = path.join(__dirname, '..', 'backup', 'listings.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    const nomBateau = cleanValue(record['Nom du Bateau']);
    const constructeur = cleanValue(record['Constructeur']);
    const longueur = parseLength(record['Longueur (M/pieds)']);
    const annee = parseYear(record['Année']);
    const proprietaire = cleanValue(record['Propriétaire']) || 'N/A';
    const capitaine = cleanValue(record['Capitaine']) || 'N/A';
    const brokerName = cleanValue(record['Broker']);
    const localisation = cleanValue(record['Localisation']) || 'N/A';
    const prixActuel = cleanValue(record['Prix Actuel (€/$)']);
    const prixPrecedent = cleanValue(record['Prix Précédent (€/$)']);
    const dernierMessage = cleanValue(record['Dernier message']);
    const commentaire = cleanValue(record['Commentaire']);

    // Skip si pas de nom ou constructeur
    if (!nomBateau || !constructeur) {
      skippedCount++;
      continue;
    }

    // Trouver le broker_id
    let brokerId: string | undefined;
    if (brokerName) {
      brokerId = brokerMap.get(brokerName);
      if (!brokerId) {
        console.warn(`⚠️  Broker not found for: ${nomBateau} (broker: ${brokerName})`);
      }
    }

    const { error } = await supabase.from('listings').insert({
      nom_bateau: nomBateau,
      constructeur: constructeur,
      longueur_m: longueur,
      annee: annee,
      proprietaire: proprietaire,
      capitaine: capitaine,
      broker_id: brokerId,
      localisation: localisation,
      prix_actuel: prixActuel,
      prix_precedent: prixPrecedent,
      dernier_message: dernierMessage,
      commentaire: commentaire,
    });

    if (error) {
      if (error.code === '23505') {
        // Duplicate
        skippedCount++;
        console.log(`⚠️  Duplicate: ${nomBateau}`);
      } else {
        console.error(`❌ Error importing ${nomBateau}:`, error.message);
        errorCount++;
      }
    } else {
      successCount++;
      console.log(`✅ Imported: ${nomBateau}`);
    }
  }

  console.log(`\n📊 Import Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped: ${skippedCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);
}

async function main() {
  console.log('🚀 Starting CSV import to Supabase...\n');
  console.log('━'.repeat(50) + '\n');

  try {
    const brokerMap = await importBrokers();
    console.log('━'.repeat(50) + '\n');
    await importListings(brokerMap);
    console.log('\n' + '━'.repeat(50));
    console.log('\n✅ Import complete!\n');
  } catch (error) {
    console.error('\n❌ Import failed:', error);
    process.exit(1);
  }
}

main();
