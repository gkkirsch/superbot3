const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = function update() {
  // The code lives wherever this file is — find the repo root
  const appDir = path.resolve(__dirname, '..', '..');

  console.log('Updating superbot3...');
  console.log(`  Code directory: ${appDir}`);
  console.log('');

  // 1. Pull latest code
  console.log('Pulling latest code...');
  try {
    execSync('git pull origin main', { cwd: appDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Error: git pull failed. Check your network connection and git status.');
    process.exit(1);
  }

  // 2. Install dependencies
  console.log('');
  console.log('Installing dependencies...');
  try {
    execSync('npm install --production', { cwd: appDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Error: npm install failed.');
    process.exit(1);
  }

  // 3. Rebuild dashboard
  const dashboardDir = path.join(appDir, 'broker', 'dashboard-ui');
  if (fs.existsSync(path.join(dashboardDir, 'package.json'))) {
    console.log('');
    console.log('Rebuilding dashboard...');
    try {
      execSync('npm install', { cwd: dashboardDir, stdio: 'inherit' });
      execSync('npm run build', { cwd: dashboardDir, stdio: 'inherit' });
    } catch (err) {
      console.error('Warning: Dashboard build failed. The previous build will still work.');
    }
  }

  console.log('');
  console.log('Updated successfully!');
  console.log('Run `superbot3 reload` to apply changes to the running broker.');
};
