const fs = require('fs');
const path = require('path');
const { writeToInbox } = require('../inbox');

/**
 * Send a message to a specific worker's inbox.
 */
module.exports = async function messageWorker(home, spaceName, workerName, text) {
  if (!text) {
    console.error('Error: Message text is required');
    process.exit(1);
  }

  const configPath = path.join(home, 'spaces', spaceName, 'space.json');
  let spaceConfig;
  try {
    spaceConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    console.error(`Error: Space "${spaceName}" not found.`);
    process.exit(1);
  }

  // Verify worker exists in team config
  const teamConfigPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'config.json');
  try {
    const teamConfig = JSON.parse(fs.readFileSync(teamConfigPath, 'utf-8'));
    const member = (teamConfig.members || []).find(m => m.name === workerName);
    if (!member) {
      console.error(`Error: Worker "${workerName}" not found in space "${spaceName}"`);
      const names = (teamConfig.members || []).filter(m => m.name !== 'team-lead').map(m => m.name);
      if (names.length) console.error(`Available workers: ${names.join(', ')}`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: Team config not found for space "${spaceName}"`);
    process.exit(1);
  }

  const inboxPath = path.join(spaceConfig.claudeConfigDir, 'teams', spaceName, 'inboxes', `${workerName}.json`);
  try {
    await writeToInbox(inboxPath, {
      from: 'team-lead',
      text,
      color: 'blue',
      summary: text.slice(0, 80),
    });
    console.log(`Message sent to worker "${workerName}" in space "${spaceName}"`);
  } catch (err) {
    console.error(`Error sending message: ${err.message}`);
    process.exit(1);
  }
};
