import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testCrud() {
  console.log('🧪 Testing CRUD operations...\n');

  const testBroker = process.env.TEST_BROKER_NAME;
  const testPassword = process.env.TEST_BROKER_PASSWORD;
  if (!testBroker || !testPassword) {
    throw new Error('TEST_BROKER_NAME and TEST_BROKER_PASSWORD are required');
  }

  try {
    // Step 1: Login
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
    if (!loginResponse.ok) {
      throw new Error(`Login failed: ${loginData.error}`);
    }

    const cookies = loginResponse.headers.get('set-cookie');
    console.log('✅ Login successful\n');

    // Step 2: Create a new listing
    console.log('Step 2: Creating a new listing...');
    const newListing = {
      nomBateau: 'Test Boat',
      constructeur: 'Test Manufacturer',
      longueur: 25.5,
      annee: 2020,
      proprietaire: 'Test Owner',
      capitaine: 'Test Captain',
      broker: testBroker,
      localisation: 'Test Location',
      prix: "1,000,000 €",
      commentaire: 'Test boat for CRUD testing',
    };

    const createResponse = await fetch('http://localhost:3000/api/listings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || '',
      },
      body: JSON.stringify(newListing),
    });

    const createData = await createResponse.json();
    console.log('Status:', createResponse.status);

    if (!createResponse.ok) {
      console.error('❌ Create failed!');
      console.error('Error:', createData.error);
      console.error('Data:', JSON.stringify(createData, null, 2));
      return;
    }

    console.log('✅ Listing created successfully!');
    console.log('ID:', createData.data.id);
    const listingId = createData.data.id;

    // Step 3: Update the listing
    console.log('\nStep 3: Updating the listing...');
    const updateData = {
      prix: "1,200,000 €",
      commentaire: 'Updated test boat',
    };

    const updateResponse = await fetch(`http://localhost:3000/api/listings/${listingId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookies || '',
      },
      body: JSON.stringify(updateData),
    });

    const updatedData = await updateResponse.json();
    console.log('Status:', updateResponse.status);

    if (!updateResponse.ok) {
      console.error('❌ Update failed!');
      console.error('Error:', updatedData.error);
      console.error('Data:', JSON.stringify(updatedData, null, 2));
    } else {
      console.log('✅ Listing updated successfully!');
    }

    // Step 4: Delete the listing
    console.log('\nStep 4: Deleting the listing...');
    const deleteResponse = await fetch(`http://localhost:3000/api/listings/${listingId}`, {
      method: 'DELETE',
      headers: {
        'Cookie': cookies || '',
      },
    });

    const deleteData = await deleteResponse.json();
    console.log('Status:', deleteResponse.status);

    if (!deleteResponse.ok) {
      console.error('❌ Delete failed!');
      console.error('Error:', deleteData.error);
    } else {
      console.log('✅ Listing deleted successfully!');
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCrud()
  .then(() => {
    console.log('\n✅ All tests completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
