#!/usr/bin/env node
/**
 * Create Admin User Script
 * 
 * Usage:
 *   node scripts/create-admin.js
 *   node scripts/create-admin.js --name "John Doe" --email "admin@example.com" --password "securepass123"
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

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      parsed.name = args[++i];
    } else if (args[i] === '--email' && args[i + 1]) {
      parsed.email = args[++i];
    } else if (args[i] === '--password' && args[i + 1]) {
      parsed.password = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      showHelp();
      process.exit(0);
    }
  }
  
  return parsed;
}

function showHelp() {
  console.log(`
${colors.bold}Create Admin User Script${colors.reset}

${colors.yellow}Usage:${colors.reset}
  node scripts/create-admin.js                    Interactive mode
  node scripts/create-admin.js [options]          With arguments

${colors.yellow}Options:${colors.reset}
  --name <name>         Full name of the admin user
  --email <email>       Email address (must be unique)
  --password <pass>     Password (min 8 characters)
  --help, -h            Show this help message

${colors.yellow}Examples:${colors.reset}
  node scripts/create-admin.js
  node scripts/create-admin.js --name "Admin User" --email "admin@company.com" --password "securepass123"
`);
}

// Create readline interface for interactive mode
function createReadline() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Prompt for input
function prompt(rl, question, hidden = false) {
  return new Promise((resolve) => {
    if (hidden) {
      // For password, we use a workaround since readline doesn't support hidden input natively
      process.stdout.write(question);
      const stdin = process.stdin;
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding('utf8');
      
      let password = '';
      const onData = (char) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          stdin.setRawMode(false);
          stdin.removeListener('data', onData);
          console.log();
          resolve(password);
        } else if (char === '\u0003') {
          // Ctrl+C
          process.exit();
        } else if (char === '\u007F' || char === '\b') {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          password += char;
          process.stdout.write('*');
        }
      };
      
      stdin.on('data', onData);
    } else {
      rl.question(question, resolve);
    }
  });
}

// Validate email format
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

async function createAdmin(userData) {
  // Connect to database
  log.info('Connecting to database...');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle');
    log.success('Connected to MongoDB');
  } catch (error) {
    log.error(`Failed to connect to database: ${error.message}`);
    process.exit(1);
  }
  
  try {
    // Check if email already exists
    const existing = await User.findOne({ email: userData.email.toLowerCase() });
    if (existing) {
      log.error(`User with email "${userData.email}" already exists!`);
      
      if (existing.role === 'admin') {
        log.info('This user is already an admin.');
      } else {
        log.warn('This user exists but is not an admin.');
        const rl = createReadline();
        const upgrade = await prompt(rl, 'Do you want to upgrade this user to admin? (y/N): ');
        rl.close();
        
        if (upgrade.toLowerCase() === 'y' || upgrade.toLowerCase() === 'yes') {
          existing.role = 'admin';
          await existing.save();
          log.success(`User "${existing.name}" has been upgraded to admin!`);
        }
      }
      
      await mongoose.disconnect();
      return;
    }
    
    // Create admin user
    const admin = new User({
      name: userData.name,
      email: userData.email.toLowerCase(),
      passwordHash: userData.password, // Will be hashed by pre-save hook
      role: 'admin'
    });
    
    await admin.save();
    
    console.log(`\n${colors.green}${colors.bold}Admin user created successfully!${colors.reset}\n`);
    console.log(`  ${colors.cyan}Name:${colors.reset}  ${admin.name}`);
    console.log(`  ${colors.cyan}Email:${colors.reset} ${admin.email}`);
    console.log(`  ${colors.cyan}Role:${colors.reset}  ${admin.role}`);
    console.log(`\n  You can now login at ${colors.cyan}http://localhost:3000/login${colors.reset}\n`);
    
  } catch (error) {
    log.error(`Failed to create admin: ${error.message}`);
  } finally {
    await mongoose.disconnect();
  }
}

async function interactiveMode() {
  console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║           Create Admin User - AI-Telle             ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  const rl = createReadline();
  
  try {
    // Get name
    let name = '';
    while (!name.trim()) {
      name = await prompt(rl, `${colors.cyan}Full Name:${colors.reset} `);
      if (!name.trim()) {
        log.warn('Name is required');
      }
    }
    
    // Get email
    let email = '';
    while (!isValidEmail(email)) {
      email = await prompt(rl, `${colors.cyan}Email:${colors.reset} `);
      if (!isValidEmail(email)) {
        log.warn('Please enter a valid email address');
      }
    }
    
    rl.close();
    
    // Get password (hidden input)
    let password = '';
    while (password.length < 8) {
      password = await prompt(null, `${colors.cyan}Password:${colors.reset} `, true);
      if (password.length < 8) {
        log.warn('Password must be at least 8 characters');
      }
    }
    
    // Confirm password
    const confirmPassword = await prompt(null, `${colors.cyan}Confirm Password:${colors.reset} `, true);
    
    if (password !== confirmPassword) {
      log.error('Passwords do not match!');
      process.exit(1);
    }
    
    console.log();
    
    await createAdmin({ name, email, password });
    
  } catch (error) {
    rl.close();
    throw error;
  }
}

async function main() {
  const args = parseArgs();
  
  // Check if we have all arguments for non-interactive mode
  if (args.name && args.email && args.password) {
    // Validate inputs
    if (!args.name.trim()) {
      log.error('Name cannot be empty');
      process.exit(1);
    }
    
    if (!isValidEmail(args.email)) {
      log.error('Invalid email format');
      process.exit(1);
    }
    
    if (args.password.length < 8) {
      log.error('Password must be at least 8 characters');
      process.exit(1);
    }
    
    await createAdmin(args);
  } else if (Object.keys(args).length > 0) {
    // Partial arguments provided
    log.error('Please provide all required arguments: --name, --email, --password');
    log.info('Or run without arguments for interactive mode');
    showHelp();
    process.exit(1);
  } else {
    // Interactive mode
    await interactiveMode();
  }
}

main().catch(error => {
  log.error(`Script failed: ${error.message}`);
  process.exit(1);
});

