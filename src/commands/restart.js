const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { launchSpace } = require('../launchSpace');

module.exports = function restart(home, spaceName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const tmuxSession = 'superbot3';

  // Kill existing window
  try {
    execSync(`tmux send-keys -t ${tmuxSession}:${spaceName} '/exit' Enter 2>/dev/null`);
    // Brief wait for graceful shutdown
    execSync('sleep 1');
  } catch {}

  // Force kill if still alive
  try {
    execSync(`tmux kill-window -t ${tmuxSession}:${spaceName} 2>/dev/null`);
  } catch {}

  // Get model from global config
  let model = 'claude-sonnet-4-6';
  const globalConfigPath = path.join(home, 'config.json');
  if (fs.existsSync(globalConfigPath)) {
    try {
      const gc = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      if (gc.model) model = gc.model;
    } catch {}
  }

  // Relaunch
  const ok = launchSpace(config, model, tmuxSession);
  if (ok) {
    console.log(`Space "${spaceName}" restarted.`);
  } else {
    console.error(`Failed to restart "${spaceName}".`);
    process.exit(1);
  }
};
