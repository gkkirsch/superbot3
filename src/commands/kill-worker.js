const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { readWorkerRegistry, writeWorkerRegistry } = require('../tmuxMessage');

/**
 * Kill a worker: destroy its tmux pane and remove from worker registry.
 */
module.exports = async function killWorker(home, spaceName, workerName) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const registry = readWorkerRegistry(home, spaceName);
  const worker = (registry.workers || []).find(w => w.name === workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const names = (registry.workers || []).map(w => w.name);
    if (names.length) console.error(`Available workers: ${names.join(', ')}`);
    process.exit(1);
  }

  // Kill tmux pane
  if (worker.paneId && worker.paneId !== 'pending') {
    try {
      execSync(`tmux kill-pane -t ${worker.paneId} 2>/dev/null`);
      console.log(`Killed tmux pane ${worker.paneId}`);
    } catch {
      console.log(`Pane ${worker.paneId} already dead`);
    }
  }

  // Remove from registry
  registry.workers = (registry.workers || []).filter(w => w.name !== workerName);
  writeWorkerRegistry(home, spaceName, registry);
  console.log(`Removed "${workerName}" from worker registry`);

  console.log(`Worker "${workerName}" killed.`);
};
