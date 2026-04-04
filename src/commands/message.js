const fs = require('fs');
const path = require('path');
const { writeToInbox, getSpaceInboxPath, getMasterInboxPath } = require('../inbox');

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

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);
    try {
      await writeToInbox(inboxPath, {
        from: 'user',
        text: text,
        summary: text.slice(0, 80),
      });
      console.log(`Message sent to space "${spaceName}" (via inbox)`);
      console.log(`  Inbox: ${inboxPath}`);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  } else {
    // Message to master orchestrator
    const inboxPath = getMasterInboxPath(home);
    try {
      await writeToInbox(inboxPath, {
        from: 'user',
        text: text,
        summary: text.slice(0, 80),
      });
      console.log('Message sent to master orchestrator (via inbox)');
      console.log(`  Inbox: ${inboxPath}`);
    } catch (err) {
      console.error(`Error sending message: ${err.message}`);
      process.exit(1);
    }
  }
};
