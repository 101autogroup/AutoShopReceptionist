/**
 * Run All Tests
 * Run with: node test/run-all.js
 */

const { spawn } = require('child_process');
const path = require('path');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

console.log(`\n${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}║          AI-Telle Complete Test Suite              ║${colors.reset}`);
console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}\n`);

const tests = [
  { name: 'Database Tests', file: 'db-test.js' },
  { name: 'API Tests', file: 'api-test.js' }
];

async function runTest(test) {
  return new Promise((resolve) => {
    console.log(`${colors.yellow}Running: ${test.name}${colors.reset}`);
    console.log('═'.repeat(52));
    
    const child = spawn('node', [path.join(__dirname, test.file)], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
    
    child.on('error', (error) => {
      console.error(`Error running ${test.name}:`, error.message);
      resolve(false);
    });
  });
}

async function runAllTests() {
  const results = [];
  
  for (const test of tests) {
    const success = await runTest(test);
    results.push({ ...test, success });
    console.log('\n');
  }
  
  // Final summary
  console.log(`${colors.bold}${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}║                 Final Summary                      ║${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  results.forEach(result => {
    const icon = result.success ? `${colors.green}✓` : `${colors.red}✗`;
    const status = result.success ? 'Passed' : 'Failed';
    console.log(`  ${icon}${colors.reset} ${result.name}: ${status}`);
  });
  
  const allPassed = results.every(r => r.success);
  
  if (allPassed) {
    console.log(`\n${colors.green}${colors.bold}All test suites passed! Your application is ready to use.${colors.reset}\n`);
  } else {
    console.log(`\n${colors.yellow}${colors.bold}Some tests failed. Please fix the issues above.${colors.reset}\n`);
  }
}

runAllTests();

