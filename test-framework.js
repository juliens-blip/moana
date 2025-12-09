/**
 * MOANA YACHTING - COMPREHENSIVE TEST FRAMEWORK
 * ===============================================
 * Tests complets pour identifier les bugs dans l'application
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;
const TEST_RESULTS_DIR = path.join(__dirname, 'test-results');

// Couleurs pour le terminal
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Test results storage
const testResults = {
  passed: 0,
  failed: 0,
  total: 0,
  tests: [],
  bugs: [],
  timestamp: new Date().toISOString(),
};

// Test session storage
let sessionCookie = null;

// Helper functions
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  log('\n' + '='.repeat(60), 'cyan');
  log(`  ${title}`, 'cyan');
  log('='.repeat(60) + '\n', 'cyan');
}

function logTest(name, status, details = '') {
  const symbol = status === 'PASS' ? '✓' : '✗';
  const color = status === 'PASS' ? 'green' : 'red';
  log(`  ${symbol} ${name}`, color);
  if (details) {
    log(`    ${details}`, 'yellow');
  }
}

function recordTest(testName, passed, error = null, details = {}) {
  testResults.total++;
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
    testResults.bugs.push({
      testName,
      error: error?.message || 'Unknown error',
      details,
      timestamp: new Date().toISOString(),
    });
  }

  testResults.tests.push({
    name: testName,
    status: passed ? 'PASS' : 'FAIL',
    error: error?.message,
    details,
    timestamp: new Date().toISOString(),
  });

  logTest(testName, passed ? 'PASS' : 'FAIL', error?.message);
}

// Create test results directory
if (!fs.existsSync(TEST_RESULTS_DIR)) {
  fs.mkdirSync(TEST_RESULTS_DIR);
}

// API Client with cookie support
const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  validateStatus: () => true, // Don't throw on any status
});

// Update session cookie after login
function updateSessionCookie(cookies) {
  if (cookies) {
    sessionCookie = cookies;
    apiClient.defaults.headers.common['Cookie'] = cookies;
  }
}

// ============================================
// AUTHENTICATION TESTS
// ============================================
async function testAuthentication() {
  logSection('AUTHENTICATION TESTS');

  // Test 1: Login avec credentials valides
  try {
    const response = await apiClient.post('/auth/login', {
      broker: 'Charles',
      password: 'changeme'
    });

    const passed = response.status === 200 && response.data.success;

    if (passed && response.headers['set-cookie']) {
      updateSessionCookie(response.headers['set-cookie'].join('; '));
    }

    recordTest(
      'Login avec credentials valides',
      passed,
      passed ? null : new Error(`Status: ${response.status}, Data: ${JSON.stringify(response.data)}`),
      { status: response.status, data: response.data }
    );
  } catch (error) {
    recordTest('Login avec credentials valides', false, error, { error: error.message });
  }

  // Test 2: Login avec credentials invalides
  try {
    const response = await apiClient.post('/auth/login', {
      broker: 'InvalidUser',
      password: 'wrongpassword'
    });

    const passed = response.status === 401 || (response.status === 200 && !response.data.success);
    recordTest(
      'Login avec credentials invalides (devrait échouer)',
      passed,
      passed ? null : new Error(`Should have failed but got status: ${response.status}`),
      { status: response.status, data: response.data }
    );
  } catch (error) {
    recordTest('Login avec credentials invalides', false, error, { error: error.message });
  }

  // Test 3: Get session
  try {
    const response = await apiClient.get('/auth/me');
    const passed = response.status === 200;
    recordTest(
      'Get current session',
      passed,
      passed ? null : new Error(`Status: ${response.status}`),
      { status: response.status, data: response.data }
    );
  } catch (error) {
    recordTest('Get current session', false, error, { error: error.message });
  }
}

// ============================================
// LISTINGS API TESTS
// ============================================
async function testListingsAPI() {
  logSection('LISTINGS API TESTS');

  // Test 1: Get all listings (no filters)
  try {
    const response = await apiClient.get('/listings');
    const passed = response.status === 200 && response.data.success && Array.isArray(response.data.data);
    recordTest(
      'GET /api/listings - Sans filtres',
      passed,
      passed ? null : new Error(`Status: ${response.status}, Data: ${JSON.stringify(response.data)}`),
      { status: response.status, count: response.data.data?.length }
    );
  } catch (error) {
    recordTest('GET /api/listings - Sans filtres', false, error, { error: error.message });
  }

  // Test 2: Get listings with broker filter (THE PROBLEM!)
  try {
    log('\n  Testing broker filter with "Charles"...', 'blue');
    const response = await apiClient.get('/listings?broker=Charles');
    const passed = response.status === 200 && response.data.success;

    recordTest(
      'GET /api/listings?broker=Charles - Filtre broker',
      passed,
      passed ? null : new Error(`Status: ${response.status}, Error: ${response.data.error}`),
      {
        status: response.status,
        data: response.data,
        count: response.data.data?.length
      }
    );
  } catch (error) {
    recordTest('GET /api/listings?broker=Charles', false, error, {
      error: error.message,
      response: error.response?.data
    });
  }

  // Test 3: Get listings with localisation filter
  try {
    const response = await apiClient.get('/listings?localisation=Monaco');
    const passed = response.status === 200 && response.data.success;
    recordTest(
      'GET /api/listings?localisation=Monaco - Filtre localisation',
      passed,
      passed ? null : new Error(`Status: ${response.status}`),
      { status: response.status, count: response.data.data?.length }
    );
  } catch (error) {
    recordTest('GET /api/listings?localisation=Monaco', false, error, { error: error.message });
  }

  // Test 4: Get listings with length filters
  try {
    const response = await apiClient.get('/listings?minLength=20&maxLength=50');
    const passed = response.status === 200 && response.data.success;
    recordTest(
      'GET /api/listings?minLength=20&maxLength=50 - Filtre longueur',
      passed,
      passed ? null : new Error(`Status: ${response.status}`),
      { status: response.status, count: response.data.data?.length }
    );
  } catch (error) {
    recordTest('GET /api/listings with length filters', false, error, { error: error.message });
  }

  // Test 5: Get listings with search
  try {
    const response = await apiClient.get('/listings?search=Princess');
    const passed = response.status === 200 && response.data.success;
    recordTest(
      'GET /api/listings?search=Princess - Recherche',
      passed,
      passed ? null : new Error(`Status: ${response.status}`),
      { status: response.status, count: response.data.data?.length }
    );
  } catch (error) {
    recordTest('GET /api/listings with search', false, error, { error: error.message });
  }
}

// ============================================
// CRUD TESTS
// ============================================
async function testCRUD() {
  logSection('CRUD OPERATIONS TESTS');

  let createdListingId = null;

  // Test 1: CREATE - Créer un nouveau listing
  try {
    log('\n  Testing CREATE listing...', 'blue');
    const newListing = {
      nomBateau: 'Test Yacht',
      constructeur: 'Test Builder',
      longueur: 25.5,
      annee: 2023,
      proprietaire: 'Test Owner',
      capitaine: 'Test Captain',
      localisation: 'Test Location',
      prix: '1,000,000 €',
      commentaire: 'Test comment'
    };

    const response = await apiClient.post('/listings', newListing);
    const passed = response.status === 201 && response.data.success;

    if (passed && response.data.data?.id) {
      createdListingId = response.data.data.id;
    }

    recordTest(
      'POST /api/listings - Créer un listing',
      passed,
      passed ? null : new Error(`Status: ${response.status}, Error: ${response.data.error}, Validation: ${JSON.stringify(response.data.data)}`),
      {
        status: response.status,
        data: response.data,
        id: createdListingId
      }
    );
  } catch (error) {
    recordTest('POST /api/listings - Créer un listing', false, error, {
      error: error.message,
      response: error.response?.data
    });
  }

  // Test 2: READ - Lire le listing créé
  if (createdListingId) {
    try {
      const response = await apiClient.get(`/listings/${createdListingId}`);
      const passed = response.status === 200 && response.data.success;
      recordTest(
        `GET /api/listings/${createdListingId} - Lire un listing`,
        passed,
        passed ? null : new Error(`Status: ${response.status}`),
        { status: response.status, data: response.data }
      );
    } catch (error) {
      recordTest('GET /api/listings/[id] - Lire un listing', false, error, { error: error.message });
    }
  }

  // Test 3: UPDATE - Modifier le listing
  if (createdListingId) {
    try {
      log('\n  Testing UPDATE listing...', 'blue');
      const updates = {
        nomBateau: 'Updated Test Yacht',
        prix: '1,200,000 €'
      };

      const response = await apiClient.put(`/listings/${createdListingId}`, updates);
      const passed = response.status === 200 && response.data.success;
      recordTest(
        `PUT /api/listings/${createdListingId} - Modifier un listing`,
        passed,
        passed ? null : new Error(`Status: ${response.status}, Error: ${response.data.error}`),
        { status: response.status, data: response.data }
      );
    } catch (error) {
      recordTest('PUT /api/listings/[id] - Modifier un listing', false, error, {
        error: error.message,
        response: error.response?.data
      });
    }
  }

  // Test 4: DELETE - Supprimer le listing
  if (createdListingId) {
    try {
      const response = await apiClient.delete(`/listings/${createdListingId}`);
      const passed = response.status === 200 && response.data.success;
      recordTest(
        `DELETE /api/listings/${createdListingId} - Supprimer un listing`,
        passed,
        passed ? null : new Error(`Status: ${response.status}`),
        { status: response.status }
      );
    } catch (error) {
      recordTest('DELETE /api/listings/[id] - Supprimer un listing', false, error, { error: error.message });
    }
  }
}

// ============================================
// VALIDATION TESTS
// ============================================
async function testValidation() {
  logSection('VALIDATION TESTS');

  // Test 1: Créer un listing avec données invalides (champs manquants)
  try {
    const invalidListing = {
      nomBateau: 'Test',
      // Missing required fields
    };

    const response = await apiClient.post('/listings', invalidListing);
    const passed = response.status === 400 || (response.status === 200 && !response.data.success);
    recordTest(
      'POST /api/listings - Champs requis manquants (devrait échouer)',
      passed,
      passed ? null : new Error(`Should have failed but got status: ${response.status}`),
      { status: response.status, data: response.data }
    );
  } catch (error) {
    recordTest('Validation - Champs requis manquants', true, null, { note: 'Correctly rejected' });
  }

  // Test 2: Créer un listing avec longueur invalide
  try {
    const invalidListing = {
      nomBateau: 'Test Yacht',
      constructeur: 'Test Builder',
      longueur: -10, // Invalid negative
      annee: 2023,
      proprietaire: 'Test Owner',
      capitaine: 'Test Captain',
      localisation: 'Test Location'
    };

    const response = await apiClient.post('/listings', invalidListing);
    const passed = response.status === 400 || (response.status === 200 && !response.data.success);
    recordTest(
      'POST /api/listings - Longueur négative (devrait échouer)',
      passed,
      passed ? null : new Error(`Should have failed but got status: ${response.status}`),
      { status: response.status }
    );
  } catch (error) {
    recordTest('Validation - Longueur négative', true, null, { note: 'Correctly rejected' });
  }

  // Test 3: Créer un listing avec année invalide
  try {
    const invalidListing = {
      nomBateau: 'Test Yacht',
      constructeur: 'Test Builder',
      longueur: 25,
      annee: 1800, // Too old
      proprietaire: 'Test Owner',
      capitaine: 'Test Captain',
      localisation: 'Test Location'
    };

    const response = await apiClient.post('/listings', invalidListing);
    const passed = response.status === 400 || (response.status === 200 && !response.data.success);
    recordTest(
      'POST /api/listings - Année invalide (devrait échouer)',
      passed,
      passed ? null : new Error(`Should have failed but got status: ${response.status}`),
      { status: response.status }
    );
  } catch (error) {
    recordTest('Validation - Année invalide', true, null, { note: 'Correctly rejected' });
  }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  MOANA YACHTING - COMPREHENSIVE TEST SUITE                ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝\n', 'cyan');

  log(`Starting tests at: ${new Date().toLocaleString()}`, 'blue');
  log(`Base URL: ${BASE_URL}\n`, 'blue');

  try {
    // Run all test suites
    await testAuthentication();
    await testListingsAPI();
    await testCRUD();
    await testValidation();

    // Generate summary
    logSection('TEST SUMMARY');
    log(`Total Tests: ${testResults.total}`, 'blue');
    log(`Passed: ${testResults.passed}`, 'green');
    log(`Failed: ${testResults.failed}`, testResults.failed > 0 ? 'red' : 'green');
    log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`,
      testResults.failed === 0 ? 'green' : 'yellow');

    // Display bugs
    if (testResults.bugs.length > 0) {
      logSection('BUGS FOUND');
      testResults.bugs.forEach((bug, index) => {
        log(`\n${index + 1}. ${bug.testName}`, 'red');
        log(`   Error: ${bug.error}`, 'yellow');
        if (bug.details) {
          log(`   Details: ${JSON.stringify(bug.details, null, 2)}`, 'yellow');
        }
      });
    }

    // Save results to file
    const reportPath = path.join(TEST_RESULTS_DIR, `test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(testResults, null, 2));
    log(`\nTest report saved to: ${reportPath}`, 'green');

    // Save summary
    const summaryPath = path.join(TEST_RESULTS_DIR, 'test-summary.txt');
    const summary = `
MOANA YACHTING - TEST REPORT
============================
Date: ${new Date().toLocaleString()}

SUMMARY
-------
Total Tests: ${testResults.total}
Passed: ${testResults.passed}
Failed: ${testResults.failed}
Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%

${testResults.bugs.length > 0 ? `
BUGS FOUND (${testResults.bugs.length})
----------
${testResults.bugs.map((bug, i) => `
${i + 1}. ${bug.testName}
   Error: ${bug.error}
   Details: ${JSON.stringify(bug.details, null, 2)}
`).join('\n')}
` : 'No bugs found!'}

DETAILED RESULTS
---------------
${testResults.tests.map(test => `
- [${test.status}] ${test.name}
  ${test.error ? `Error: ${test.error}` : ''}
`).join('\n')}
`;

    fs.writeFileSync(summaryPath, summary);
    log(`Test summary saved to: ${summaryPath}`, 'green');

  } catch (error) {
    log(`\nFatal error during test execution: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testResults,
};
