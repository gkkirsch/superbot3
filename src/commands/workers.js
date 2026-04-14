const { execSync } = require('child_process');
const { isPaneAlive, getPaneInfo } = require('../tmuxMessage');
const state = require('../state');

module.exports = function workers(home, spaceName) {
  const spaces = spaceName
    ? [state.getSpace(home, spaceName)].filter(Boolean)
    : state.getAllSpaces(home).filter(s => !s.archived);

  if (!spaces.length) {
    console.log(spaceName ? `Space "${spaceName}" not found.` : 'No spaces found.');
    return;
  }

  let total = 0;
  for (const space of spaces) {
    const ws = space.workers || [];
    if (!ws.length) continue;

    console.log(`\n  ${space.slug}`);
    console.log('  ' + '─'.repeat(60));

    for (const w of ws) {
      const alive = w.paneId && isPaneAlive(w.paneId);
      const status = alive ? '● alive' : '○ dead';
      const info = w.paneId ? getPaneInfo(w.paneId) : null;
      const uptime = w.spawnedAt ? timeSince(w.spawnedAt) : '?';
      const pid = info ? `  pid=${info.pid}` : '';
      console.log(`  ${status}  ${w.name}  pane=${w.paneId || 'none'}  model=${w.model || '?'}  up=${uptime}${pid}`);
      total++;
    }
  }

  if (total === 0) console.log('No workers found.');
};

function timeSince(epochMs) {
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
