/**
 * Debug script to investigate agent listing
 */
require('dotenv').config();
const Retell = require('retell-sdk');

const client = new Retell({
  apiKey: process.env.RETELL_API_KEY
});

async function debugAgents() {
  console.log('=== Debugging Agents API ===\n');
  
  try {
    // Fetch agents directly from API
    const agents = await client.agent.list();
    
    console.log('Total agents returned:', agents.length);
    console.log('\n--- Raw API Response Type ---');
    console.log('Type:', typeof agents);
    console.log('Is Array:', Array.isArray(agents));
    
    console.log('\n--- All Agent IDs ---');
    const agentIds = agents.map(a => a.agent_id);
    agentIds.forEach((id, idx) => {
      console.log(`${idx + 1}. ${id}`);
    });
    
    // Check for duplicates
    console.log('\n--- Checking for Duplicates ---');
    const uniqueIds = new Set(agentIds);
    console.log('Total agent IDs:', agentIds.length);
    console.log('Unique agent IDs:', uniqueIds.size);
    
    if (agentIds.length !== uniqueIds.size) {
      console.log('\n⚠️  DUPLICATES FOUND!');
      const counts = {};
      agentIds.forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
      });
      Object.entries(counts).forEach(([id, count]) => {
        if (count > 1) {
          console.log(`  - ${id}: appears ${count} times`);
        }
      });
    } else {
      console.log('✅ No duplicate agent IDs in API response');
    }
    
    console.log('\n--- Agent Details ---');
    agents.forEach((agent, idx) => {
      console.log(`\n${idx + 1}. ${agent.agent_name || 'Unnamed'}`);
      console.log(`   ID: ${agent.agent_id}`);
      console.log(`   Created: ${agent.created_timestamp ? new Date(agent.created_timestamp).toISOString() : 'N/A'}`);
      console.log(`   Last Modified: ${agent.last_modification_timestamp ? new Date(agent.last_modification_timestamp).toISOString() : 'N/A'}`);
    });
    
    // Check for agents with same name
    console.log('\n--- Checking for Same Names ---');
    const nameGroups = {};
    agents.forEach(a => {
      const name = a.agent_name || 'Unnamed';
      if (!nameGroups[name]) nameGroups[name] = [];
      nameGroups[name].push(a.agent_id);
    });
    
    let hasDuplicateNames = false;
    Object.entries(nameGroups).forEach(([name, ids]) => {
      if (ids.length > 1) {
        hasDuplicateNames = true;
        console.log(`\n⚠️  Multiple agents named "${name}":`);
        ids.forEach(id => console.log(`   - ${id}`));
      }
    });
    
    if (!hasDuplicateNames) {
      console.log('✅ No duplicate agent names found');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

debugAgents();

