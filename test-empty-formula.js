/**
 * Test pour identifier le problème avec formula vide
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

// Configure Airtable
Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);
const listingsTable = base(process.env.AIRTABLE_LISTINGS_TABLE_ID);

async function testEmptyFormula() {
  console.log('=== Test avec formula vide ===');
  console.log('');

  const formula = '';

  console.log('Test 1: filterByFormula: formula || undefined');
  console.log('  formula =', JSON.stringify(formula));
  console.log('  formula || undefined =', JSON.stringify(formula || undefined));

  try {
    const records1 = await listingsTable
      .select({
        filterByFormula: formula || undefined,
        maxRecords: 3,
      })
      .all();
    console.log('  SUCCESS: Found', records1.length, 'records');
  } catch (error) {
    console.log('  FAILED:', error.message);
  }
  console.log('');

  console.log('Test 2: Sans filterByFormula du tout');
  try {
    const records2 = await listingsTable
      .select({
        maxRecords: 3,
      })
      .all();
    console.log('  SUCCESS: Found', records2.length, 'records');
  } catch (error) {
    console.log('  FAILED:', error.message);
  }
  console.log('');

  console.log('Test 3: Avec condition ternaire');
  const options = formula
    ? { filterByFormula: formula, maxRecords: 3 }
    : { maxRecords: 3 };

  console.log('  options =', JSON.stringify(options, null, 2));

  try {
    const records3 = await listingsTable
      .select(options)
      .all();
    console.log('  SUCCESS: Found', records3.length, 'records');
  } catch (error) {
    console.log('  FAILED:', error.message);
  }
}

testEmptyFormula().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
