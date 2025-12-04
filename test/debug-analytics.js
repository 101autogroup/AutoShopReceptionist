/**
 * Debug Analytics Data
 * Compares what we fetch vs what Retell shows
 * Run: node test/debug-analytics.js
 */

require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

async function fetchAllCalls() {
  console.log(`\n${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}         Debug Analytics - Fetching All Data           ${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}═══════════════════════════════════════════════════════${colors.reset}\n`);

  try {
    // Fetch ALL calls without limit to get accurate count
    console.log(`${colors.yellow}Fetching all calls (no limit)...${colors.reset}`);
    
    let allCalls = [];
    let hasMore = true;
    let pageCount = 0;
    
    // The Retell API returns paginated results
    // We need to fetch all pages
    const batchSize = 1000;
    let lastCallId = null;
    
    while (hasMore) {
      pageCount++;
      console.log(`  Fetching page ${pageCount}...`);
      
      const params = {
        limit: batchSize,
        sort_order: 'descending'
      };
      
      // For pagination, we might need to use different approach
      // Let's first try without pagination to see what we get
      const calls = await client.call.list(params);
      
      console.log(`  Got ${calls.length} calls`);
      allCalls = calls;
      hasMore = false; // Retell SDK might handle pagination differently
    }
    
    console.log(`\n${colors.green}Total calls fetched: ${allCalls.length}${colors.reset}`);
    
    // Now let's analyze the data
    console.log(`\n${colors.bold}${colors.yellow}═══ DATA ANALYSIS ═══${colors.reset}\n`);
    
    // 1. Total Calls
    console.log(`${colors.cyan}1. CALL COUNTS${colors.reset}`);
    console.log(`   Total: ${allCalls.length}`);
    
    // 2. Call Duration
    console.log(`\n${colors.cyan}2. CALL DURATION${colors.reset}`);
    let totalDuration = 0;
    let callsWithDuration = 0;
    
    allCalls.forEach(call => {
      if (call.end_timestamp && call.start_timestamp) {
        const duration = (call.end_timestamp - call.start_timestamp) / 1000;
        if (duration > 0) {
          totalDuration += duration;
          callsWithDuration++;
        }
      }
    });
    
    const avgDuration = callsWithDuration > 0 ? totalDuration / callsWithDuration : 0;
    const mins = Math.floor(avgDuration / 60);
    const secs = Math.floor(avgDuration % 60);
    console.log(`   Calls with duration data: ${callsWithDuration}`);
    console.log(`   Total duration: ${totalDuration.toFixed(0)} seconds`);
    console.log(`   Average duration: ${mins}:${secs.toString().padStart(2, '0')}`);
    
    // 3. Latency
    console.log(`\n${colors.cyan}3. LATENCY${colors.reset}`);
    let totalLatency = 0;
    let callsWithLatency = 0;
    
    allCalls.forEach(call => {
      // Check different latency fields
      const latency = call.latency_p50 || call.e2e_latency_p50 || call.llm_latency_p50 || 0;
      if (latency > 0) {
        totalLatency += latency;
        callsWithLatency++;
      }
    });
    
    const avgLatency = callsWithLatency > 0 ? totalLatency / callsWithLatency : 0;
    console.log(`   Calls with latency data: ${callsWithLatency}`);
    console.log(`   Average latency: ${Math.round(avgLatency)}ms`);
    
    // Sample a call to see latency fields
    if (allCalls.length > 0) {
      const sampleCall = allCalls.find(c => c.latency_p50 || c.e2e_latency_p50) || allCalls[0];
      console.log(`   Sample call latency fields:`);
      console.log(`     - latency_p50: ${sampleCall.latency_p50}`);
      console.log(`     - e2e_latency_p50: ${sampleCall.e2e_latency_p50}`);
      console.log(`     - llm_latency_p50: ${sampleCall.llm_latency_p50}`);
    }
    
    // 4. Call Success
    console.log(`\n${colors.cyan}4. CALL SUCCESS${colors.reset}`);
    const successful = allCalls.filter(c => c.call_successful === true).length;
    const unsuccessful = allCalls.filter(c => c.call_successful === false).length;
    const unknown = allCalls.filter(c => c.call_successful === null || c.call_successful === undefined).length;
    console.log(`   Successful: ${successful}`);
    console.log(`   Unsuccessful: ${unsuccessful}`);
    console.log(`   Unknown: ${unknown}`);
    
    // 5. Disconnection Reasons
    console.log(`\n${colors.cyan}5. DISCONNECTION REASONS${colors.reset}`);
    const reasons = {};
    allCalls.forEach(call => {
      const reason = call.disconnection_reason || 'unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    Object.entries(reasons).sort((a, b) => b[1] - a[1]).forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });
    
    // 6. User Sentiment
    console.log(`\n${colors.cyan}6. USER SENTIMENT${colors.reset}`);
    const sentiments = { positive: 0, negative: 0, neutral: 0, unknown: 0 };
    allCalls.forEach(call => {
      const sentiment = (call.user_sentiment || 'unknown').toLowerCase();
      if (sentiment === 'positive') sentiments.positive++;
      else if (sentiment === 'negative') sentiments.negative++;
      else if (sentiment === 'neutral') sentiments.neutral++;
      else sentiments.unknown++;
    });
    console.log(`   Positive: ${sentiments.positive}`);
    console.log(`   Negative: ${sentiments.negative}`);
    console.log(`   Neutral: ${sentiments.neutral}`);
    console.log(`   Unknown/None: ${sentiments.unknown}`);
    
    // 7. Direction
    console.log(`\n${colors.cyan}7. CALL DIRECTION${colors.reset}`);
    const inbound = allCalls.filter(c => c.direction === 'inbound').length;
    const outbound = allCalls.filter(c => c.direction === 'outbound').length;
    const noDirection = allCalls.filter(c => !c.direction).length;
    console.log(`   Inbound: ${inbound}`);
    console.log(`   Outbound: ${outbound}`);
    console.log(`   No direction: ${noDirection}`);
    
    // 8. Rate Calculations
    console.log(`\n${colors.cyan}8. RATE CALCULATIONS${colors.reset}`);
    const pickedUp = allCalls.filter(c => c.answered_by === 'human').length;
    const voicemail = allCalls.filter(c => c.answered_by === 'voicemail').length;
    const transferred = allCalls.filter(c => c.call_transferred === true).length;
    
    console.log(`   Picked up (human): ${pickedUp} (${((pickedUp/allCalls.length)*100).toFixed(1)}%)`);
    console.log(`   Voicemail: ${voicemail} (${((voicemail/allCalls.length)*100).toFixed(1)}%)`);
    console.log(`   Transferred: ${transferred} (${((transferred/allCalls.length)*100).toFixed(1)}%)`);
    console.log(`   Success rate: ${((successful/allCalls.length)*100).toFixed(1)}%`);
    
    // 9. Sample raw call object
    console.log(`\n${colors.cyan}9. SAMPLE CALL OBJECT (first call)${colors.reset}`);
    if (allCalls.length > 0) {
      const sample = allCalls[0];
      console.log(`   call_id: ${sample.call_id}`);
      console.log(`   agent_id: ${sample.agent_id}`);
      console.log(`   call_successful: ${sample.call_successful}`);
      console.log(`   direction: ${sample.direction}`);
      console.log(`   disconnection_reason: ${sample.disconnection_reason}`);
      console.log(`   user_sentiment: ${sample.user_sentiment}`);
      console.log(`   answered_by: ${sample.answered_by}`);
      console.log(`   call_transferred: ${sample.call_transferred}`);
      console.log(`   start_timestamp: ${sample.start_timestamp}`);
      console.log(`   end_timestamp: ${sample.end_timestamp}`);
      console.log(`   latency_p50: ${sample.latency_p50}`);
      console.log(`   e2e_latency_p50: ${sample.e2e_latency_p50}`);
    }
    
    console.log(`\n${colors.bold}${colors.green}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.bold}${colors.green}                    DEBUG COMPLETE                     ${colors.reset}`);
    console.log(`${colors.bold}${colors.green}═══════════════════════════════════════════════════════${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    console.error(error);
  }
}

fetchAllCalls();

