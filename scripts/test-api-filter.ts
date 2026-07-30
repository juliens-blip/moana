import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testApiFilter() {
  const testBroker = process.env.TEST_BROKER_NAME;
  const testPassword = process.env.TEST_BROKER_PASSWORD;
  if (!testBroker || !testPassword) {
    throw new Error('TEST_BROKER_NAME and TEST_BROKER_PASSWORD are required');
  }

  console.log(`🧪 Testing API /api/listings?broker=${testBroker}...\n`);

  try {
    // First, we need to login to get a session
    console.log(`Step 1: Logging in as ${testBroker}...`);
    const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        broker: testBroker,
        password: testPassword,
      }),
    });

    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);

    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginData.error}`);
    }

    // Extract cookies from response
    const cookies = loginResponse.headers.get('set-cookie');
    console.log('\nCookies received:', cookies ? 'Yes' : 'No');

    // Test 2: Get all listings (should work)
    console.log('\n\nStep 2: Getting all listings...');
    const allListingsResponse = await fetch('http://localhost:3000/api/listings', {
      headers: {
        'Cookie': cookies || '',
      },
    });

    const allListingsData = await allListingsResponse.json();
    console.log('Status:', allListingsResponse.status);
    console.log(`Total listings: ${allListingsData.data?.length || 0}`);

    // Test 3: Get filtered listings
    console.log(`\n\nStep 3: Getting filtered listings (broker=${testBroker})...`);
    const filteredResponse = await fetch(`http://localhost:3000/api/listings?broker=${encodeURIComponent(testBroker)}`, {
      headers: {
        'Cookie': cookies || '',
      },
    });

    const filteredData = await filteredResponse.json();
    console.log('Status:', filteredResponse.status);
    console.log('Response:', JSON.stringify(filteredData, null, 2));

    if (!filteredResponse.ok) {
      console.error('\n❌ Filter request failed!');
      console.error('Status:', filteredResponse.status);
      console.error('Error:', filteredData.error);
    } else {
      console.log(`\n✅ Filter successful! Found ${filteredData.data?.length || 0} listings`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testApiFilter()
  .then(() => {
    console.log('\n✅ Tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
