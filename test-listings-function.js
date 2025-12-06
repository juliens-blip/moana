/**
 * Test direct de la fonction getListings
 * Ce script simule l'appel API pour identifier le problème
 */

const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

// Charger .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split('\n');

envLines.forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    const value = valueParts.join('=').trim();
    process.env[key.trim()] = value;
  }
});

console.log('=== Test de la fonction getListings ===');
console.log('');

// Configuration identique à lib/airtable/client.ts
const config = {
  apiKey: process.env.AIRTABLE_API_KEY,
  baseId: process.env.AIRTABLE_BASE_ID,
  listingsTableId: process.env.AIRTABLE_LISTINGS_TABLE_ID,
  brokerTableId: process.env.AIRTABLE_BROKER_TABLE_ID,
};

console.log('Config:', {
  apiKey: config.apiKey ? 'SET' : 'MISSING',
  baseId: config.baseId || 'MISSING',
  listingsTableId: config.listingsTableId || 'MISSING',
  brokerTableId: config.brokerTableId || 'MISSING',
});
console.log('');

// Validate configuration
if (!config.apiKey) {
  throw new Error('AIRTABLE_API_KEY is not configured');
}
if (!config.baseId) {
  throw new Error('AIRTABLE_BASE_ID is not configured');
}
if (!config.listingsTableId) {
  throw new Error('AIRTABLE_LISTINGS_TABLE_ID is not configured');
}

// Configure Airtable
Airtable.configure({
  apiKey: config.apiKey,
});

// Get base
const base = Airtable.base(config.baseId);
const listingsTable = base(config.listingsTableId);

// Réplication exacte de la fonction getListings
async function getListings(filters = {}) {
  try {
    console.log('Filters:', JSON.stringify(filters, null, 2));

    const conditions = [];

    if (filters?.broker) {
      conditions.push(`{Broker} = '${filters.broker}'`);
    }
    if (filters?.localisation) {
      conditions.push(`{Localisation} = '${filters.localisation}'`);
    }
    if (filters?.search) {
      const searchTerm = filters.search.toLowerCase();
      conditions.push(`OR(
        SEARCH(LOWER('${searchTerm}'), LOWER({Nom du Bateau})),
        SEARCH(LOWER('${searchTerm}'), LOWER({Constructeur}))
      )`);
    }

    const formula = conditions.length > 0 ? `AND(${conditions.join(', ')})` : '';

    console.log('Formula:', formula || 'NONE (fetch all)');
    console.log('');

    const records = await listingsTable
      .select({
        filterByFormula: formula || undefined,
        sort: [{ field: 'Nom du Bateau', direction: 'asc' }],
      })
      .all();

    console.log(`Found ${records.length} records`);
    console.log('');

    const mappedRecords = records.map((record) => ({
      id: record.id,
      fields: {
        'Nom du Bateau': (record.get('Nom du Bateau') || '') ,
        'Constructeur': (record.get('Constructeur') || '') ,
        'Longueur (M/pieds)': (record.get('Longueur (M/pieds)') || 0) ,
        'Année': (record.get('Année') || 0) ,
        'Propriétaire': (record.get('Propriétaire') || '') ,
        'Capitaine': (record.get('Capitaine') || '') ,
        'Broker': (record.get('Broker') || '') ,
        'Localisation': (record.get('Localisation') || '') ,
      },
      createdTime: record._rawJson?.createdTime || new Date().toISOString(),
    }));

    console.log('Sample record (first):');
    console.log(JSON.stringify(mappedRecords[0], null, 2));
    console.log('');

    return mappedRecords;
  } catch (error) {
    console.error('Error fetching listings:', error);
    console.error('Error stack:', error.stack);
    throw new Error('Failed to fetch listings');
  }
}

// Test avec différents scénarios
async function runTests() {
  console.log('--- Test 1: Sans filtres ---');
  try {
    const listings1 = await getListings();
    console.log(`SUCCESS: ${listings1.length} listings`);
  } catch (error) {
    console.error('FAILED:', error.message);
  }
  console.log('');

  console.log('--- Test 2: Avec filtre broker ---');
  try {
    const listings2 = await getListings({ broker: 'Charles' });
    console.log(`SUCCESS: ${listings2.length} listings`);
  } catch (error) {
    console.error('FAILED:', error.message);
  }
  console.log('');

  console.log('--- Test 3: Avec filtre localisation ---');
  try {
    const listings3 = await getListings({ localisation: 'Monaco' });
    console.log(`SUCCESS: ${listings3.length} listings`);
  } catch (error) {
    console.error('FAILED:', error.message);
  }
  console.log('');

  console.log('--- Test 4: Avec recherche ---');
  try {
    const listings4 = await getListings({ search: 'AL' });
    console.log(`SUCCESS: ${listings4.length} listings`);
  } catch (error) {
    console.error('FAILED:', error.message);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
