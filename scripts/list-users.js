#!/usr/bin/env node
/**
 * List All Users Script
 * 
 * Usage:
 *   node scripts/list-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// Colors for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

async function listUsers() {
  console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║              AI-Telle User List                    ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle');
    
    const users = await User.find().sort({ createdAt: -1 });
    
    if (users.length === 0) {
      console.log(`  ${colors.yellow}No users found in the database.${colors.reset}`);
      console.log(`  Run ${colors.cyan}node scripts/create-admin.js${colors.reset} to create an admin user.\n`);
    } else {
      console.log(`  Found ${colors.bold}${users.length}${colors.reset} user(s):\n`);
      
      // Header
      console.log(`  ${'─'.repeat(80)}`);
      console.log(`  ${colors.bold}${'Name'.padEnd(20)} ${'Email'.padEnd(30)} ${'Role'.padEnd(8)} Agents${colors.reset}`);
      console.log(`  ${'─'.repeat(80)}`);
      
      users.forEach(user => {
        const roleColor = user.role === 'admin' ? colors.yellow : colors.cyan;
        const agentCount = user.assignedAgentIds?.length || 0;
        
        console.log(
          `  ${user.name.substring(0, 19).padEnd(20)} ` +
          `${user.email.substring(0, 29).padEnd(30)} ` +
          `${roleColor}${user.role.padEnd(8)}${colors.reset} ` +
          `${agentCount}`
        );
      });
      
      console.log(`  ${'─'.repeat(80)}\n`);
      
      // Summary
      const adminCount = users.filter(u => u.role === 'admin').length;
      const userCount = users.filter(u => u.role === 'user').length;
      
      console.log(`  ${colors.bold}Summary:${colors.reset}`);
      console.log(`  - Admins: ${colors.yellow}${adminCount}${colors.reset}`);
      console.log(`  - Users: ${colors.cyan}${userCount}${colors.reset}\n`);
    }
    
  } catch (error) {
    console.log(`  ${colors.red}Error: ${error.message}${colors.reset}\n`);
  } finally {
    await mongoose.disconnect();
  }
}

listUsers();

