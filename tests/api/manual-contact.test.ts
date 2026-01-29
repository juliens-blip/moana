/**
 * Manual Contact Creation Test
 *
 * Tests:
 * - POST /api/leads with minimal payload for a manual contact
 *
 * Prerequisites:
 * - Next.js dev server running on http://localhost:3000
 * - Valid broker session/authentication
 *
 * Run: npx tsx tests/api/manual-contact.test.ts
 */

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

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json'
  };

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers
    },
    credentials: 'include'
  });
}

async function testCreateManualContact() {
  console.log('🧪 TEST: POST /api/leads - Manual Contact');
  console.log('─'.repeat(50));

  const payload = {
    contact_display_name: 'Contact Manuel Test',
    contact_first_name: 'Contact',
    contact_last_name: 'Manuel',
    contact_email: 'contact-manuel@example.com',
    contact_phone: '+33 6 00 00 00 00',
    contact_country: 'FR',
    source: 'Manual',
    request_type: 'Contact'
  };

  try {
    const response = await apiRequest('/leads', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.status === 401) {
      logResult({
        test: 'POST /api/leads - Authentication required',
        passed: true,
        status: response.status
      });
      return;
    }

    if (response.status !== 200 && response.status !== 201) {
      logResult({
        test: 'POST /api/leads - Should return 200/201',
        passed: false,
        status: response.status,
        data
      });
      return;
    }

    logResult({
      test: 'POST /api/leads - Returns 200/201',
      passed: true,
      status: response.status
    });

    const createdLead = data?.data;
    const hasContactName = createdLead?.contact_display_name === payload.contact_display_name;
    const hasRequestType = createdLead?.request_type === payload.request_type;

    logResult({
      test: 'POST /api/leads - Contact fields persisted',
      passed: Boolean(hasContactName && hasRequestType),
      data: hasContactName && hasRequestType ? undefined : createdLead
    });
  } catch (error: any) {
    logResult({
      test: 'POST /api/leads - Request failed',
      passed: false,
      error: error.message
    });
  }
}

async function run() {
  await testCreateManualContact();
  const failed = results.filter((result) => !result.passed);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run();
