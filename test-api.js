const http = require('http');

console.log('=== Testing API Endpoint ===');
console.log('URL: http://localhost:3000/api/listings');
console.log('');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/listings',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  console.log('');
  console.log('Make sure the Next.js dev server is running with: npm run dev');
});

req.end();
