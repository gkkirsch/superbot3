const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { writeToInbox, getSpaceInboxPath } = require('../inbox');

module.exports = async function stop(home, name, opts = {}) {
  const spaceDir = path.join(home, 'spaces', name);
  const configPath = path.join(spaceDir, 'space.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${name}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  console.log(`Stopping space "${name}"...`);

  if (opts.force) {
    // Force stop — kill tmux window immediately
    try {
      execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`);
      console.log(`  Killed tmux window for "${name}"`);
    } catch {
      console.log(`  No tmux window found for "${name}"`);
    }
  } else {
    // Graceful stop — send shutdown request to inbox
    const inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);

    try {
      const shutdownMsg = JSON.stringify({
        type: 'shutdown_request',
        requestId: `shutdown-${name}-${Date.now()}`,
        from: 'superbot3-cli',
        reason: 'Space stopping',
        timestamp: new Date().toISOString(),
      });

      await writeToInbox(inboxPath, {
        from: 'superbot3-cli',
        text: shutdownMsg,
        summary: 'Shutdown request',
      });
      console.log('  Sent shutdown request to inbox');
    } catch (err) {
      console.log(`  Could not send shutdown request: ${err.message}`);
    }

    // Wait up to 10 seconds for graceful shutdown
    console.log('  Waiting for graceful shutdown (10s timeout)...');
    let stopped = false;
    for (let i = 0; i < 20; i++) {
      try {
        const windows = execSync(`tmux list-windows -t superbot3 -F "#{window_name}" 2>/dev/null`, { encoding: 'utf-8' });
        if (!windows.split('\n').map(s => s.trim()).includes(name)) {
          stopped = true;
          break;
        }
      } catch {
        stopped = true;
        break;
      }
      execSync('sleep 0.5');
    }

    if (!stopped) {
      console.log('  Timeout — killing tmux window');
      try {
        execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`);
      } catch {}
    }
  }

  // Update space.json with stop time
  config.lastStopped = new Date().toISOString();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

  console.log(`  Space "${name}" stopped.`);
};
