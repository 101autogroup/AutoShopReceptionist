/**
 * API Test Script for Retell AI Integration
 * Run with: node test/api-test.js
 */

require('dotenv').config();
const Retell = require('retell-sdk');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.bold}${colors.yellow}${msg}${colors.reset}\n${'─'.repeat(50)}`)
};

// Initialize Retell client
const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function testListAgents() {
  log.header('Testing: List Agents API');
  try {
    const agents = await client.agent.list();
    log.success(`Found ${agents.length} agents`);
    
    if (agents.length > 0) {
      console.log('\n  Sample agents:');
      agents.slice(0, 3).forEach((agent, i) => {
        console.log(`  ${i + 1}. ${agent.agent_name || 'Unnamed'} (${agent.agent_id.substring(0, 16)}...)`);
        console.log(`     Voice: ${agent.voice_id || 'default'}, Language: ${agent.language || 'en-US'}`);
      });
      if (agents.length > 3) {
        console.log(`  ... and ${agents.length - 3} more`);
      }
    }
    
    return { success: true, data: agents };
  } catch (error) {
    log.error(`Failed to list agents: ${error.message}`);
    return { success: false, error };
  }
}

async function testGetAgent(agentId) {
  log.header('Testing: Get Agent API');
  try {
    const agent = await client.agent.retrieve(agentId);
    log.success(`Retrieved agent: ${agent.agent_name || 'Unnamed'}`);
    
    console.log('\n  Agent details:');
    console.log(`  - ID: ${agent.agent_id}`);
    console.log(`  - Voice: ${agent.voice_id || 'default'}`);
    console.log(`  - Language: ${agent.language || 'en-US'}`);
    console.log(`  - Published: ${agent.is_published ? 'Yes' : 'No'}`);
    console.log(`  - Response Engine: ${agent.response_engine?.type || 'N/A'}`);
    
    return { success: true, data: agent };
  } catch (error) {
    log.error(`Failed to get agent: ${error.message}`);
    return { success: false, error };
  }
}

async function testListCalls() {
  log.header('Testing: List Calls API');
  try {
    // Get calls from last 30 days
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    const calls = await client.call.list({
      filter_criteria: {
        after_start_timestamp: thirtyDaysAgo
      },
      limit: 100
    });
    
    log.success(`Found ${calls.length} calls in the last 30 days`);
    
    if (calls.length > 0) {
      // Calculate some stats
      const successful = calls.filter(c => c.call_successful === true).length;
      const withRecording = calls.filter(c => c.recording_url).length;
      
      console.log('\n  Call statistics:');
      console.log(`  - Successful: ${successful}/${calls.length} (${((successful/calls.length)*100).toFixed(1)}%)`);
      console.log(`  - With recording: ${withRecording}/${calls.length}`);
      
      console.log('\n  Recent calls:');
      calls.slice(0, 3).forEach((call, i) => {
        const date = call.start_timestamp 
          ? new Date(call.start_timestamp).toLocaleString() 
          : 'Unknown';
        const duration = call.end_timestamp && call.start_timestamp
          ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
          : 0;
        console.log(`  ${i + 1}. ${date} - ${duration}s - ${call.call_successful ? 'Success' : 'Failed'}`);
      });
    }
    
    return { success: true, data: calls };
  } catch (error) {
    log.error(`Failed to list calls: ${error.message}`);
    return { success: false, error };
  }
}

async function testGetCall(callId) {
  log.header('Testing: Get Call API');
  try {
    const call = await client.call.retrieve(callId);
    log.success(`Retrieved call: ${call.call_id.substring(0, 16)}...`);
    
    console.log('\n  Call details:');
    console.log(`  - Status: ${call.call_successful ? 'Successful' : 'Failed'}`);
    console.log(`  - Direction: ${call.direction || 'N/A'}`);
    console.log(`  - Sentiment: ${call.user_sentiment || 'N/A'}`);
    console.log(`  - Has Recording: ${call.recording_url ? 'Yes' : 'No'}`);
    console.log(`  - Has Transcript: ${call.transcript ? 'Yes' : 'No'}`);
    
    return { success: true, data: call };
  } catch (error) {
    log.error(`Failed to get call: ${error.message}`);
    return { success: false, error };
  }
}

async function testListLLMs() {
  log.header('Testing: List LLMs API');
  try {
    const llms = await client.llm.list();
    log.success(`Found ${llms.length} LLMs`);
    
    if (llms.length > 0) {
      console.log('\n  LLMs:');
      llms.slice(0, 5).forEach((llm, i) => {
        console.log(`  ${i + 1}. ${llm.llm_id.substring(0, 20)}...`);
      });
    }
    
    return { success: true, data: llms };
  } catch (error) {
    log.error(`Failed to list LLMs: ${error.message}`);
    return { success: false, error };
  }
}

async function runAllTests() {
  console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║      Retell AI API Integration Test Suite          ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}`);
  
  // Check for API key
  if (!process.env.RETELL_API_KEY) {
    log.error('RETELL_API_KEY not found in environment variables!');
    log.info('Make sure you have a .env file with RETELL_API_KEY set.');
    process.exit(1);
  }
  
  log.info(`API Key: ${process.env.RETELL_API_KEY.substring(0, 8)}...${process.env.RETELL_API_KEY.slice(-4)}`);
  
  const results = {
    listAgents: null,
    getAgent: null,
    listCalls: null,
    getCall: null,
    listLLMs: null
  };
  
  // Test 1: List Agents
  results.listAgents = await testListAgents();
  
  // Test 2: Get specific agent (if we have any)
  if (results.listAgents.success && results.listAgents.data.length > 0) {
    const firstAgentId = results.listAgents.data[0].agent_id;
    results.getAgent = await testGetAgent(firstAgentId);
  } else {
    log.info('Skipping Get Agent test (no agents found)');
  }
  
  // Test 3: List Calls
  results.listCalls = await testListCalls();
  
  // Test 4: Get specific call (if we have any)
  if (results.listCalls.success && results.listCalls.data.length > 0) {
    const firstCallId = results.listCalls.data[0].call_id;
    results.getCall = await testGetCall(firstCallId);
  } else {
    log.info('Skipping Get Call test (no calls found)');
  }
  
  // Test 5: List LLMs
  results.listLLMs = await testListLLMs();
  
  // Summary
  log.header('Test Summary');
  const tests = [
    { name: 'List Agents', result: results.listAgents },
    { name: 'Get Agent', result: results.getAgent },
    { name: 'List Calls', result: results.listCalls },
    { name: 'Get Call', result: results.getCall },
    { name: 'List LLMs', result: results.listLLMs }
  ];
  
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  
  tests.forEach(test => {
    if (test.result === null) {
      console.log(`  ${colors.yellow}○${colors.reset} ${test.name}: Skipped`);
      skipped++;
    } else if (test.result.success) {
      console.log(`  ${colors.green}✓${colors.reset} ${test.name}: Passed`);
      passed++;
    } else {
      console.log(`  ${colors.red}✗${colors.reset} ${test.name}: Failed`);
      failed++;
    }
  });
  
  console.log(`\n  ${colors.bold}Results: ${passed} passed, ${failed} failed, ${skipped} skipped${colors.reset}\n`);
  
  if (failed === 0) {
    console.log(`${colors.green}${colors.bold}All API tests passed! Your Retell integration is working correctly.${colors.reset}\n`);
  } else {
    console.log(`${colors.red}${colors.bold}Some tests failed. Please check your API key and network connection.${colors.reset}\n`);
  }
}

// Run tests
runAllTests().catch(error => {
  log.error(`Test suite crashed: ${error.message}`);
  console.error(error);
  process.exit(1);
});

