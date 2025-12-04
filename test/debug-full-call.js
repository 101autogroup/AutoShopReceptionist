/**
 * Debug Full Call Details
 * Check if individual call fetch has more data
 */

require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function testFullCallDetails() {
  console.log('\n=== Testing Full Call Details ===\n');

  try {
    // First get a list of calls
    const calls = await client.call.list({ limit: 5 });
    
    console.log('Calls from LIST endpoint (limited fields):');
    console.log('------------------------------------------');
    
    for (const call of calls) {
      console.log(`\nCall ID: ${call.call_id}`);
      console.log(`  call_successful: ${call.call_successful}`);
      console.log(`  user_sentiment: ${call.user_sentiment}`);
      console.log(`  answered_by: ${call.answered_by}`);
      console.log(`  latency_p50: ${call.latency_p50}`);
      
      // Now fetch the full call details
      console.log('\n  >>> Fetching full details with RETRIEVE...');
      const fullCall = await client.call.retrieve(call.call_id);
      
      console.log(`  [FULL] call_successful: ${fullCall.call_successful}`);
      console.log(`  [FULL] user_sentiment: ${fullCall.user_sentiment}`);
      console.log(`  [FULL] answered_by: ${fullCall.answered_by}`);
      console.log(`  [FULL] latency_p50: ${fullCall.latency_p50}`);
      console.log(`  [FULL] e2e_latency: ${JSON.stringify(fullCall.e2e_latency)}`);
      console.log(`  [FULL] llm_latency: ${JSON.stringify(fullCall.llm_latency)}`);
      console.log(`  [FULL] call_analysis: ${JSON.stringify(fullCall.call_analysis)?.substring(0, 100)}`);
    }
    
    console.log('\n=== Conclusion ===');
    console.log('If RETRIEVE shows more data than LIST, we may need to:');
    console.log('1. Fetch each call individually (slow but accurate)');
    console.log('2. Or check if there are additional list parameters');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testFullCallDetails();

