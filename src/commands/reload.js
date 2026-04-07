const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function reload(home) {
  console.log('Reloading superbot3 broker...');
  console.log('');

  // 1. Kill the current broker process
  const pidFile = path.join(home, '.tmp', 'broker.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf-8').trim();
    try {
      process.kill(parseInt(pid), 'SIGTERM');
      console.log(`  Stopped old broker (PID: ${pid})`);
      // Wait a moment for port to free
      await new Promise(r => setTimeout(r, 1000));
    } catch {
      console.log('  Old broker already stopped');
    }
    try { fs.unlinkSync(pidFile); } catch {}
  } else {
    console.log('  No broker PID file found');
  }

  // 2. Rebuild dashboard if source exists (in the code directory, not data)
  const codeDir = path.resolve(__dirname, '..', '..');
  const dashboardUiDir = path.join(codeDir, 'broker', 'dashboard-ui');
  if (fs.existsSync(path.join(dashboardUiDir, 'package.json'))) {
    console.log('  Rebuilding dashboard...');
    try {
      execSync('npm run build', { cwd: dashboardUiDir, stdio: 'pipe' });
      console.log('  Dashboard rebuilt');
    } catch (err) {
      console.log('  Dashboard build failed (using existing build)');
    }
  }

  // 3. Start a fresh broker (from the code directory)
  const serverPath = path.join(codeDir, 'broker', 'server.js');
  if (!fs.existsSync(serverPath)) {
    console.error('  Error: broker/server.js not found');
    process.exit(1);
  }

  const broker = spawn('node', [serverPath], {
    cwd: home,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, SUPERBOT3_HOME: home },
  });
  broker.unref();

  // Save PID
  fs.writeFileSync(pidFile, String(broker.pid), 'utf-8');
  console.log(`  Started new broker (PID: ${broker.pid})`);

  console.log('');
  console.log('Broker reloaded. Spaces and master are untouched.');
  console.log('Dashboard available at http://localhost:3100');
};
