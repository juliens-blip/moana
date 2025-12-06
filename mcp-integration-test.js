/**
 * MCP Server Airtable Integration Test Suite
 *
 * Tests all aspects of the Airtable integration for Moana Yachting
 * - Schema validation
 * - Field ID verification
 * - CRUD operations
 * - Filter functionality
 * - Optional fields handling
 */

const axios = require('axios');

// Configuration
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'your_airtable_api_key_here';
const BASE_ID = 'appNyZVynxa8shk4c';
const TABLE_ID = 'tblxxQhUvQd2Haztz';
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

// Expected Field IDs from documentation
const EXPECTED_FIELDS = {
  'Nom du Bateau': 'fld6d7lSBboRKmnuj',
  'Constructeur': 'fldc7YcGLAfQi6qhr',
  'Longueur (M/pieds)': 'fldg1Sj70TTkAsGqr',
  'Année': 'fldL3ig1rDH70lbis',
  'Propriétaire': 'fldAoxfgKKeEHeD9S',
  'Capitaine': 'fldY9RXNPnV5xLgcg',
  'Broker': 'fldgftA1xTZBnMuPZ',
  'Localisation': 'fldlys06AjtMRcOmB'
};

const axiosConfig = {
  headers: {
    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json'
  }
};

// Test Results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: []
};

// Helper Functions
function logTest(name, status, message, details = null) {
  const result = { name, status, message, details };
  results.tests.push(result);

  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⚠';
  console.log(`\n${icon} ${name}`);
  console.log(`  ${message}`);
  if (details) {
    console.log(`  Details: ${JSON.stringify(details, null, 2)}`);
  }

  if (status === 'PASS') results.passed++;
  else if (status === 'FAIL') results.failed++;
  else results.warnings++;
}

// Test 1: Validate Table Schema
async function testTableSchema() {
  console.log('\n========== TEST 1: TABLE SCHEMA VALIDATION ==========');

  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`,
      axiosConfig
    );

    const table = response.data.tables.find(t => t.id === TABLE_ID);

    if (!table) {
      logTest(
        'Table Exists',
        'FAIL',
        `Table ${TABLE_ID} not found in base`
      );
      return;
    }

    logTest(
      'Table Exists',
      'PASS',
      `Table "${table.name}" found successfully`
    );

    // Check each expected field
    const actualFields = {};
    table.fields.forEach(field => {
      actualFields[field.name] = field.id;
    });

    // Verify required fields
    for (const [fieldName, expectedId] of Object.entries(EXPECTED_FIELDS)) {
      if (!actualFields[fieldName]) {
        logTest(
          `Field: ${fieldName}`,
          'FAIL',
          `Field "${fieldName}" not found in table`
        );
      } else if (actualFields[fieldName] !== expectedId) {
        logTest(
          `Field: ${fieldName}`,
          'WARN',
          `Field ID mismatch`,
          { expected: expectedId, actual: actualFields[fieldName] }
        );
      } else {
        logTest(
          `Field: ${fieldName}`,
          'PASS',
          `Field exists with correct ID: ${expectedId}`
        );
      }
    }

    // Check for optional fields
    const optionalFields = ['Prix', 'Prix précédent', 'Dernier message', 'Commentaire'];
    optionalFields.forEach(fieldName => {
      if (actualFields[fieldName]) {
        logTest(
          `Optional Field: ${fieldName}`,
          'PASS',
          `Optional field exists with ID: ${actualFields[fieldName]}`
        );
      } else {
        logTest(
          `Optional Field: ${fieldName}`,
          'WARN',
          `Optional field "${fieldName}" not found - will need to be created`
        );
      }
    });

    // Log all fields for reference
    console.log('\n--- All Fields in Table ---');
    table.fields.forEach(field => {
      console.log(`  ${field.name} (${field.id}): ${field.type}`);
    });

  } catch (error) {
    logTest(
      'Table Schema Validation',
      'FAIL',
      'Failed to fetch table schema',
      error.response?.data || error.message
    );
  }
}

// Test 2: Create Record with All Fields
async function testCreateRecord() {
  console.log('\n\n========== TEST 2: CREATE RECORD WITH ALL FIELDS ==========');

  const testData = {
    fields: {
      'Nom du Bateau': 'MCP Test Yacht',
      'Constructeur': 'MCP Test Builder',
      'Longueur (M/pieds)': 25.5,
      'Année': 2024,
      'Propriétaire': 'MCP Test Owner',
      'Capitaine': 'Captain MCP',
      'Broker': 'test.broker',
      'Localisation': 'Monaco',
      'Prix': 1500000,
      'Prix précédent': 1600000,
      'Dernier message': 'Test message from MCP integration test',
      'Commentaire': 'This is a test record created by the MCP integration test suite'
    }
  };

  try {
    const response = await axios.post(BASE_URL, testData, axiosConfig);

    if (response.data.id) {
      logTest(
        'Create Record',
        'PASS',
        `Record created successfully with ID: ${response.data.id}`
      );

      // Verify all fields were saved
      const savedFields = response.data.fields;
      let allFieldsSaved = true;

      for (const [fieldName, expectedValue] of Object.entries(testData.fields)) {
        if (savedFields[fieldName] !== expectedValue) {
          logTest(
            `Field Saved: ${fieldName}`,
            'FAIL',
            `Field value mismatch`,
            { expected: expectedValue, actual: savedFields[fieldName] }
          );
          allFieldsSaved = false;
        }
      }

      if (allFieldsSaved) {
        logTest(
          'All Fields Saved',
          'PASS',
          'All fields saved correctly including optional fields'
        );
      }

      // Return record ID for cleanup
      return response.data.id;
    }
  } catch (error) {
    logTest(
      'Create Record',
      'FAIL',
      'Failed to create record',
      error.response?.data || error.message
    );
  }

  return null;
}

// Test 3: Retrieve Records with All Fields
async function testRetrieveRecords() {
  console.log('\n\n========== TEST 3: RETRIEVE RECORDS WITH ALL FIELDS ==========');

  try {
    const response = await axios.get(
      `${BASE_URL}?maxRecords=5`,
      axiosConfig
    );

    if (response.data.records && response.data.records.length > 0) {
      logTest(
        'Retrieve Records',
        'PASS',
        `Retrieved ${response.data.records.length} records`
      );

      // Check if Prix field is included
      const recordWithPrice = response.data.records.find(r => r.fields['Prix']);
      if (recordWithPrice) {
        logTest(
          'Prix Field Retrieved',
          'PASS',
          `Prix field present in records: ${recordWithPrice.fields['Prix']} EUR`
        );
      } else {
        logTest(
          'Prix Field Retrieved',
          'WARN',
          'No records with Prix field found (may be normal if all records have null prices)'
        );
      }

      // Log sample record structure
      console.log('\n--- Sample Record Structure ---');
      const sample = response.data.records[0];
      console.log('Fields present:', Object.keys(sample.fields));
      console.log('Sample data:', JSON.stringify(sample.fields, null, 2));

    } else {
      logTest(
        'Retrieve Records',
        'WARN',
        'No records found in table'
      );
    }
  } catch (error) {
    logTest(
      'Retrieve Records',
      'FAIL',
      'Failed to retrieve records',
      error.response?.data || error.message
    );
  }
}

// Test 4: Filter by Localisation
async function testFilterByLocalisation() {
  console.log('\n\n========== TEST 4: FILTER BY LOCALISATION ==========');

  const testLocalisations = ['Monaco', 'Antibes', 'Cannes'];

  for (const localisation of testLocalisations) {
    try {
      const formula = `{Localisation} = "${localisation}"`;
      const response = await axios.get(
        `${BASE_URL}?filterByFormula=${encodeURIComponent(formula)}`,
        axiosConfig
      );

      logTest(
        `Filter: Localisation = ${localisation}`,
        'PASS',
        `Found ${response.data.records.length} records in ${localisation}`
      );

    } catch (error) {
      logTest(
        `Filter: Localisation = ${localisation}`,
        'FAIL',
        'Filter failed',
        error.response?.data || error.message
      );
    }
  }
}

// Test 5: Filter by Price Range
async function testFilterByPrice() {
  console.log('\n\n========== TEST 5: FILTER BY PRICE RANGE ==========');

  const priceRanges = [
    { min: 0, max: 1000000, label: '0-1M EUR' },
    { min: 1000000, max: 5000000, label: '1M-5M EUR' },
    { min: 5000000, max: 100000000, label: '5M+ EUR' }
  ];

  for (const range of priceRanges) {
    try {
      const formula = `AND(NOT({Prix} = BLANK()), {Prix} >= ${range.min}, {Prix} <= ${range.max})`;
      const response = await axios.get(
        `${BASE_URL}?filterByFormula=${encodeURIComponent(formula)}`,
        axiosConfig
      );

      logTest(
        `Filter: Price ${range.label}`,
        'PASS',
        `Found ${response.data.records.length} records in price range ${range.label}`
      );

    } catch (error) {
      logTest(
        `Filter: Price ${range.label}`,
        'FAIL',
        'Price filter failed',
        error.response?.data || error.message
      );
    }
  }

  // Test handling of null prices
  try {
    const formula = `{Prix} = BLANK()`;
    const response = await axios.get(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(formula)}`,
      axiosConfig
    );

    logTest(
      'Filter: Null Prices',
      'PASS',
      `Found ${response.data.records.length} records with no price`
    );

  } catch (error) {
    logTest(
      'Filter: Null Prices',
      'FAIL',
      'Null price filter failed',
      error.response?.data || error.message
    );
  }
}

// Test 6: Complex Multi-Filter
async function testComplexFilter() {
  console.log('\n\n========== TEST 6: COMPLEX MULTI-FILTER ==========');

  const testCases = [
    {
      name: 'Broker + Localisation',
      formula: `AND({Broker} = "test.broker", {Localisation} = "Monaco")`
    },
    {
      name: 'Search (Nom + Constructeur)',
      formula: `OR(FIND(LOWER("yacht"), LOWER({Nom du Bateau})), FIND(LOWER("yacht"), LOWER({Constructeur})))`
    },
    {
      name: 'Length Range',
      formula: `AND({Longueur (M/pieds)} >= 20, {Longueur (M/pieds)} <= 30)`
    },
    {
      name: 'Full Combined Filter',
      formula: `AND({Broker} = "test.broker", {Localisation} = "Monaco", {Longueur (M/pieds)} >= 20, NOT({Prix} = BLANK()))`
    }
  ];

  for (const testCase of testCases) {
    try {
      const response = await axios.get(
        `${BASE_URL}?filterByFormula=${encodeURIComponent(testCase.formula)}`,
        axiosConfig
      );

      logTest(
        `Complex Filter: ${testCase.name}`,
        'PASS',
        `Filter executed successfully, found ${response.data.records.length} records`
      );

    } catch (error) {
      logTest(
        `Complex Filter: ${testCase.name}`,
        'FAIL',
        'Complex filter failed',
        error.response?.data || error.message
      );
    }
  }
}

// Test 7: Update Record
async function testUpdateRecord(recordId) {
  if (!recordId) {
    logTest(
      'Update Record',
      'WARN',
      'Skipped - no test record available'
    );
    return;
  }

  console.log('\n\n========== TEST 7: UPDATE RECORD ==========');

  const updates = {
    fields: {
      'Prix': 1400000,
      'Dernier message': 'Updated by MCP test',
      'Commentaire': 'Price reduced after test update'
    }
  };

  try {
    const response = await axios.patch(
      `${BASE_URL}/${recordId}`,
      updates,
      axiosConfig
    );

    logTest(
      'Update Record',
      'PASS',
      'Record updated successfully',
      response.data.fields
    );

  } catch (error) {
    logTest(
      'Update Record',
      'FAIL',
      'Failed to update record',
      error.response?.data || error.message
    );
  }
}

// Test 8: Delete Record (Cleanup)
async function testDeleteRecord(recordId) {
  if (!recordId) {
    logTest(
      'Delete Record',
      'WARN',
      'Skipped - no test record available'
    );
    return;
  }

  console.log('\n\n========== TEST 8: DELETE RECORD (CLEANUP) ==========');

  try {
    await axios.delete(`${BASE_URL}/${recordId}`, axiosConfig);

    logTest(
      'Delete Record',
      'PASS',
      `Test record ${recordId} deleted successfully`
    );

  } catch (error) {
    logTest(
      'Delete Record',
      'FAIL',
      'Failed to delete test record',
      error.response?.data || error.message
    );
  }
}

// Main Test Execution
async function runTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   MCP Server Airtable Integration Test Suite              ║');
  console.log('║   Moana Yachting - Comprehensive Validation                ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  let testRecordId = null;

  try {
    // Run all tests in sequence
    await testTableSchema();
    testRecordId = await testCreateRecord();
    await testRetrieveRecords();
    await testFilterByLocalisation();
    await testFilterByPrice();
    await testComplexFilter();
    await testUpdateRecord(testRecordId);
    await testDeleteRecord(testRecordId);

  } catch (error) {
    console.error('\n\n CRITICAL ERROR:', error);
  }

  // Print Summary
  console.log('\n\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal Tests: ${results.tests.length}`);
  console.log(`Passed: ${results.passed} ✓`);
  console.log(`Failed: ${results.failed} ✗`);
  console.log(`Warnings: ${results.warnings} ⚠`);

  const successRate = ((results.passed / results.tests.length) * 100).toFixed(1);
  console.log(`\nSuccess Rate: ${successRate}%`);

  if (results.failed > 0) {
    console.log('\n--- FAILED TESTS ---');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`\n✗ ${t.name}`);
        console.log(`  ${t.message}`);
        if (t.details) console.log(`  ${JSON.stringify(t.details, null, 2)}`);
      });
  }

  if (results.warnings > 0) {
    console.log('\n--- WARNINGS ---');
    results.tests
      .filter(t => t.status === 'WARN')
      .forEach(t => {
        console.log(`\n⚠ ${t.name}`);
        console.log(`  ${t.message}`);
      });
  }

  console.log('\n');

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run the test suite
runTests();
