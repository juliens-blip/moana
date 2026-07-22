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

async function exportTable(tableId: string, outputPath: string) {
  const records: any[] = [];

  console.log(`📥 Exporting ${path.basename(outputPath)}...`);

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

  fs.writeFileSync(outputPath, JSON.stringify(records, null, 2));
  console.log(`✅ Exported ${records.length} records to ${path.basename(outputPath)}`);

  return records.length;
}

async function main() {
  // Créer le dossier backup
  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log('🚀 Starting Airtable export...\n');

  const brokerExportPath = process.env.BROKER_EXPORT_JSON;
  if (!brokerExportPath) {
    throw new Error('BROKER_EXPORT_JSON must point outside the repository; broker exports contain credentials');
  }

  const brokersCount = await exportTable(config.brokerTableId, brokerExportPath);
  const listingsCount = await exportTable(
    config.listingsTableId,
    path.join(backupDir, 'listings.json'),
  );

  console.log('\n✅ Export complete!');
  console.log(`📊 Summary: ${brokersCount} brokers, ${listingsCount} listings`);
}

main().catch(console.error);
