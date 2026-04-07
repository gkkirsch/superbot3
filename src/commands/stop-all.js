const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getSpaces } = require('./space-list');

module.exports = async function stopAll(home) {
  console.log('Stopping superbot3...');
  console.log('');

  // Stop all spaces
  const spaces = getSpaces(home);
  for (const space of spaces) {
    try {
      const windows = execSync(`tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
      if (windows.split('\n').map(s => s.trim()).includes(space.slug)) {
        execSync(`tmux kill-window -t superbot3:${space.slug} 2>/dev/null`);
        console.log(`  Stopped space "${space.slug}"`);

        // Update space.json
        const configPath = path.join(home, 'spaces', space.slug, 'space.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.lastStopped = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      }
    } catch {}
  }

  // Kill tmux session (takes master with it)
  try {
    execSync('tmux kill-session -t superbot3 2>/dev/null');
    console.log('  Stopped master orchestrator (tmux session killed)');
  } catch {
    console.log('  No tmux session found');
  }

  // Stop broker
  const pidFile = path.join(home, '.tmp', 'broker.pid');
  if (fs.existsSync(pidFile)) {
    const pid = fs.readFileSync(pidFile, 'utf-8').trim();
    try {
      process.kill(parseInt(pid), 'SIGTERM');
      console.log(`  Stopped broker (PID: ${pid})`);
    } catch {
      console.log('  Broker process not found (already stopped?)');
    }
    fs.unlinkSync(pidFile);
  } else {
    console.log('  No broker PID file found');
  }

  console.log('');
  console.log('superbot3 stopped.');
};
