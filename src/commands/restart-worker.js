const state = require('../state');

module.exports = async function restartWorker(home, spaceName, workerName) {
  const worker = state.getWorker(home, spaceName, workerName);
  if (!worker) {
    console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
    process.exit(1);
  }

  const savedConfig = {
    prompt: worker.prompt || '',
    model: worker.model,
    cwd: worker.cwd,
    agentType: worker.agentType,
    color: worker.color,
  };

  console.log(`Restarting worker "${workerName}"...`);

  const killWorker = require('./kill-worker');
  await killWorker(home, spaceName, workerName);

  await new Promise(resolve => setTimeout(resolve, 500));

  const spawnWorker = require('./spawn-worker');
  spawnWorker(home, spaceName, workerName, savedConfig.prompt, {
    model: savedConfig.model,
    cwd: savedConfig.cwd,
    type: savedConfig.agentType,
    color: savedConfig.color,
  });
  console.log(`Worker "${workerName}" restarted.`);
};
