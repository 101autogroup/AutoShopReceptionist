/**
 * Debug available fields in LIST response
 */
require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function debug() {
  const calls = await client.call.list({ limit: 3 });
  
  console.log('\n=== ALL FIELDS IN LIST RESPONSE ===\n');
  
  if (calls.length > 0) {
    const call = calls[0];
    console.log('Fields available:', Object.keys(call).sort().join(', '));
    console.log('\n--- Full first call object ---');
    console.log(JSON.stringify(call, null, 2));
  }
}

debug().catch(console.error);

