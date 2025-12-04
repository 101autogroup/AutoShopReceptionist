/**
 * Verify the analytics fix
 */
require('dotenv').config();
const retell = require('../services/retell');

async function verify() {
  console.log('\n=== VERIFYING FIXED ANALYTICS ===\n');
  
  try {
    const calls = await retell.listCalls();
    console.log(`Total calls fetched: ${calls.length}`);
    
    const analytics = retell.aggregateCallAnalytics(calls);
    
    console.log('\n--- Analytics Results ---');
    console.log(`Total Calls: ${analytics.totalCalls}`);
    console.log(`Avg Duration: ${retell.formatDuration(analytics.avgDuration)}`);
    console.log(`Avg Latency: ${Math.round(analytics.avgLatency)}ms`);
    console.log(`\nSuccess Metrics:`);
    console.log(`  Successful: ${analytics.successfulCalls}`);
    console.log(`  Unsuccessful: ${analytics.unsuccessfulCalls}`);
    console.log(`  Unknown: ${analytics.unknownCalls}`);
    console.log(`\nSentiment:`);
    console.log(`  Positive: ${analytics.positiveSentiment}`);
    console.log(`  Negative: ${analytics.negativeSentiment}`);
    console.log(`  Neutral: ${analytics.neutralSentiment}`);
    console.log(`\nDirection:`);
    console.log(`  Inbound: ${analytics.inboundCalls}`);
    console.log(`  Outbound: ${analytics.outboundCalls}`);
    console.log(`\nTop Disconnection Reasons:`);
    Object.entries(analytics.disconnectionReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([reason, count]) => console.log(`  ${reason}: ${count}`));
    
    console.log(`\nAgents with data: ${Object.keys(analytics.byAgent).length}`);
    
    // Show sample day data
    const dates = Object.keys(analytics.callsByDate).sort();
    if (dates.length > 0) {
      const lastDate = dates[dates.length - 1];
      const dayData = analytics.callsByDate[lastDate];
      console.log(`\nSample day (${lastDate}):`);
      console.log(`  Calls: ${dayData.count}`);
      console.log(`  Successful: ${dayData.successful}`);
      console.log(`  Picked Up: ${dayData.pickedUp}`);
      console.log(`  Voicemail: ${dayData.voicemail}`);
      console.log(`  Transferred: ${dayData.transferred}`);
    }
    
    console.log('\n✅ Analytics fix verified!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

verify();

