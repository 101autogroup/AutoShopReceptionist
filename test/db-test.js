/**
 * Database Connection Test Script
 * Run with: node test/db-test.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

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

async function testDatabaseConnection() {
  console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║         MongoDB Connection Test Suite              ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}`);

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-telle';
  
  log.info(`Connecting to: ${mongoUri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
  
  log.header('Testing: MongoDB Connection');
  
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000 // Timeout after 5 seconds
    });
    
    log.success('Connected to MongoDB successfully!');
    
    // Get database info
    const db = mongoose.connection.db;
    const admin = db.admin();
    
    // Get server info
    try {
      const serverInfo = await admin.serverInfo();
      console.log(`\n  Server info:`);
      console.log(`  - MongoDB version: ${serverInfo.version}`);
    } catch (e) {
      // May not have admin access
    }
    
    // List collections
    const collections = await db.listCollections().toArray();
    console.log(`\n  Collections in database:`);
    if (collections.length === 0) {
      console.log(`  - (No collections yet - they will be created when you add data)`);
    } else {
      collections.forEach(col => {
        console.log(`  - ${col.name}`);
      });
    }
    
    // Test User model
    log.header('Testing: User Model');
    
    const User = require('../models/User');
    
    // Count existing users
    const userCount = await User.countDocuments();
    log.success(`User model loaded successfully`);
    console.log(`  - Current user count: ${userCount}`);
    
    if (userCount > 0) {
      const users = await User.find().select('email name role createdAt').limit(5);
      console.log(`\n  Existing users:`);
      users.forEach((user, i) => {
        console.log(`  ${i + 1}. ${user.name} (${user.email}) - ${user.role}`);
      });
    }
    
    // Summary
    log.header('Test Summary');
    console.log(`  ${colors.green}✓${colors.reset} MongoDB Connection: Passed`);
    console.log(`  ${colors.green}✓${colors.reset} User Model: Passed`);
    
    console.log(`\n${colors.green}${colors.bold}Database tests passed! MongoDB is working correctly.${colors.reset}\n`);
    
  } catch (error) {
    log.error(`Database connection failed: ${error.message}`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log(`\n  ${colors.yellow}Tip: Make sure MongoDB is running.${colors.reset}`);
      console.log(`  - On macOS: brew services start mongodb-community`);
      console.log(`  - On Linux: sudo systemctl start mongod`);
      console.log(`  - On Windows: net start MongoDB`);
    }
    
    log.header('Test Summary');
    console.log(`  ${colors.red}✗${colors.reset} MongoDB Connection: Failed`);
    
    console.log(`\n${colors.red}${colors.bold}Database tests failed. Please check your MongoDB installation.${colors.reset}\n`);
    
  } finally {
    await mongoose.disconnect();
  }
}

testDatabaseConnection().catch(console.error);

