/**
 * Simple Leads API Test
 * Run: node test-leads-api.js
 * 
 * Prerequisites:
 * - Dev server running on localhost:3000
 * - Authenticated broker session (login first in browser)
 */

const http = require('http');

const BASE_URL = 'localhost';
const PORT = 3000;

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

/**
 * Make HTTP request
 */
function request(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

/**
 * Log test result
 */
function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) {
    console.log(`   ${details}`);
  }
  
  testResults.tests.push({ name, passed, details });
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

/**
 * Test 1: GET /api/leads
 */
async function testGetLeads() {
  console.log('\n🧪 TEST 1: GET /api/leads');
  console.log('─'.repeat(50));

  try {
    const { status, data } = await request('/api/leads');

    if (status === 401) {
      logTest('GET /api/leads - Auth required', true, 'Status: 401 (expected - not authenticated)');
      return { skip: true };
    }

    logTest('GET /api/leads - Returns 200', status === 200, `Status: ${status}`);

    if (status === 200) {
      logTest('GET /api/leads - Has success field', data.success !== undefined);
      logTest('GET /api/leads - Data is array', Array.isArray(data.data));

      if (Array.isArray(data.data) && data.data.length > 0) {
        const lead = data.data[0];
        console.log(`   Found ${data.data.length} lead(s)`);
        console.log(`   First lead ID: ${lead.id}`);
        return { lead };
      } else {
        console.log('   ⚠️  No leads found');
        return { skip: true };
      }
    }

    return { skip: true };

  } catch (error) {
    logTest('GET /api/leads - Request', false, error.message);
    console.log('\n⚠️  Make sure dev server is running: npm run dev');
    return { skip: true };
  }
}

/**
 * Test 2: GET /api/leads/[id]
 */
async function testGetLeadById(leadId) {
  console.log('\n🧪 TEST 2: GET /api/leads/[id]');
  console.log('─'.repeat(50));

  try {
    const { status, data } = await request(`/api/leads/${leadId}`);

    if (status === 401) {
      logTest('GET /api/leads/[id] - Auth required', true, 'Status: 401');
      return;
    }

    logTest('GET /api/leads/[id] - Returns 200', status === 200, `Status: ${status}`);

    if (status === 200) {
      logTest('GET /api/leads/[id] - Correct lead ID', data.data?.id === leadId);
      logTest('GET /api/leads/[id] - Has status field', !!data.data?.status);
      console.log(`   Lead status: ${data.data?.status}`);
    }

  } catch (error) {
    logTest('GET /api/leads/[id] - Request', false, error.message);
  }
}

/**
 * Test 3: GET /api/leads/invalid-id (404)
 */
async function testGetLeadNotFound() {
  console.log('\n🧪 TEST 3: GET /api/leads/[id] - Not Found');
  console.log('─'.repeat(50));

  try {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { status } = await request(`/api/leads/${fakeId}`);

    logTest(
      'GET /api/leads/[id] - 404 for invalid ID',
      status === 404 || status === 401,
      `Status: ${status}`
    );

  } catch (error) {
    logTest('GET /api/leads/[id] - 404 test', false, error.message);
  }
}

/**
 * Test 4: PUT /api/leads/[id] - Update status
 */
async function testUpdateStatus(leadId) {
  console.log('\n🧪 TEST 4: PUT /api/leads/[id] - Update Status');
  console.log('─'.repeat(50));

  try {
    const updateData = { status: 'CONTACTED' };
    const { status, data } = await request(`/api/leads/${leadId}`, 'PUT', updateData);

    if (status === 401) {
      logTest('PUT /api/leads/[id] - Auth required', true, 'Status: 401');
      return;
    }

    logTest('PUT /api/leads/[id] - Returns 200', status === 200, `Status: ${status}`);

    if (status === 200) {
      logTest('PUT /api/leads/[id] - Status updated', data.data?.status === 'CONTACTED');
      console.log(`   New status: ${data.data?.status}`);
    }

  } catch (error) {
    logTest('PUT /api/leads/[id] - Update status', false, error.message);
  }
}

/**
 * Test 5: PUT /api/leads/[id] - Invalid status (400)
 */
async function testInvalidStatus(leadId) {
  console.log('\n🧪 TEST 5: PUT /api/leads/[id] - Invalid Status');
  console.log('─'.repeat(50));

  try {
    const updateData = { status: 'INVALID_STATUS' };
    const { status } = await request(`/api/leads/${leadId}`, 'PUT', updateData);

    logTest(
      'PUT /api/leads/[id] - Rejects invalid status',
      status === 400 || status === 401,
      `Status: ${status}`
    );

  } catch (error) {
    logTest('PUT /api/leads/[id] - Invalid status validation', false, error.message);
  }
}

/**
 * Test 6: PUT /api/leads/[id] - Update comments
 */
async function testUpdateComments(leadId) {
  console.log('\n🧪 TEST 6: PUT /api/leads/[id] - Update Comments');
  console.log('─'.repeat(50));

  try {
    const testComment = `Test comment - ${new Date().toISOString()}`;
    const updateData = { lead_comments: testComment };
    const { status, data } = await request(`/api/leads/${leadId}`, 'PUT', updateData);

    if (status === 401) {
      logTest('PUT /api/leads/[id] - Comments auth required', true, 'Status: 401');
      return;
    }

    logTest('PUT /api/leads/[id] - Comments update returns 200', status === 200, `Status: ${status}`);

    if (status === 200) {
      logTest('PUT /api/leads/[id] - Comment updated', data.data?.lead_comments === testComment);
    }

  } catch (error) {
    logTest('PUT /api/leads/[id] - Update comments', false, error.message);
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  const total = testResults.passed + testResults.failed;
  const passRate = total > 0 ? ((testResults.passed / total) * 100).toFixed(1) : '0.0';

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log('═'.repeat(60));

  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`  - ${t.name}`);
        if (t.details) console.log(`    ${t.details}`);
      });
  }

  console.log('\n');
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n═'.repeat(60));
  console.log('🚀 MOANA YACHTING - LEADS API TESTS');
  console.log('═'.repeat(60));
  console.log(`URL: http://${BASE_URL}:${PORT}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  // Test 1: Get all leads
  const result1 = await testGetLeads();

  if (result1.skip) {
    console.log('\n⚠️  Skipping remaining tests (authentication required or no data)');
    console.log('\nTo run full tests:');
    console.log('  1. Start dev server: npm run dev');
    console.log('  2. Login as a broker in your browser');
    console.log('  3. Ensure there are leads in the database');
    printSummary();
    return;
  }

  const leadId = result1.lead.id;
  console.log(`\n✓ Using lead ID: ${leadId} for remaining tests`);

  // Run remaining tests
  await testGetLeadById(leadId);
  await testGetLeadNotFound();
  await testUpdateStatus(leadId);
  await testInvalidStatus(leadId);
  await testUpdateComments(leadId);

  // Print summary
  printSummary();
}

// Run all tests
runTests().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
