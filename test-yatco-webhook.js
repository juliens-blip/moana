/**
 * Test Yatco Webhook - Simule une réception de lead
 * Run: node test-yatco-webhook.js
 */

const http = require('http');

const WEBHOOK_URL = 'localhost';
const PORT = 3000;
const PATH = '/api/leads/yatco';

// Payload Yatco réaliste
const yatcoPayload = {
  lead: {
    id: `TEST-${Date.now()}`,
    date: new Date().toISOString(),
    source: "Boats Group",
    detailedSource: "YachtWorld-Broker SRP",
    detailedSourceSummary: "YachtWorld",
    requestType: "Contact Broker"
  },
  contact: {
    name: {
      display: "Jean Dupont",
      first: "Jean",
      last: "Dupont"
    },
    phone: "+33 6 12 34 56 78",
    email: "jean.dupont@example.com",
    country: "FR"
  },
  customerComments: "Je suis très intéressé par ce yacht. Pouvez-vous me contacter rapidement ?",
  leadComments: "Client premium - priorité haute",
  boat: {
    make: "Sunseeker",
    model: "Manhattan 76",
    year: "2020",
    condition: "Used",
    length: {
      measure: "23.2",
      units: "meters"
    },
    price: {
      amount: "1500000",
      currency: "EUR"
    },
    url: "https://www.yachtworld.com/yacht/2020-sunseeker-manhattan-76"
  },
  recipient: {
    officeName: "Moana Yachting",
    officeId: "389841",
    contactName: "PE"
  }
};

function sendWebhook() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(yatcoPayload);

    const options = {
      hostname: WEBHOOK_URL,
      port: PORT,
      path: PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        // Yatco IPs (bypassed in dev)
        'X-Forwarded-For': '35.171.79.77'
      }
    };

    console.log('\n🚀 Sending Yatco webhook...');
    console.log(`POST http://${WEBHOOK_URL}:${PORT}${PATH}`);
    console.log('─'.repeat(60));

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

    req.write(data);
    req.end();
  });
}

async function testWebhook() {
  try {
    console.log('\n═'.repeat(60));
    console.log('🧪 YATCO WEBHOOK TEST');
    console.log('═'.repeat(60));
    console.log(`Lead ID: ${yatcoPayload.lead.id}`);
    console.log(`Contact: ${yatcoPayload.contact.name.display}`);
    console.log(`Boat: ${yatcoPayload.boat.make} ${yatcoPayload.boat.model}`);
    console.log(`Recipient: ${yatcoPayload.recipient.contactName}`);
    console.log('═'.repeat(60));

    const { status, data } = await sendWebhook();

    console.log(`\n📬 Response Status: ${status}`);

    if (status === 201) {
      console.log('✅ SUCCESS - Lead créé');
      console.log(`   Lead ID: ${data.data?.id}`);
      console.log(`   Yatco ID: ${data.data?.yatco_lead_id}`);
      console.log(`   Broker: ${data.data?.broker_id ? 'Assigné' : 'Non assigné'}`);
      console.log(`   Status: ${data.data?.status}`);
    } else if (status === 200) {
      console.log('⚠️  DUPLICATE - Lead déjà existant');
      console.log(`   Lead ID: ${data.data?.id}`);
    } else if (status === 400) {
      console.log('❌ VALIDATION ERROR');
      console.log(`   ${data.message}`);
      if (data.details) {
        console.log('   Détails:', JSON.stringify(data.details, null, 2));
      }
    } else if (status === 403) {
      console.log('❌ FORBIDDEN - IP non autorisée');
      console.log('   (Normal en production, bypass en dev)');
    } else if (status === 500) {
      console.log('❌ SERVER ERROR');
      console.log(`   ${data.message || data}`);
    }

    console.log('\n📄 Full Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('\n');

  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.log('\n⚠️  Assurez-vous que le serveur dev tourne: npm run dev');
    process.exit(1);
  }
}

// Run test
testWebhook();
