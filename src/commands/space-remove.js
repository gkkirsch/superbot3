const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function spaceRemove(home, name, opts = {}) {
  const spaceDir = path.join(home, 'spaces', name);
  const configPath = path.join(spaceDir, 'space.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${name}" not found.`);
    process.exit(1);
  }

  console.log(`Removing space "${name}"...`);

  // Stop the space first (kill tmux window)
  try {
    execSync(`tmux kill-window -t superbot3:${name} 2>/dev/null`);
    console.log(`  Stopped tmux window for "${name}"`);
  } catch {
    console.log(`  No tmux window running for "${name}"`);
  }

  // Remove the space directory
  fs.rmSync(spaceDir, { recursive: true, force: true });
  console.log(`  Removed directory: ${spaceDir}`);

  console.log(`\nSpace "${name}" has been removed.`);
};
