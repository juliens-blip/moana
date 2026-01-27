#!/usr/bin/env node

/**
 * Test E2E du webhook Yatco LeadFlow
 *
 * Tests:
 * 1. Health check de l'endpoint
 * 2. POST avec payload valide (nouveau lead)
 * 3. POST avec même yatco_lead_id (duplicate detection)
 * 4. Vérification du lead dans la base
 * 5. Vérification du mapping broker
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const WEBHOOK_URL = `${BASE_URL}/api/leads/yatco`;

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logTest(name, status, details = '') {
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '○';
  const color = status === 'PASS' ? 'green' : status === 'FAIL' ? 'red' : 'yellow';
  log(`${icon} ${name}`, color);
  if (details) {
    console.log(`  ${details}`);
  }
}

// Payload de test Yatco officiel
const testPayload = {
  lead: {
    id: "TEST-RALPH-001",
    date: new Date().toISOString(),
    source: "Boats Group",
    detailedSource: "YachtWorld-Test",
    detailedSourceSummary: "YachtWorld",
    requestType: "Contact Broker"
  },
  contact: {
    name: { display: "Ralph Test", first: "Ralph", last: "Test" },
    phone: "+33600000000",
    email: "ralph.test@protocole.test",
    country: "FR"
  },
  customerComments: "Test Protocole Ralph - E2E",
  leadComments: "Test automatisé webhook validation",
  boat: {
    make: "Sunseeker",
    model: "Manhattan 76",
    year: "2024",
    condition: "New",
    length: { measure: "23", units: "meters" },
    price: { amount: "3500000", currency: "EUR" },
    url: "https://test.yachtworld.com/test-ralph"
  },
  recipient: {
    officeName: "Moana Yachting",
    officeId: "389841",
    contactName: "Julien"
  }
};

async function testHealthCheck() {
  logSection('TEST 1: Health Check');

  try {
    const response = await fetch(WEBHOOK_URL);
    const data = await response.json();

    if (response.status === 200 && data.status === 'ok') {
      logTest('GET /api/leads/yatco', 'PASS', `Status: ${response.status}`);
      log(`Response: ${JSON.stringify(data, null, 2)}`, 'cyan');
      return true;
    } else {
      logTest('GET /api/leads/yatco', 'FAIL', `Expected 200, got ${response.status}`);
      return false;
    }
  } catch (error) {
    logTest('GET /api/leads/yatco', 'FAIL', error.message);
    return false;
  }
}

async function testCreateLead() {
  logSection('TEST 2: Create New Lead');

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const data = await response.json();

    log(`Status: ${response.status}`, response.status === 201 || response.status === 200 ? 'green' : 'red');
    log(`Response: ${JSON.stringify(data, null, 2)}`, 'cyan');

    if (response.status === 201) {
      logTest('POST /api/leads/yatco (new)', 'PASS', 'Lead créé avec succès');

      // Vérifications du lead créé
      if (data.lead) {
        const lead = data.lead;

        // Vérifier les champs mappés
        const checks = [
          { name: 'yatco_lead_id', expected: testPayload.lead.id, actual: lead.yatco_lead_id },
          { name: 'contact_display_name', expected: testPayload.contact.name.display, actual: lead.contact_display_name },
          { name: 'contact_email', expected: testPayload.contact.email, actual: lead.contact_email },
          { name: 'contact_phone', expected: testPayload.contact.phone, actual: lead.contact_phone },
          { name: 'boat_make', expected: testPayload.boat.make, actual: lead.boat_make },
          { name: 'boat_model', expected: testPayload.boat.model, actual: lead.boat_model },
          { name: 'source', expected: testPayload.lead.source, actual: lead.source },
        ];

        let allPassed = true;
        checks.forEach(check => {
          const passed = check.expected === check.actual;
          if (!passed) allPassed = false;
          logTest(
            `  Field: ${check.name}`,
            passed ? 'PASS' : 'FAIL',
            passed ? `${check.actual}` : `Expected: ${check.expected}, Got: ${check.actual}`
          );
        });

        // Vérifier le broker
        if (lead.broker_id) {
          logTest('  Broker mapping', 'PASS', `Broker ID: ${lead.broker_id}`);
        } else {
          logTest('  Broker mapping', 'FAIL', 'Aucun broker assigné');
          allPassed = false;
        }

        // Vérifier le raw_payload
        if (lead.raw_payload) {
          logTest('  Raw payload stored', 'PASS', 'JSONB stocké pour audit');
        } else {
          logTest('  Raw payload stored', 'FAIL', 'Payload brut non sauvegardé');
        }

        return allPassed ? lead.id : null;
      }
    } else if (response.status === 200 && data.message?.includes('duplicate')) {
      logTest('POST /api/leads/yatco (duplicate)', 'PASS', 'Duplicate détecté correctement');
      return data.lead?.id || 'existing';
    } else {
      logTest('POST /api/leads/yatco', 'FAIL', `Unexpected status ${response.status}`);
      return null;
    }
  } catch (error) {
    logTest('POST /api/leads/yatco', 'FAIL', error.message);
    return null;
  }
}

async function testDuplicateDetection() {
  logSection('TEST 3: Duplicate Detection');

  try {
    // Envoyer le même payload une deuxième fois
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const data = await response.json();

    log(`Status: ${response.status}`, 'cyan');
    log(`Response: ${JSON.stringify(data, null, 2)}`, 'cyan');

    if (response.status === 200 && data.message?.includes('duplicate')) {
      logTest('Duplicate detection', 'PASS', 'Lead existant retourné sans création');
      return true;
    } else if (response.status === 201) {
      logTest('Duplicate detection', 'FAIL', 'Un nouveau lead a été créé (devrait détecter duplicate)');
      return false;
    } else {
      logTest('Duplicate detection', 'FAIL', `Unexpected response: ${response.status}`);
      return false;
    }
  } catch (error) {
    logTest('Duplicate detection', 'FAIL', error.message);
    return false;
  }
}

async function testInvalidPayload() {
  logSection('TEST 4: Invalid Payload Validation');

  const invalidPayloads = [
    {
      name: 'Missing required fields',
      payload: { lead: { id: "TEST" } },
      expectedStatus: 400
    },
    {
      name: 'Invalid email format',
      payload: {
        ...testPayload,
        contact: { ...testPayload.contact, email: 'invalid-email' }
      },
      expectedStatus: 400
    },
    {
      name: 'Missing boat info',
      payload: {
        ...testPayload,
        boat: undefined
      },
      expectedStatus: 400
    }
  ];

  let allPassed = true;

  for (const test of invalidPayloads) {
    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(test.payload),
      });

      const data = await response.json();

      if (response.status === test.expectedStatus) {
        logTest(`  ${test.name}`, 'PASS', `Rejected with ${response.status}`);
      } else {
        logTest(`  ${test.name}`, 'FAIL', `Expected ${test.expectedStatus}, got ${response.status}`);
        allPassed = false;
      }
    } catch (error) {
      logTest(`  ${test.name}`, 'FAIL', error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

async function testBrokerMapping() {
  logSection('TEST 5: Broker Mapping Verification');

  // Test avec différents brokers
  const brokerTests = [
    { contactName: "Julien", shouldMap: true },
    { contactName: "julien", shouldMap: true }, // Case insensitive
    { contactName: "JULIEN", shouldMap: true },
    { contactName: "Unknown Broker", shouldMap: false },
  ];

  let allPassed = true;

  for (const test of brokerTests) {
    const payload = {
      ...testPayload,
      lead: { ...testPayload.lead, id: `TEST-BROKER-${test.contactName}` },
      recipient: { ...testPayload.recipient, contactName: test.contactName }
    };

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.status === 201 || response.status === 200) {
        const hasBroker = !!data.lead?.broker_id;

        if (test.shouldMap && hasBroker) {
          logTest(`  Broker "${test.contactName}"`, 'PASS', `Mapped to ID: ${data.lead.broker_id}`);
        } else if (!test.shouldMap && !hasBroker) {
          logTest(`  Broker "${test.contactName}"`, 'PASS', 'Correctly left unassigned');
        } else {
          logTest(`  Broker "${test.contactName}"`, 'FAIL',
            test.shouldMap ? 'Should have been mapped' : 'Should not have been mapped');
          allPassed = false;
        }
      } else {
        logTest(`  Broker "${test.contactName}"`, 'FAIL', `Request failed with ${response.status}`);
        allPassed = false;
      }
    } catch (error) {
      logTest(`  Broker "${test.contactName}"`, 'FAIL', error.message);
      allPassed = false;
    }
  }

  return allPassed;
}

async function verifyLeadInDatabase(leadId) {
  logSection('TEST 6: Database Verification');

  try {
    const response = await fetch(`${BASE_URL}/api/leads/${leadId}`);

    if (response.status === 200) {
      const data = await response.json();

      logTest('Lead exists in database', 'PASS', `ID: ${leadId}`);
      log(`Lead data:`, 'cyan');
      console.log(JSON.stringify(data, null, 2));
      return true;
    } else {
      logTest('Lead exists in database', 'FAIL', `Status: ${response.status}`);
      return false;
    }
  } catch (error) {
    logTest('Lead exists in database', 'FAIL', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', 'bright');
  log('║         YATCO LEADFLOW WEBHOOK TEST SUITE                 ║', 'bright');
  log('╚════════════════════════════════════════════════════════════╝', 'bright');
  log(`Base URL: ${BASE_URL}`, 'cyan');
  log(`Webhook: ${WEBHOOK_URL}`, 'cyan');
  log(`Date: ${new Date().toLocaleString()}`, 'cyan');

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  // Test 1: Health Check
  const healthCheckPassed = await testHealthCheck();
  results.total++;
  if (healthCheckPassed) results.passed++;
  else results.failed++;
  results.tests.push({ name: 'Health Check', passed: healthCheckPassed });

  if (!healthCheckPassed) {
    log('\n❌ Health check failed. Cannot continue tests.', 'red');
    return results;
  }

  // Test 2: Create Lead
  const leadId = await testCreateLead();
  results.total++;
  if (leadId) results.passed++;
  else results.failed++;
  results.tests.push({ name: 'Create Lead', passed: !!leadId });

  // Test 3: Duplicate Detection
  const duplicatePassed = await testDuplicateDetection();
  results.total++;
  if (duplicatePassed) results.passed++;
  else results.failed++;
  results.tests.push({ name: 'Duplicate Detection', passed: duplicatePassed });

  // Test 4: Invalid Payload
  const validationPassed = await testInvalidPayload();
  results.total++;
  if (validationPassed) results.passed++;
  else results.failed++;
  results.tests.push({ name: 'Payload Validation', passed: validationPassed });

  // Test 5: Broker Mapping
  const brokerMappingPassed = await testBrokerMapping();
  results.total++;
  if (brokerMappingPassed) results.passed++;
  else results.failed++;
  results.tests.push({ name: 'Broker Mapping', passed: brokerMappingPassed });

  // Test 6: Database Verification
  if (leadId && leadId !== 'existing') {
    const dbVerificationPassed = await verifyLeadInDatabase(leadId);
    results.total++;
    if (dbVerificationPassed) results.passed++;
    else results.failed++;
    results.tests.push({ name: 'Database Verification', passed: dbVerificationPassed });
  }

  // Summary
  logSection('TEST SUMMARY');
  log(`Total Tests: ${results.total}`, 'cyan');
  log(`Passed: ${results.passed}`, 'green');
  log(`Failed: ${results.failed}`, results.failed > 0 ? 'red' : 'green');
  log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`,
    results.failed === 0 ? 'green' : 'yellow');

  console.log('\n');
  results.tests.forEach(test => {
    logTest(test.name, test.passed ? 'PASS' : 'FAIL');
  });

  console.log('\n');
  if (results.failed === 0) {
    log('✓ ALL TESTS PASSED! Webhook is production-ready.', 'green');
  } else {
    log(`✗ ${results.failed} test(s) failed. Review issues above.`, 'red');
  }
  console.log('\n');

  return results;
}

// Run tests
runAllTests()
  .then(results => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
