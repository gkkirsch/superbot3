const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * List workers for a space (or all spaces).
 * Cross-references team config members with tmux pane liveness.
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
    const configPath = path.join(spacesDir, name, 'space.json');
    let spaceConfig;
    try {
      spaceConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      continue;
    }

    const teamConfigPath = path.join(spaceConfig.claudeConfigDir, 'teams', name, 'config.json');
    let teamConfig;
    try {
      teamConfig = JSON.parse(fs.readFileSync(teamConfigPath, 'utf-8'));
    } catch {
      continue;
    }

    // Filter to non-lead members (workers)
    const members = (teamConfig.members || []).filter(m => m.name !== 'team-lead');
    if (members.length === 0) continue;

    console.log(`\n  ${name}`);
    console.log('  ' + '─'.repeat(60));

    for (const m of members) {
      const alive = m.tmuxPaneId && m.tmuxPaneId !== 'pending' && livePanes.has(m.tmuxPaneId);
      const status = alive ? '● alive' : '○ dead';
      const uptime = m.joinedAt ? timeSince(m.joinedAt) : '?';
      const model = m.model || '?';
      const pane = m.tmuxPaneId || 'none';

      console.log(`  ${status}  ${m.name}  pane=${pane}  model=${model}  up=${uptime}`);
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
