const { execSync } = require('child_process');
const { sendToPane, isPaneAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = async function interruptWorker(home, spaceName, workerName, opts = {}) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }

  if (!worker.paneId || !isPaneAlive(worker.paneId)) {
    console.error(`Error: Worker "${workerName}" pane is not alive`);
    process.exit(1);
  }

  execSync(`tmux send-keys -t ${worker.paneId} Escape`);
  console.log(`Sent interrupt to "${workerName}" (pane ${worker.paneId})`);

  if (opts.message) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    sendToPane(worker.paneId, opts.message);
    console.log(`Follow-up message sent`);
  }
};
