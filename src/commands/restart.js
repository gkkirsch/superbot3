const { execSync } = require('child_process');
const { launchSpace } = require('../launchSpace');
const state = require('../state');

module.exports = function restart(home, spaceName) {
  const space = state.getSpace(home, spaceName);
  if (!space) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  // Kill existing window
  try {
    execSync(`tmux send-keys -t superbot3:${spaceName} '/exit' Enter 2>/dev/null`);
    execSync('sleep 1');
  } catch {}
  try {
    execSync(`tmux kill-window -t superbot3:${spaceName} 2>/dev/null`);
  } catch {}

  // Relaunch
  const ok = launchSpace(home, spaceName);
  if (ok) {
    console.log(`Space "${spaceName}" restarted.`);
  } else {
    console.error(`Failed to restart "${spaceName}".`);
    process.exit(1);
  }
};
