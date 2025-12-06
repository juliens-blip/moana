/**
 * Post-Fix Verification Script
 *
 * Runs after field name fixes are applied to verify everything works
 *
 * Usage: node verify-fixes.js
 */

const axios = require('axios');

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY || 'your_airtable_api_key_here';
const BASE_ID = 'appNyZVynxa8shk4c';
const TABLE_ID = 'tblxxQhUvQd2Haztz';
const BASE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

const axiosConfig = {
  headers: {
    'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
    'Content-Type': 'application/json'
  }
};

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║       Post-Fix Verification Script                        ║');
console.log('║       Validates Field Name Corrections                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

let testRecordId = null;

// Test 1: Create record with all fields
async function testCreate() {
  console.log('Test 1: Creating record with all fields...');

  const testData = {
    fields: {
      'Nom du Bateau': 'VERIFICATION TEST YACHT',
      'Constructeur': 'Test Builder',
      'Longueur (M/pieds)': 28.5,
      'Année': 2024,
      'Propriétaire': 'Test Owner',
      'Capitaine': 'Test Captain',
      'Broker': 'verification.test',
      'Localisation': 'Test Location',
      'Prix Actuel (€/$)': '2500000',  // CORRECTED FIELD NAME
      'Prix Précédent (€/$)': '2700000',  // CORRECTED FIELD NAME
      'Dernier message': 'Verification test message',
      'Commentaire': 'This record tests the corrected field names'
    }
  };

  try {
    const response = await axios.post(BASE_URL, testData, axiosConfig);

    if (response.data.id) {
      testRecordId = response.data.id;
      console.log(`✓ PASS - Record created with ID: ${testRecordId}\n`);

      // Verify all fields were saved
      const fields = response.data.fields;
      const checks = [
        { field: 'Prix Actuel (€/$)', expected: '2500000' },
        { field: 'Prix Précédent (€/$)', expected: '2700000' },
        { field: 'Dernier message', expected: 'Verification test message' },
        { field: 'Commentaire', expected: 'This record tests the corrected field names' }
      ];

      let allCorrect = true;
      checks.forEach(check => {
        if (fields[check.field] === check.expected) {
          console.log(`  ✓ ${check.field}: ${fields[check.field]}`);
        } else {
          console.log(`  ✗ ${check.field}: Expected "${check.expected}", got "${fields[check.field]}"`);
          allCorrect = false;
        }
      });

      if (allCorrect) {
        console.log('\n✓ All optional fields saved correctly!\n');
        return true;
      } else {
        console.log('\n✗ Some fields not saved correctly\n');
        return false;
      }
    }
  } catch (error) {
    console.log(`✗ FAIL - ${error.response?.data?.error?.message || error.message}\n`);
    return false;
  }
}

// Test 2: Retrieve and verify fields
async function testRetrieve() {
  if (!testRecordId) {
    console.log('Test 2: SKIPPED - No test record available\n');
    return false;
  }

  console.log('Test 2: Retrieving record and verifying fields...');

  try {
    const response = await axios.get(`${BASE_URL}/${testRecordId}`, axiosConfig);
    const fields = response.data.fields;

    if (fields['Prix Actuel (€/$)'] && fields['Prix Précédent (€/$)']) {
      console.log(`✓ PASS - All price fields retrieved correctly`);
      console.log(`  Prix Actuel: ${fields['Prix Actuel (€/$)']}`);
      console.log(`  Prix Précédent: ${fields['Prix Précédent (€/$)']}\n`);
      return true;
    } else {
      console.log('✗ FAIL - Price fields not retrieved\n');
      return false;
    }
  } catch (error) {
    console.log(`✗ FAIL - ${error.message}\n`);
    return false;
  }
}

// Test 3: Filter by price
async function testPriceFilter() {
  console.log('Test 3: Testing price range filter...');

  try {
    // Test min price filter with VALUE() function
    const formula = `AND(NOT({Prix Actuel (€/$)} = BLANK()), {Prix Actuel (€/$)} != "N/A", VALUE({Prix Actuel (€/$)}) >= 2000000)`;
    const response = await axios.get(
      `${BASE_URL}?filterByFormula=${encodeURIComponent(formula)}`,
      axiosConfig
    );

    console.log(`✓ PASS - Price filter executed successfully`);
    console.log(`  Found ${response.data.records.length} records with price >= 2M EUR\n`);
    return true;
  } catch (error) {
    console.log(`✗ FAIL - ${error.response?.data?.error?.message || error.message}\n`);
    return false;
  }
}

// Test 4: Update record
async function testUpdate() {
  if (!testRecordId) {
    console.log('Test 4: SKIPPED - No test record available\n');
    return false;
  }

  console.log('Test 4: Updating price fields...');

  const updates = {
    fields: {
      'Prix Actuel (€/$)': '2400000',
      'Dernier message': 'Price updated via verification test'
    }
  };

  try {
    const response = await axios.patch(
      `${BASE_URL}/${testRecordId}`,
      updates,
      axiosConfig
    );

    if (response.data.fields['Prix Actuel (€/$)'] === '2400000') {
      console.log(`✓ PASS - Record updated successfully`);
      console.log(`  New price: ${response.data.fields['Prix Actuel (€/$)']}\n`);
      return true;
    } else {
      console.log('✗ FAIL - Update did not apply correctly\n');
      return false;
    }
  } catch (error) {
    console.log(`✗ FAIL - ${error.message}\n`);
    return false;
  }
}

// Test 5: Cleanup - Delete test record
async function testCleanup() {
  if (!testRecordId) {
    console.log('Test 5: SKIPPED - No test record to clean up\n');
    return true;
  }

  console.log('Test 5: Cleaning up test record...');

  try {
    await axios.delete(`${BASE_URL}/${testRecordId}`, axiosConfig);
    console.log(`✓ PASS - Test record deleted successfully\n`);
    return true;
  } catch (error) {
    console.log(`✗ FAIL - Could not delete test record: ${testRecordId}\n`);
    console.log(`  Please delete manually from Airtable\n`);
    return false;
  }
}

// Main execution
async function main() {
  const results = {
    create: false,
    retrieve: false,
    filter: false,
    update: false,
    cleanup: false
  };

  try {
    results.create = await testCreate();
    results.retrieve = await testRetrieve();
    results.filter = await testPriceFilter();
    results.update = await testUpdate();
    results.cleanup = await testCleanup();

    // Summary
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                  VERIFICATION SUMMARY                      ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    const tests = Object.entries(results);
    const passed = tests.filter(([_, result]) => result).length;
    const total = tests.length;

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}\n`);

    tests.forEach(([name, result]) => {
      const icon = result ? '✓' : '✗';
      console.log(`${icon} ${name.charAt(0).toUpperCase() + name.slice(1)}`);
    });

    console.log('\n');

    if (passed === total) {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║     ✓✓✓ ALL FIXES VERIFIED SUCCESSFULLY! ✓✓✓              ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('The field name corrections are working correctly.');
      console.log('You can now proceed with:');
      console.log('  1. npm run type-check');
      console.log('  2. npm run dev');
      console.log('  3. Manual testing in the UI\n');
      process.exit(0);
    } else {
      console.log('╔════════════════════════════════════════════════════════════╗');
      console.log('║     ✗✗✗ SOME TESTS FAILED ✗✗✗                             ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('Please review the failed tests above.');
      console.log('Check that all field names have been updated correctly.\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('\nCRITICAL ERROR:', error.message);
    if (testRecordId) {
      console.log(`\nWARNING: Test record ${testRecordId} may still exist in Airtable`);
      console.log('Please delete it manually\n');
    }
    process.exit(1);
  }
}

main();
