const Retell = require('retell-sdk');

// Initialize Retell client
const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

/**
 * Small in-process TTL cache.
 *
 * The Retell API is by far the slowest thing this app touches. The dashboard
 * used to re-download the whole call history on every single page view, so
 * caching the result for a few minutes removes almost all of that cost for
 * repeat views and for several users looking at the same agents.
 */
const CACHE_TTL_MS = Number(process.env.RETELL_CACHE_TTL_MS || 5 * 60 * 1000);
const cacheStore = new Map();

function cacheGet(cacheKey) {
  const entry = cacheStore.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cacheStore.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function cacheSet(cacheKey, value) {
  if (cacheStore.size > 40) cacheStore.clear();
  cacheStore.set(cacheKey, { storedAt: Date.now(), value });
  return value;
}

function clearCache() {
  cacheStore.clear();
}

/**
 * Page size used when walking the agent list endpoint.
 */
const AGENT_PAGE_LIMIT = 1000;

/**
 * How many agent detail requests to run at once when hydrating the list.
 */
const AGENT_HYDRATE_CONCURRENCY = 5;

/**
 * List every voice agent via POST /v2/list-agents.
 *
 * The old GET /list-agents endpoint was deprecated on 07/31/2026 and returns
 * version history rather than unique agents. The v2 endpoint already returns
 * one row per agent, so no de-duplication is needed here; it pages instead,
 * so keep following pagination_key while has_more is true.
 *
 * retell-sdk v4 has no typed wrapper for this route yet, so the request goes
 * through the client's generic POST helper.
 */
async function listAgentSummaries() {
  const summaries = [];
  let paginationKey;

  // Bounded loop: a runaway pagination_key should never spin forever.
  for (let page = 0; page < 50; page++) {
    const response = await client.post('/v2/list-agents', {
      query: {
        limit: AGENT_PAGE_LIMIT,
        ...(paginationKey ? { pagination_key: paginationKey } : {})
      },
      body: {
        filter_criteria: {
          channel: { type: 'string', op: 'eq', value: 'voice' }
        }
      }
    });

    summaries.push(...(response?.items || []));

    if (!response?.has_more || !response?.pagination_key) break;
    paginationKey = response.pagination_key;
  }

  return summaries;
}

/**
 * Fetch full agent records for a set of summaries.
 *
 * The v2 list response is intentionally slim (id, name, channel, tags,
 * timestamp). The agents list and the admin assign screen also show voice,
 * language and response engine, so hydrate each row from GET /get-agent. This
 * only runs on a cache miss, and a failed detail lookup degrades to the slim
 * record instead of taking the whole page down.
 */
async function hydrateAgents(summaries) {
  const hydrated = [];

  for (let i = 0; i < summaries.length; i += AGENT_HYDRATE_CONCURRENCY) {
    const batch = summaries.slice(i, i + AGENT_HYDRATE_CONCURRENCY);

    const results = await Promise.all(
      batch.map(async summary => {
        try {
          const detail = await client.agent.retrieve(summary.agent_id);
          return { ...summary, ...detail };
        } catch (error) {
          console.error(`Error hydrating agent ${summary.agent_id}:`, error.message);
          return summary;
        }
      })
    );

    hydrated.push(...results);
  }

  return hydrated;
}

/**
 * Get all agents from Retell, with the detail fields the UI renders.
 */
async function listAgents() {
  try {
    const cachedAgents = cacheGet('agents');
    if (cachedAgents) return cachedAgents;

    const summaries = await listAgentSummaries();
    const agents = await hydrateAgents(summaries);

    console.log(`Fetched ${agents.length} unique agents`);

    return cacheSet('agents', agents);
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
 * Drop the heavyweight fields we never use in list or aggregate views.
 *
 * A raw Retell call object carries the full transcript plus the generated
 * summary. Multiplied by thousands of calls that is tens of megabytes held in
 * memory to produce numbers that only need timestamps and a few flags.
 */
function slimCall(call) {
  const slim = Object.assign({}, call);
  delete slim.transcript;
  delete slim.transcript_object;
  delete slim.transcript_with_tool_calls;
  delete slim.scrubbed_transcript_with_tool_calls;
  delete slim.llm_token_usage;

  if (slim.call_analysis) {
    slim.call_analysis = Object.assign({}, slim.call_analysis);
    delete slim.call_analysis.call_summary;
  }

  return slim;
}

/**
 * List calls with optional filters.
 *
 * Two things matter here:
 *  - filters go into filter_criteria so Retell narrows the result set server
 *    side. retell-sdk v4 expects start_timestamp as a threshold object; the
 *    flat after_start_timestamp / before_start_timestamp fields are silently
 *    ignored, which is why every date range used to return the whole history.
 *  - paging uses pagination_key, which is the call id of the last row of the
 *    previous page and is exclusive of that row.
 */
async function listCalls(options = {}) {
  try {
    const filterCriteria = {};

    if (options.agentIds && options.agentIds.length > 0) {
      filterCriteria.agent_id = options.agentIds;
    }

    const startTimestamp = {};
    if (options.afterTimestamp) {
      startTimestamp.lower_threshold = Math.round(options.afterTimestamp);
    }
    if (options.beforeTimestamp) {
      startTimestamp.upper_threshold = Math.round(options.beforeTimestamp);
    }
    if (Object.keys(startTimestamp).length > 0) {
      filterCriteria.start_timestamp = startTimestamp;
    }

    const cacheKey = 'calls:' + JSON.stringify(filterCriteria);
    const cachedCalls = cacheGet(cacheKey);
    if (cachedCalls) {
      console.log(`Serving ${cachedCalls.length} calls from cache`);
      return cachedCalls;
    }

    const batchSize = 1000; // API maximum per request
    const maxCalls = options.maxCalls || 30000;
    const allCalls = [];
    let paginationKey = null;
    let hasMore = true;

    while (hasMore) {
      const params = {
        sort_order: 'descending',
        limit: batchSize
      };

      if (Object.keys(filterCriteria).length > 0) {
        params.filter_criteria = filterCriteria;
      }

      if (paginationKey) {
        params.pagination_key = paginationKey;
      }

      const batch = await client.call.list(params);

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      for (const call of batch) {
        allCalls.push(slimCall(call));
      }

      paginationKey = batch[batch.length - 1].call_id;

      if (batch.length < batchSize || !paginationKey) {
        hasMore = false;
      }

      if (allCalls.length >= maxCalls) {
        console.log(`Reached safety limit of ${maxCalls} calls`);
        hasMore = false;
      }
    }

    console.log(`Fetched ${allCalls.length} total calls`);
    return cacheSet(cacheKey, allCalls);
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
  clearCache,
  getAgent,
  listCalls,
  getCall,
  listLLMs,
  getLLM,
  aggregateCallAnalytics,
  formatDuration
};
