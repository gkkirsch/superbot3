const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readWorkerRegistry } = require('../tmuxMessage');

/**
 * List workers for a space (or all spaces).
 * Cross-references worker registry with tmux pane liveness.
 */
module.exports = function workers(home, spaceName) {
  const spacesDir = path.join(home, 'spaces');

  // Collect spaces to check
  let spaceNames;
  if (spaceName) {
    spaceNames = [spaceName];
  } else {
    try {
      spaceNames = fs.readdirSync(spacesDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(spacesDir, d.name, 'space.json')))
        .map(d => d.name);
    } catch {
      console.log('No spaces found.');
      return;
    }
  }

  // Get all live tmux pane IDs in one call
  const livePanes = new Set();
  try {
    const output = execSync('tmux list-panes -a -F "#{pane_id}" 2>/dev/null', { encoding: 'utf-8' });
    output.split('\n').filter(Boolean).forEach(id => livePanes.add(id.trim()));
  } catch {
    // tmux not running — all panes are dead
  }

  let totalWorkers = 0;

  for (const name of spaceNames) {
    const registry = readWorkerRegistry(home, name);
    const workers = registry.workers || [];
    if (workers.length === 0) continue;

    console.log(`\n  ${name}`);
    console.log('  ' + '─'.repeat(60));

    for (const w of workers) {
      const alive = w.paneId && w.paneId !== 'pending' && livePanes.has(w.paneId);
      const status = alive ? '● alive' : '○ dead';
      const uptime = w.spawnedAt ? timeSince(w.spawnedAt) : '?';
      const model = w.model || '?';
      const pane = w.paneId || 'none';

      console.log(`  ${status}  ${w.name}  pane=${pane}  model=${model}  up=${uptime}`);
      totalWorkers++;
    }
  }

  if (totalWorkers === 0) {
    console.log('No workers found.');
  }
};

function timeSince(epochMs) {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}
