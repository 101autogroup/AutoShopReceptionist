/**
 * Verify the agents deduplication fix
 */
require('dotenv').config();
const retell = require('../services/retell');

async function verifyFix() {
  console.log('=== Verifying Agents Fix ===\n');
  
  try {
    const agents = await retell.listAgents();
    
    console.log('Total unique agents:', agents.length);
    
    // Check for duplicates
    const ids = agents.map(a => a.agent_id);
    const uniqueIds = new Set(ids);
    
    if (ids.length === uniqueIds.size) {
      console.log('✅ No duplicates! Fix is working correctly.\n');
    } else {
      console.log('❌ Still have duplicates!');
    }
    
    console.log('--- Agent List ---');
    agents.forEach((agent, idx) => {
      console.log(`${idx + 1}. ${agent.agent_name || 'Unnamed'}`);
      console.log(`   ID: ${agent.agent_id}`);
      console.log(`   Last Modified: ${agent.last_modification_timestamp ? new Date(agent.last_modification_timestamp).toISOString() : 'N/A'}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verifyFix();

