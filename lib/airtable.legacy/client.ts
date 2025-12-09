import Airtable from 'airtable';

// Configuration
const config = {
  apiKey: process.env.AIRTABLE_API_KEY!,
  baseId: process.env.AIRTABLE_BASE_ID!,
  listingsTableId: process.env.AIRTABLE_LISTINGS_TABLE_ID!,
  brokerTableId: process.env.AIRTABLE_BROKER_TABLE_ID!,
};

// Validate configuration
if (!config.apiKey) {
  console.error('[Airtable Client] AIRTABLE_API_KEY is not configured');
  throw new Error('AIRTABLE_API_KEY is not configured');
}
if (!config.baseId) {
  console.error('[Airtable Client] AIRTABLE_BASE_ID is not configured');
  throw new Error('AIRTABLE_BASE_ID is not configured');
}
if (!config.listingsTableId) {
  console.error('[Airtable Client] AIRTABLE_LISTINGS_TABLE_ID is not configured');
  throw new Error('AIRTABLE_LISTINGS_TABLE_ID is not configured');
}
if (!config.brokerTableId) {
  console.error('[Airtable Client] AIRTABLE_BROKER_TABLE_ID is not configured');
  throw new Error('AIRTABLE_BROKER_TABLE_ID is not configured');
}

console.log('[Airtable Client] Configuration validated successfully:', {
  baseId: config.baseId,
  listingsTableId: config.listingsTableId,
  brokerTableId: config.brokerTableId,
  hasApiKey: !!config.apiKey,
});

// Configure Airtable
Airtable.configure({
  apiKey: config.apiKey,
});

// Get base
export const base = Airtable.base(config.baseId);

// Export table references
export const listingsTable = base(config.listingsTableId);
export const brokersTable = base(config.brokerTableId);

// Export config for use in API routes
export { config as airtableConfig };
