const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getWorkerPane, isPaneAlive, sendToPane } = require('../tmuxMessage');

/**
 * Interrupt a worker by sending Escape to its tmux pane.
 * This cancels Claude's current generation. Optionally follow up with a new message.
 */
module.exports = async function interruptWorker(home, spaceName, workerName, opts = {}) {
  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  const result = getWorkerPane(home, spaceName, workerName);
  if (!result) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }

  if (!result.paneId || result.paneId === 'pending') {
    console.error(`Error: Worker "${workerName}" has no active tmux pane`);
    process.exit(1);
  }

  // Check pane is alive
  if (!isPaneAlive(result.paneId)) {
    console.error(`Error: Pane ${result.paneId} is not alive`);
    process.exit(1);
  }

  // Send Escape to cancel current generation
  execSync(`tmux send-keys -t ${result.paneId} Escape`);
  console.log(`Sent interrupt (Escape) to "${workerName}" (pane ${result.paneId})`);

  // If a follow-up message was provided, wait briefly then send via send-keys
  if (opts.message) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    sendToPane(result.paneId, opts.message);
    console.log(`Follow-up message sent to "${workerName}"`);
  }
};
