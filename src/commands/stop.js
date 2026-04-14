const { execSync } = require('child_process');
const state = require('../state');

module.exports = async function stop(home, name, opts = {}) {
  const space = state.getSpace(home, name);
  if (!space) {
    console.error(`Error: Space "${name}" not found.`);
    process.exit(1);
  }

  console.log(`Stopping space "${name}"...`);

  if (opts.force) {
    try {
      execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`);
      console.log(`  Killed tmux window`);
    } catch {
      console.log(`  No tmux window found`);
    }
  } else {
    try {
      execSync(`tmux send-keys -t superbot3:${name} '/exit' Enter 2>/dev/null`);
      console.log('  Sent /exit');
    } catch {}

    console.log('  Waiting for graceful shutdown (10s)...');
    let stopped = false;
    for (let i = 0; i < 20; i++) {
      try {
        const windows = execSync(`tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
        if (!windows.split('\n').map(s => s.trim()).includes(name)) { stopped = true; break; }
      } catch { stopped = true; break; }
      execSync('sleep 0.5');
    }
    if (!stopped) {
      console.log('  Timeout — killing tmux window');
      try { execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`); } catch {}
    }
  }

  state.updateSpace(home, name, { paneId: null, lastStopped: new Date().toISOString() });
  console.log(`  Space "${name}" stopped.`);
};
