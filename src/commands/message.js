const { sendToPane, getSpacePaneTarget, getMasterPaneTarget, isSpaceWindowAlive } = require('../tmuxMessage');
const state = require('../state');

module.exports = async function message(home, spaceName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  if (spaceName) {
    const space = state.getSpace(home, spaceName);
    if (!space) {
      console.error(`Error: Space "${spaceName}" not found.`);
      const spaces = state.getAllSpaces(home).filter(s => !s.archived);
      if (spaces.length) {
        console.error('Available spaces:');
        for (const s of spaces) console.error(`  - ${s.slug}`);
      }
      process.exit(1);
    }

    if (!isSpaceWindowAlive(spaceName)) {
      console.error(`Error: Space "${spaceName}" is not running`);
      process.exit(1);
    }

    try {
      sendToPane(getSpacePaneTarget(spaceName, home), text);
      console.log(`Message sent to space "${spaceName}"`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else {
    if (!isSpaceWindowAlive('master')) {
      console.error('Error: Master orchestrator is not running');
      process.exit(1);
    }
    try {
      sendToPane(getMasterPaneTarget(), text);
      console.log('Message sent to master');
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  }
};
