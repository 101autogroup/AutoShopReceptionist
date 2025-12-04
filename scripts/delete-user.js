#!/usr/bin/env node
/**
 * Delete User Script
 * 
 * Usage:
 *   node scripts/delete-user.js --email "user@example.com"
 */

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
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

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`)
};

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      parsed.email = args[++i];
    } else if (args[i] === '--force' || args[i] === '-f') {
      parsed.force = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return parsed;
}

function showHelp() {
  console.log(`
${colors.bold}Delete User Script${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node scripts/delete-user.js --email <email> [--force]

${colors.yellow}Options:${colors.reset}
  --email <email>    Email of the user to delete
  --force, -f        Skip confirmation prompt
  --help, -h         Show this help message

${colors.yellow}Examples:${colors.reset}
  node scripts/delete-user.js --email "user@example.com"
  node scripts/delete-user.js --email "user@example.com" --force
`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function deleteUser(email, force) {
  console.log(`\n${colors.bold}${colors.cyan}Delete User - AI-Telle${colors.reset}\n`);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle');
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      log.error(`User with email "${email}" not found!`);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    console.log(`  User found:`);
    console.log(`  - Name: ${user.name}`);
    console.log(`  - Email: ${user.email}`);
    console.log(`  - Role: ${user.role}`);
    console.log(`  - Agents assigned: ${user.assignedAgentIds?.length || 0}`);
    console.log();
    
    if (user.role === 'admin') {
      log.warn('This user is an admin!');
      
      // Check if this is the last admin
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount === 1) {
        log.error('Cannot delete the last admin user!');
        log.info('Create another admin first, then delete this one.');
        await mongoose.disconnect();
        process.exit(1);
      }
    }
    
    if (!force) {
      const confirm = await prompt(`${colors.red}Are you sure you want to delete this user? (yes/N): ${colors.reset}`);
      
      if (confirm.toLowerCase() !== 'yes') {
        log.info('Deletion cancelled.');
        await mongoose.disconnect();
        return;
      }
    }
    
    await User.findByIdAndDelete(user._id);
    
    log.success(`User "${user.name}" (${user.email}) has been deleted.`);
    
  } catch (error) {
    log.error(`Failed to delete user: ${error.message}`);
  } finally {
    await mongoose.disconnect();
  }
}

async function main() {
  const args = parseArgs();
  
  if (!args.email) {
    log.error('Please provide an email address with --email');
    showHelp();
    process.exit(1);
  }
  
  await deleteUser(args.email, args.force);
}

main().catch(error => {
  log.error(`Script failed: ${error.message}`);
  process.exit(1);
});

