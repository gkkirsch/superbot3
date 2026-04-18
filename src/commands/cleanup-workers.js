const state = require('../state');
const hibernateWorker = require('./hibernate-worker');

module.exports = async function cleanupWorkers(home, spaceName) {
  const workers = state.getWorkers(home, spaceName);
  const alive = workers.filter(w => w.status !== 'hibernated' && w.status !== 'dead');

  if (alive.length === 0) {
    console.log('No alive workers to clean up.');
    return;
  }

  console.log(`Hibernating ${alive.length} worker(s) in "${spaceName}"...`);
  for (const worker of alive) {
    try {
      await hibernateWorker(home, spaceName, worker.name);
    } catch (err) {
      console.error(`  Error hibernating "${worker.name}": ${err.message}`);
    }
  }
  console.log('Done.');
};
