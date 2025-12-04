const Retell = require('retell-sdk');

// Initialize Retell client
const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

/**
 * Get all agents from Retell
 * Note: The API returns agent version history (same agent appears multiple times)
 * This function deduplicates by agent_id, keeping the most recently modified version
 */
async function listAgents() {
  try {
    const allAgents = await client.agent.list();
    
    // Deduplicate by agent_id - API returns version history
    // Keep the first occurrence (most recent) since results are sorted by last_modification_timestamp desc
    const uniqueAgentsMap = new Map();
    
    for (const agent of allAgents) {
      if (!uniqueAgentsMap.has(agent.agent_id)) {
        uniqueAgentsMap.set(agent.agent_id, agent);
      }
    }
    
    const uniqueAgents = Array.from(uniqueAgentsMap.values());
    console.log(`Fetched ${allAgents.length} agent versions, ${uniqueAgents.length} unique agents`);
    
    return uniqueAgents;
  } catch (error) {
    console.error('Error listing agents:', error);
    throw error;
  }
}

/**
 * Get a specific agent by ID
 */
async function getAgent(agentId) {
  try {
    const agent = await client.agent.retrieve(agentId);
    return agent;
  } catch (error) {
    console.error(`Error getting agent ${agentId}:`, error);
    throw error;
  }
}

/**
 * List calls with optional filters - FETCHES ALL with pagination
 */
async function listCalls(options = {}) {
  try {
    const filterCriteria = {};
    
    if (options.agentIds && options.agentIds.length > 0) {
      filterCriteria.agent_id = options.agentIds;
    }
    
    if (options.afterTimestamp) {
      filterCriteria.after_start_timestamp = options.afterTimestamp;
    }
    
    if (options.beforeTimestamp) {
      filterCriteria.before_start_timestamp = options.beforeTimestamp;
    }

    // Fetch ALL calls using pagination
    let allCalls = [];
    let hasMore = true;
    let lastTimestamp = null;
    const batchSize = 1000; // Max per request
    
    while (hasMore) {
      const params = {
        sort_order: 'descending',
        limit: batchSize
      };
      
      if (Object.keys(filterCriteria).length > 0) {
        params.filter_criteria = { ...filterCriteria };
      }
      
      // For pagination: fetch calls older than the last one we got
      if (lastTimestamp) {
        params.filter_criteria = params.filter_criteria || {};
        params.filter_criteria.before_start_timestamp = lastTimestamp;
      }
      
      const batch = await client.call.list(params);
      
      if (batch.length === 0) {
        hasMore = false;
      } else {
        allCalls = allCalls.concat(batch);
        
        // Get the oldest timestamp from this batch for next pagination
        const oldestCall = batch[batch.length - 1];
        if (oldestCall && oldestCall.start_timestamp) {
          lastTimestamp = oldestCall.start_timestamp;
        }
        
        // If we got less than batchSize, we've reached the end
        if (batch.length < batchSize) {
          hasMore = false;
        }
        
        // Safety limit to prevent infinite loops (max 10 pages = 10,000 calls)
        if (allCalls.length >= 10000) {
          console.log('Reached safety limit of 10,000 calls');
          hasMore = false;
        }
      }
    }
    
    console.log(`Fetched ${allCalls.length} total calls`);
    return allCalls;
  } catch (error) {
    console.error('Error listing calls:', error);
    throw error;
  }
}

/**
 * Get a specific call by ID
 */
async function getCall(callId) {
  try {
    const call = await client.call.retrieve(callId);
    return call;
  } catch (error) {
    console.error(`Error getting call ${callId}:`, error);
    throw error;
  }
}

/**
 * Get all LLMs from Retell
 */
async function listLLMs() {
  try {
    const llms = await client.llm.list();
    return llms;
  } catch (error) {
    console.error('Error listing LLMs:', error);
    throw error;
  }
}

/**
 * Get a specific LLM by ID
 */
async function getLLM(llmId) {
  try {
    const llm = await client.llm.retrieve(llmId);
    return llm;
  } catch (error) {
    console.error(`Error getting LLM ${llmId}:`, error);
    throw error;
  }
}

/**
 * Aggregate call analytics from a list of calls
 * Uses correct field paths from call_analysis object
 */
function aggregateCallAnalytics(calls) {
  const analytics = {
    totalCalls: calls.length,
    totalDuration: 0,
    avgDuration: 0,
    totalLatency: 0,
    avgLatency: 0,
    
    // Success metrics (from call_analysis.call_successful)
    successfulCalls: 0,
    unsuccessfulCalls: 0,
    unknownCalls: 0,
    
    // Sentiment (from call_analysis.user_sentiment)
    positiveSentiment: 0,
    negativeSentiment: 0,
    neutralSentiment: 0,
    
    // Direction
    inboundCalls: 0,
    outboundCalls: 0,
    
    // Disconnection reasons
    disconnectionReasons: {},
    
    // Time series data (grouped by date)
    callsByDate: {},
    
    // By agent
    byAgent: {}
  };

  if (calls.length === 0) return analytics;

  let latencyCount = 0;

  calls.forEach(call => {
    // Duration - use duration_ms directly (more accurate)
    const durationMs = call.duration_ms || 0;
    const duration = durationMs / 1000; // Convert to seconds
    analytics.totalDuration += duration;

    // Latency - from latency.e2e.p50 (end-to-end latency)
    if (call.latency && call.latency.e2e && call.latency.e2e.p50) {
      analytics.totalLatency += call.latency.e2e.p50;
      latencyCount++;
    }

    // Call Analysis data
    const analysis = call.call_analysis || {};
    
    // Success status (from call_analysis.call_successful)
    if (analysis.call_successful === true) {
      analytics.successfulCalls++;
    } else if (analysis.call_successful === false) {
      analytics.unsuccessfulCalls++;
    } else {
      analytics.unknownCalls++;
    }

    // Sentiment (from call_analysis.user_sentiment)
    const sentiment = (analysis.user_sentiment || 'Unknown').toLowerCase();
    if (sentiment === 'positive') {
      analytics.positiveSentiment++;
    } else if (sentiment === 'negative') {
      analytics.negativeSentiment++;
    } else if (sentiment === 'neutral') {
      analytics.neutralSentiment++;
    }

    // Direction
    if (call.direction === 'inbound') {
      analytics.inboundCalls++;
    } else if (call.direction === 'outbound') {
      analytics.outboundCalls++;
    }

    // Disconnection reason
    const reason = call.disconnection_reason || 'Unknown';
    analytics.disconnectionReasons[reason] = (analytics.disconnectionReasons[reason] || 0) + 1;

    // Time series - group by date
    if (call.start_timestamp) {
      const date = new Date(call.start_timestamp).toISOString().split('T')[0];
      if (!analytics.callsByDate[date]) {
        analytics.callsByDate[date] = {
          count: 0,
          successful: 0,
          unsuccessful: 0,
          unknown: 0,
          totalDuration: 0,
          totalLatency: 0,
          latencyCount: 0,
          pickedUp: 0,
          transferred: 0,
          voicemail: 0,
          // Sentiment by date
          positiveSentiment: 0,
          negativeSentiment: 0,
          neutralSentiment: 0,
          // Disconnection reasons by date
          disconnectionReasons: {}
        };
      }
      const dayData = analytics.callsByDate[date];
      dayData.count++;
      
      if (analysis.call_successful === true) dayData.successful++;
      else if (analysis.call_successful === false) dayData.unsuccessful++;
      else dayData.unknown++;
      
      dayData.totalDuration += duration;
      
      if (call.latency && call.latency.e2e && call.latency.e2e.p50) {
        dayData.totalLatency += call.latency.e2e.p50;
        dayData.latencyCount++;
      }
      
      // Voicemail detection from call_analysis.in_voicemail or disconnection_reason
      if (analysis.in_voicemail === true || call.disconnection_reason === 'voicemail_reached') {
        dayData.voicemail++;
      }
      
      // Picked up = call connected and wasn't voicemail
      if (call.call_status === 'ended' && duration > 0 && !analysis.in_voicemail) {
        dayData.pickedUp++;
      }
      
      // Transfer detection from disconnection_reason
      if (call.disconnection_reason === 'call_transfer') {
        dayData.transferred++;
      }
      
      // Sentiment by date
      if (sentiment === 'positive') dayData.positiveSentiment++;
      else if (sentiment === 'negative') dayData.negativeSentiment++;
      else if (sentiment === 'neutral') dayData.neutralSentiment++;
      
      // Disconnection reasons by date
      dayData.disconnectionReasons[reason] = (dayData.disconnectionReasons[reason] || 0) + 1;
    }

    // By agent
    const agentId = call.agent_id || 'Unknown';
    const agentName = call.agent_name || agentId.substring(0, 12);
    
    if (!analytics.byAgent[agentId]) {
      analytics.byAgent[agentId] = {
        name: agentName,
        calls: 0,
        successful: 0,
        pickedUp: 0,
        transferred: 0
      };
    }
    
    const agentData = analytics.byAgent[agentId];
    agentData.calls++;
    if (analysis.call_successful === true) agentData.successful++;
    if (call.call_status === 'ended' && duration > 0 && !analysis.in_voicemail) agentData.pickedUp++;
    if (call.disconnection_reason === 'call_transfer') agentData.transferred++;
  });

  // Calculate averages
  analytics.avgDuration = calls.length > 0 ? analytics.totalDuration / calls.length : 0;
  analytics.avgLatency = latencyCount > 0 ? analytics.totalLatency / latencyCount : 0;

  return analytics;
}

/**
 * Format duration from seconds to MM:SS
 */
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

module.exports = {
  listAgents,
  getAgent,
  listCalls,
  getCall,
  listLLMs,
  getLLM,
  aggregateCallAnalytics,
  formatDuration
};
