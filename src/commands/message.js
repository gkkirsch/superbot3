const fs = require('fs');
const path = require('path');
const { sendToPane, getSpacePaneTarget, getMasterPaneTarget, isSpaceWindowAlive } = require('../tmuxMessage');

module.exports = async function message(home, spaceName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  if (spaceName) {
    // Message to a specific space
    const spaceDir = path.join(home, 'spaces', spaceName);
    const configPath = path.join(spaceDir, 'space.json');

    if (!fs.existsSync(configPath)) {
      console.error(`Error: Space "${spaceName}" not found.`);
      console.error(`Available spaces:`);
      const spacesDir = path.join(home, 'spaces');
      if (fs.existsSync(spacesDir)) {
        const entries = fs.readdirSync(spacesDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && fs.existsSync(path.join(spacesDir, entry.name, 'space.json'))) {
            console.error(`  - ${entry.name}`);
          }
        }
      }
      process.exit(1);
    }

    if (!isSpaceWindowAlive(spaceName)) {
      console.error(`Error: Space "${spaceName}" is not running (no tmux window found)`);
      process.exit(1);
    }

    try {
      const target = getSpacePaneTarget(spaceName);
      sendToPane(target, text);
      console.log(`Message sent to space "${spaceName}" (via tmux send-keys)`);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Message to master orchestrator
    if (!isSpaceWindowAlive('master')) {
      console.error('Error: Master orchestrator is not running (no tmux window found)');
      process.exit(1);
    }

    try {
      const target = getMasterPaneTarget();
      sendToPane(target, text);
      console.log('Message sent to master orchestrator (via tmux send-keys)');
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  }
};
