const Airtable = require('airtable');
const fs = require('fs');
const path = require('path');

// Charger .env.local manuellement
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

console.log('=== Configuration Check ===');
console.log('AIRTABLE_API_KEY:', process.env.AIRTABLE_API_KEY ? `SET (${process.env.AIRTABLE_API_KEY.substring(0, 10)}...)` : 'NOT SET');
console.log('AIRTABLE_BASE_ID:', process.env.AIRTABLE_BASE_ID || 'NOT SET');
console.log('AIRTABLE_LISTINGS_TABLE_ID:', process.env.AIRTABLE_LISTINGS_TABLE_ID || 'NOT SET');
console.log('AIRTABLE_BROKER_TABLE_ID:', process.env.AIRTABLE_BROKER_TABLE_ID || 'NOT SET');
console.log('');

// Configure Airtable
Airtable.configure({
  apiKey: process.env.AIRTABLE_API_KEY,
});

const base = Airtable.base(process.env.AIRTABLE_BASE_ID);

console.log('=== Testing Airtable Connection ===');
console.log('Fetching listings from table:', process.env.AIRTABLE_LISTINGS_TABLE_ID);
console.log('');

// Test listing records
base(process.env.AIRTABLE_LISTINGS_TABLE_ID)
  .select({
    maxRecords: 3,
    view: 'Grid view'
  })
  .firstPage()
  .then(records => {
    console.log(`SUCCESS: Found ${records.length} records`);
    console.log('');

    if (records.length > 0) {
      console.log('=== First Record Structure ===');
      const firstRecord = records[0];
      console.log('Record ID:', firstRecord.id);
      console.log('Fields available:', Object.keys(firstRecord.fields));
      console.log('');
      console.log('Field values:');
      Object.keys(firstRecord.fields).forEach(key => {
        console.log(`  - ${key}:`, firstRecord.fields[key]);
      });
    } else {
      console.log('WARNING: No records found in the table');
    }
  })
  .catch(error => {
    console.error('ERROR:', error.message);
    if (error.statusCode) {
      console.error('Status Code:', error.statusCode);
    }
    if (error.error) {
      console.error('Error Details:', error.error);
    }
  });
