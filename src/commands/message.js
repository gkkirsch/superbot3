const fs = require('fs');
const path = require('path');
const { writeToInbox, getSpaceInboxPath, getMasterInboxPath } = require('../inbox');

module.exports = async function message(home, spaceName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  let inboxPath;
  let target;

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
    inboxPath = getSpaceInboxPath(config.claudeConfigDir, config.slug);
    target = `space "${spaceName}"`;
  } else {
    // Message to master orchestrator
    inboxPath = getMasterInboxPath(home);
    target = 'master orchestrator';
  }

  try {
    await writeToInbox(inboxPath, {
      from: 'superbot3-cli',
      text: text,
      summary: text.slice(0, 80),
    });
    console.log(`Message sent to ${target}`);
    console.log(`  Inbox: ${inboxPath}`);
  } catch (err) {
    console.error(`Error sending message: ${err.message}`);
    process.exit(1);
  }
};
