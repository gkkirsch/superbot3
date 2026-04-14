const { capturePaneOutput, getSpacePaneTarget, isPaneAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = function peek(home, spaceName, workerName) {
  const space = state.getSpace(home, spaceName);
  if (!space) {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  let target;
  let label;

  if (workerName) {
    const worker = state.getWorker(home, spaceName, workerName);
    if (!worker) {
      console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
      process.exit(1);
    }
    if (!worker.paneId || !isPaneAlive(worker.paneId)) {
      console.error(`Error: Worker "${workerName}" pane is not alive`);
      process.exit(1);
    }
    target = worker.paneId;
    label = `${spaceName}/${workerName}`;
  } else {
    target = getSpacePaneTarget(spaceName);
    label = spaceName;
  }

  const output = capturePaneOutput(target, 50);
  if (output === null) {
    console.error(`Error: Could not capture output from "${label}"`);
    process.exit(1);
  }

  console.log(`── ${label} ──`);
  console.log(output);
};
