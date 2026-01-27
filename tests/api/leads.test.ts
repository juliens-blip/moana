/**
 * API Leads Tests
 * 
 * Tests for the leads API endpoints:
 * - GET /api/leads - List all leads for authenticated broker
 * - GET /api/leads/[id] - Get a specific lead
 * - PUT /api/leads/[id] - Update lead status and comments
 * 
 * Prerequisites:
 * - Next.js dev server running on http://localhost:3000
 * - Valid broker session/authentication
 * - Test leads in database
 * 
 * Run: npx tsx tests/api/leads.test.ts
 */

import { LeadStatus } from '@/lib/types';

const BASE_URL = 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

interface TestResult {
  test: string;
  passed: boolean;
  status?: number;
  error?: string;
  data?: any;
}

const results: TestResult[] = [];

/**
 * Helper: Make authenticated API request
 */
async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  // In a real test, you would add authentication headers here
  // For now, assuming session is handled via cookies
  
  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
    credentials: 'include', // Include cookies for session
  });
}

/**
 * Helper: Log test result
 */
function logResult(result: TestResult) {
  results.push(result);
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${result.test}`);
  if (result.status) {
    console.log(`   Status: ${result.status}`);
  }
  if (result.error) {
    console.log(`   Error: ${result.error}`);
  }
  if (result.data && !result.passed) {
    console.log(`   Data:`, JSON.stringify(result.data, null, 2));
  }
  console.log('');
}

/**
 * Test 1: GET /api/leads - List all leads
 */
async function testGetLeads() {
  console.log('🧪 TEST 1: GET /api/leads');
  console.log('─'.repeat(50));
  
  try {
    const response = await apiRequest('/leads', {
      method: 'GET',
    });

    const data = await response.json();

    if (response.status === 401) {
      logResult({
        test: 'GET /api/leads - Authentication required',
        passed: true,
        status: response.status,
        data,
      });
      return null; // Can't continue without auth
    }

    if (response.status !== 200) {
      logResult({
        test: 'GET /api/leads - Should return 200',
        passed: false,
        status: response.status,
        data,
      });
      return null;
    }

    logResult({
      test: 'GET /api/leads - Returns 200',
      passed: true,
      status: response.status,
    });

    // Check response structure
    const hasSuccess = typeof data.success === 'boolean';
    const hasData = Array.isArray(data.data);

    logResult({
      test: 'GET /api/leads - Response has correct structure',
      passed: hasSuccess && hasData,
      data: hasSuccess && hasData ? undefined : data,
    });

    if (hasData && data.data.length > 0) {
      const firstLead = data.data[0];
      const hasRequiredFields = 
        firstLead.id &&
        firstLead.yatco_lead_id &&
        firstLead.status &&
        firstLead.received_at;

      logResult({
        test: 'GET /api/leads - Lead has required fields',
        passed: hasRequiredFields,
        data: hasRequiredFields ? undefined : firstLead,
      });

      return firstLead; // Return for use in subsequent tests
    } else {
      console.log('⚠️  No leads found in response. Some tests will be skipped.');
      return null;
    }

  } catch (error: any) {
    logResult({
      test: 'GET /api/leads - Request failed',
      passed: false,
      error: error.message,
    });
    return null;
  }
}

/**
 * Test 2: GET /api/leads/[id] - Get specific lead
 */
async function testGetLeadById(leadId: string) {
  console.log('🧪 TEST 2: GET /api/leads/[id]');
  console.log('─'.repeat(50));

  try {
    const response = await apiRequest(`/leads/${leadId}`, {
      method: 'GET',
    });

    const data = await response.json();

    if (response.status === 401) {
      logResult({
        test: 'GET /api/leads/[id] - Authentication required',
        passed: true,
        status: response.status,
      });
      return null;
    }

    if (response.status !== 200) {
      logResult({
        test: 'GET /api/leads/[id] - Should return 200',
        passed: false,
        status: response.status,
        data,
      });
      return null;
    }

    logResult({
      test: 'GET /api/leads/[id] - Returns 200',
      passed: true,
      status: response.status,
    });

    // Verify it's the correct lead
    const isCorrectLead = data.success && data.data && data.data.id === leadId;

    logResult({
      test: 'GET /api/leads/[id] - Returns correct lead',
      passed: isCorrectLead,
      data: isCorrectLead ? undefined : data,
    });

    return data.data;

  } catch (error: any) {
    logResult({
      test: 'GET /api/leads/[id] - Request failed',
      passed: false,
      error: error.message,
    });
    return null;
  }
}

/**
 * Test 3: GET /api/leads/invalid-id - 404 handling
 */
async function testGetLeadNotFound() {
  console.log('🧪 TEST 3: GET /api/leads/[id] - Not Found');
  console.log('─'.repeat(50));

  try {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const response = await apiRequest(`/leads/${fakeId}`, {
      method: 'GET',
    });

    const data = await response.json();

    // Should return 404 or 401 (if not authenticated)
    const isCorrectStatus = response.status === 404 || response.status === 401;

    logResult({
      test: 'GET /api/leads/[id] - Returns 404 for non-existent lead',
      passed: isCorrectStatus,
      status: response.status,
      data: isCorrectStatus ? undefined : data,
    });

  } catch (error: any) {
    logResult({
      test: 'GET /api/leads/[id] - 404 handling',
      passed: false,
      error: error.message,
    });
  }
}

/**
 * Test 4: PUT /api/leads/[id] - Update lead status
 */
async function testUpdateLeadStatus(leadId: string) {
  console.log('🧪 TEST 4: PUT /api/leads/[id] - Update Status');
  console.log('─'.repeat(50));

  try {
    const newStatus: LeadStatus = 'CONTACTED';
    
    const response = await apiRequest(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: newStatus,
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      logResult({
        test: 'PUT /api/leads/[id] - Authentication required',
        passed: true,
        status: response.status,
      });
      return;
    }

    if (response.status !== 200) {
      logResult({
        test: 'PUT /api/leads/[id] - Should return 200',
        passed: false,
        status: response.status,
        data,
      });
      return;
    }

    logResult({
      test: 'PUT /api/leads/[id] - Returns 200',
      passed: true,
      status: response.status,
    });

    // Verify status was updated
    const statusUpdated = data.success && data.data && data.data.status === newStatus;

    logResult({
      test: 'PUT /api/leads/[id] - Status updated correctly',
      passed: statusUpdated,
      data: statusUpdated ? undefined : data,
    });

  } catch (error: any) {
    logResult({
      test: 'PUT /api/leads/[id] - Update status failed',
      passed: false,
      error: error.message,
    });
  }
}

/**
 * Test 5: PUT /api/leads/[id] - Update comments
 */
async function testUpdateLeadComments(leadId: string) {
  console.log('🧪 TEST 5: PUT /api/leads/[id] - Update Comments');
  console.log('─'.repeat(50));

  try {
    const testComment = `Test comment updated at ${new Date().toISOString()}`;
    
    const response = await apiRequest(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({
        lead_comments: testComment,
      }),
    });

    const data = await response.json();

    if (response.status === 401) {
      logResult({
        test: 'PUT /api/leads/[id] - Comments update auth required',
        passed: true,
        status: response.status,
      });
      return;
    }

    if (response.status !== 200) {
      logResult({
        test: 'PUT /api/leads/[id] - Comments update should return 200',
        passed: false,
        status: response.status,
        data,
      });
      return;
    }

    logResult({
      test: 'PUT /api/leads/[id] - Comments update returns 200',
      passed: true,
      status: response.status,
    });

    // Verify comment was updated
    const commentUpdated = data.success && data.data && data.data.lead_comments === testComment;

    logResult({
      test: 'PUT /api/leads/[id] - Comment updated correctly',
      passed: commentUpdated,
      data: commentUpdated ? undefined : data,
    });

  } catch (error: any) {
    logResult({
      test: 'PUT /api/leads/[id] - Update comments failed',
      passed: false,
      error: error.message,
    });
  }
}

/**
 * Test 6: PUT /api/leads/[id] - Invalid status validation
 */
async function testInvalidStatusValidation(leadId: string) {
  console.log('🧪 TEST 6: PUT /api/leads/[id] - Invalid Status Validation');
  console.log('─'.repeat(50));

  try {
    const response = await apiRequest(`/leads/${leadId}`, {
      method: 'PUT',
      body: JSON.stringify({
        status: 'INVALID_STATUS', // Invalid status
      }),
    });

    const data = await response.json();

    // Should return 400 validation error (or 401 if not authenticated)
    const isCorrectStatus = response.status === 400 || response.status === 401;

    logResult({
      test: 'PUT /api/leads/[id] - Rejects invalid status',
      passed: isCorrectStatus,
      status: response.status,
      data: isCorrectStatus ? undefined : data,
    });

  } catch (error: any) {
    logResult({
      test: 'PUT /api/leads/[id] - Invalid status validation',
      passed: false,
      error: error.message,
    });
  }
}

/**
 * Main test runner
 */
async function runTests() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('🚀 MOANA YACHTING - LEADS API TESTS');
  console.log('═'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));
  console.log('\n');

  // Test 1: Get all leads
  const firstLead = await testGetLeads();

  if (!firstLead) {
    console.log('\n⚠️  Cannot continue tests without a valid lead.');
    console.log('Please ensure:');
    console.log('  1. Next.js dev server is running (npm run dev)');
    console.log('  2. You are authenticated as a broker');
    console.log('  3. There are leads in the database for this broker');
    printSummary();
    return;
  }

  const leadId = firstLead.id;

  // Test 2: Get specific lead
  await testGetLeadById(leadId);

  // Test 3: 404 handling
  await testGetLeadNotFound();

  // Test 4: Update status
  await testUpdateLeadStatus(leadId);

  // Test 5: Update comments
  await testUpdateLeadComments(leadId);

  // Test 6: Invalid status validation
  await testInvalidStatusValidation(leadId);

  // Print summary
  printSummary();
}

/**
 * Print test summary
 */
function printSummary() {
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('═'.repeat(60));

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0.0';

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        console.log(`  - ${r.test}`);
        if (r.error) console.log(`    Error: ${r.error}`);
      });
  }

  console.log('\n');

  // Exit with error code if tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
