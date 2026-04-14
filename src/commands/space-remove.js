const { execSync } = require('child_process');
const fs = require('fs');
const state = require('../state');

module.exports = async function spaceRemove(home, name) {
  const space = state.getSpace(home, name);
  if (!space) {
    console.error(`Error: Space "${name}" not found.`);
    process.exit(1);
  }

  console.log(`Removing space "${name}"...`);

  // Stop the space first (kill tmux window)
  try {
    execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`);
    console.log(`  Stopped tmux window`);
  } catch {
    console.log(`  No tmux window running`);
  }

  // Remove from state
  state.removeSpace(home, name);
  console.log(`  Removed from state`);

  // Remove the space directory
  const spaceDir = state.spaceDir(home, name);
  if (fs.existsSync(spaceDir)) {
    fs.rmSync(spaceDir, { recursive: true, force: true });
    console.log(`  Removed directory: ${spaceDir}`);
  }

  console.log(`\nSpace "${name}" removed.`);
};
