/**
 * Debug Call Analysis Structure
 */

require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function debugCallAnalysis() {
  console.log('\n=== Debugging Call Analysis ===\n');

  try {
    // Get some calls with actual conversations
    const calls = await client.call.list({ limit: 20 });
    
    // Find calls with actual duration (not just dial_no_answer)
    const realCalls = calls.filter(c => {
      const duration = c.end_timestamp && c.start_timestamp 
        ? (c.end_timestamp - c.start_timestamp) / 1000 
        : 0;
      return duration > 10; // Calls longer than 10 seconds
    });
    
    console.log(`Found ${realCalls.length} calls with duration > 10s\n`);
    
    for (let i = 0; i < Math.min(3, realCalls.length); i++) {
      const call = realCalls[i];
      const fullCall = await client.call.retrieve(call.call_id);
      
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Call ${i + 1}: ${call.call_id}`);
      console.log(`${'='.repeat(60)}`);
      
      // Print ALL fields
      console.log('\n--- All Top-Level Fields ---');
      const fields = Object.keys(fullCall).sort();
      fields.forEach(key => {
        const val = fullCall[key];
        if (typeof val === 'object' && val !== null) {
          console.log(`${key}: [object]`);
        } else {
          console.log(`${key}: ${val}`);
        }
      });
      
      // Print call_analysis in detail
      if (fullCall.call_analysis) {
        console.log('\n--- call_analysis Object ---');
        console.log(JSON.stringify(fullCall.call_analysis, null, 2));
      }
      
      // Print e2e_latency if exists
      if (fullCall.e2e_latency) {
        console.log('\n--- e2e_latency Object ---');
        console.log(JSON.stringify(fullCall.e2e_latency, null, 2));
      }
      
      // Check for latency in transcript_object
      if (fullCall.transcript_object && fullCall.transcript_object.length > 0) {
        console.log('\n--- Sample transcript_object entry ---');
        console.log(JSON.stringify(fullCall.transcript_object[0], null, 2));
      }
    }
    
    // Now let's compute proper analytics using correct fields
    console.log('\n\n' + '='.repeat(60));
    console.log('CORRECTED ANALYTICS CALCULATION');
    console.log('='.repeat(60));
    
    // Fetch more calls for stats
    const allCalls = await client.call.list({ limit: 1000 });
    
    // Get detailed data for a sample to understand structure
    let successCount = 0;
    let unsuccessCount = 0;
    let unknownCount = 0;
    let positiveSentiment = 0;
    let negativeSentiment = 0;
    let neutralSentiment = 0;
    let totalLatency = 0;
    let latencyCount = 0;
    
    // Sample 50 calls to check call_analysis
    console.log('\nFetching detailed data for 50 calls...');
    
    for (let i = 0; i < Math.min(50, allCalls.length); i++) {
      try {
        const fullCall = await client.call.retrieve(allCalls[i].call_id);
        
        // Check call_analysis for sentiment and success
        if (fullCall.call_analysis) {
          const analysis = fullCall.call_analysis;
          
          // Sentiment
          const sentiment = (analysis.user_sentiment || '').toLowerCase();
          if (sentiment === 'positive') positiveSentiment++;
          else if (sentiment === 'negative') negativeSentiment++;
          else if (sentiment === 'neutral') neutralSentiment++;
          
          // Call successful might be in analysis
          if (analysis.call_successful === true) successCount++;
          else if (analysis.call_successful === false) unsuccessCount++;
          else unknownCount++;
        }
        
        // Latency from e2e_latency
        if (fullCall.e2e_latency && fullCall.e2e_latency.p50) {
          totalLatency += fullCall.e2e_latency.p50;
          latencyCount++;
        }
        
        process.stdout.write(`\rProcessed ${i + 1}/50 calls...`);
      } catch (e) {
        // Skip failed fetches
      }
    }
    
    console.log('\n\n--- Results from 50 sampled calls ---');
    console.log(`Successful: ${successCount}`);
    console.log(`Unsuccessful: ${unsuccessCount}`);
    console.log(`Unknown: ${unknownCount}`);
    console.log(`Positive sentiment: ${positiveSentiment}`);
    console.log(`Negative sentiment: ${negativeSentiment}`);
    console.log(`Neutral sentiment: ${neutralSentiment}`);
    console.log(`Avg latency: ${latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0}ms`);
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error);
  }
}

debugCallAnalysis();

