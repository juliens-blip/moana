import Airtable from 'airtable';
import fs from 'fs';
import path from 'path';

// Configuration
const config = {
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseId: 'appNyZVynxa8shk4c',
  listingsTableId: 'tblxxQhUvQd2Haztz',
  brokerTableId: 'tbl9dTwK6RfutmqVY',
};

Airtable.configure({ apiKey: config.apiKey });
const base = Airtable.base(config.baseId);

async function exportTable(tableId: string, filename: string) {
  const records: any[] = [];

  console.log(`📥 Exporting ${filename}...`);

  await base(tableId)
    .select()
    .eachPage((pageRecords, fetchNextPage) => {
      pageRecords.forEach((record) => {
        records.push({
          id: record.id,
          fields: record.fields,
          createdTime: record._rawJson.createdTime,
        });
      });
      fetchNextPage();
    });

  const outputPath = path.join(__dirname, '..', 'backup', filename);
  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
  console.log(`✅ Exported ${records.length} records to ${filename}`);

  return records.length;
}

async function main() {
  // Créer le dossier backup
  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('🚀 Starting Airtable export...\n');

  const brokersCount = await exportTable(config.brokerTableId, 'brokers.json');
  const listingsCount = await exportTable(config.listingsTableId, 'listings.json');

  console.log('\n✅ Export complete!');
  console.log(`📊 Summary: ${brokersCount} brokers, ${listingsCount} listings`);
}

main().catch(console.error);
