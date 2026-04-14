const fs = require('fs');
const path = require('path');
const { sendToPane, getWorkerPane, isPaneAlive, readWorkerRegistry } = require('../tmuxMessage');

/**
 * Send a message to a specific worker via tmux send-keys.
 */
module.exports = async function messageWorker(home, spaceName, workerName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const result = getWorkerPane(home, spaceName, workerName);
  if (!result) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const registry = readWorkerRegistry(home, spaceName);
    const names = (registry.workers || []).map(w => w.name);
    if (names.length) console.error(`Available workers: ${names.join(', ')}`);
    process.exit(1);
  }

  if (!isPaneAlive(result.paneId)) {
    console.error(`Error: Worker "${workerName}" pane ${result.paneId} is not alive`);
    process.exit(1);
  }

  try {
    sendToPane(result.paneId, text);
    console.log(`Message sent to worker "${workerName}" in space "${spaceName}" (via tmux send-keys)`);
  } catch (err) {
    console.error(`Error sending message: ${err.message}`);
    process.exit(1);
  }
};
