const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readWorkerRegistry } = require('../tmuxMessage');

/**
 * Restart a worker: kill it and re-spawn with the same config.
 * Preserves the original prompt, model, cwd, etc.
 */
module.exports = async function restartWorker(home, spaceName, workerName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const registry = readWorkerRegistry(home, spaceName);
  const worker = (registry.workers || []).find(w => w.name === workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }

  // Save config before killing
  const savedConfig = {
    prompt: worker.prompt || '',
    model: worker.model,
    cwd: worker.cwd,
    agentType: worker.agentType,
    color: worker.color,
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
