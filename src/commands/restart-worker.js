const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Restart a worker: kill it and re-spawn with the same config.
 * Preserves the original prompt, model, cwd, etc.
 */
module.exports = async function restartWorker(home, spaceName, workerName) {
  const spaceConfig = loadSpaceConfig(home, spaceName);
  if (!spaceConfig) return;

  const teamConfigPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'config.json');
  let teamConfig;
  try {
    teamConfig = JSON.parse(fs.readFileSync(teamConfigPath, 'utf-8'));
  } catch {
    console.error(`Error: Team config not found for space "${spaceName}"`);
    process.exit(1);
  }

  const member = (teamConfig.members || []).find(m => m.name === workerName);
  if (!member) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }

  // Save config before killing
  const savedConfig = {
    prompt: member.prompt || '',
    model: member.model,
    cwd: member.cwd,
    agentType: member.agentType,
    color: member.color,
  };

  console.log(`Restarting worker "${workerName}"...`);

  // Kill it
  const killWorker = require('./kill-worker');
  await killWorker(home, spaceName, workerName);

  // Re-spawn with same config via the existing spawn-worker command
  const spawnWorker = require('./spawn-worker');
  const opts = {
    model: savedConfig.model,
    cwd: savedConfig.cwd,
    type: savedConfig.agentType,
    color: savedConfig.color,
  };

  // Small delay to let tmux clean up the pane
  await new Promise(resolve => setTimeout(resolve, 500));

  spawnWorker(home, spaceName, workerName, savedConfig.prompt, opts);
  console.log(`Worker "${workerName}" restarted.`);
};

function loadSpaceConfig(home, spaceName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }
}
