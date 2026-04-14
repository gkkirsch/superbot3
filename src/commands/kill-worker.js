const { execSync } = require('child_process');
const state = require('../state');

module.exports = async function killWorker(home, spaceName, workerName) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const ws = state.getWorkers(home, spaceName);
    if (ws.length) console.error(`Available workers: ${ws.map(w => w.name).join(', ')}`);
    process.exit(1);
  }

  if (worker.paneId && worker.paneId !== 'pending') {
    try {
      execSync(`tmux kill-pane -t ${worker.paneId} 2>/dev/null`);
      console.log(`Killed tmux pane ${worker.paneId}`);
    } catch {
      console.log(`Pane ${worker.paneId} already dead`);
    }
  }

  state.removeWorker(home, spaceName, workerName);
  console.log(`Worker "${workerName}" killed.`);
};
