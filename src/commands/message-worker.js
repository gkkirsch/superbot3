const { sendToPane, isPaneAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = async function messageWorker(home, spaceName, workerName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    const workers = state.getWorkers(home, spaceName);
    if (workers.length) console.error(`Available workers: ${workers.map(w => w.name).join(', ')}`);
    process.exit(1);
  }

  if (!worker.paneId || !isPaneAlive(worker.paneId)) {
    console.error(`Error: Worker "${workerName}" pane is not alive`);
    process.exit(1);
  }

  try {
    sendToPane(worker.paneId, text);
    console.log(`Message sent to worker "${workerName}" in space "${spaceName}"`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
};
