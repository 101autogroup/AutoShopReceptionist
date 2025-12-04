/**
 * Verify total call count
 */
require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function verify() {
  console.log('\n=== VERIFYING CALL COUNT ===\n');
  
  // Test different limits
  const tests = [
    { limit: 100 },
    { limit: 500 },
    { limit: 1000 },
    { limit: 2000 },
    {} // no limit
  ];
  
  for (const params of tests) {
    try {
      const calls = await client.call.list(params);
      console.log(`limit: ${params.limit || 'none'} => Got ${calls.length} calls`);
    } catch (e) {
      console.log(`limit: ${params.limit || 'none'} => Error: ${e.message}`);
    }
  }
}

verify();

